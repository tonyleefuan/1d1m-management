import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

// ─── 히스토리 로그 헬퍼 ─────────────────────────
async function logChange(
  subscriptionId: string,
  action: string,
  fieldName: string | null,
  oldValue: string | null,
  newValue: string | null,
  userId: string | null,
  memo?: string,
) {
  await supabase.from('subscription_logs').insert({
    subscription_id: subscriptionId,
    action,
    field_name: fieldName,
    old_value: oldValue,
    new_value: newValue,
    created_by: userId,
    memo: memo || null,
  })
}

const STATUS_LABELS: Record<string, string> = {
  live: '발송중', pending: '대기', pause: '일시정지', archive: '종료', cancel: '취소',
}

export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { id, ids, ...updates } = body

    const targetIds = ids || (id ? [id] : [])
    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'ID가 필요합니다' }, { status: 400 })
    }

    // 변경 전 상태 조회 (로그용)
    const { data: prevSubs } = await supabase
      .from('subscriptions')
      .select('id, status, device_id, start_date, friend_confirmed, memo, customer_id')
      .in('id', targetIds)
    const prevMap = new Map(prevSubs?.map(s => [s.id, s]) || [])

    // 디바이스 이름 조회 (로그용)
    let deviceNames: Record<string, string> = {}
    if (updates.device_id !== undefined) {
      const { data: devs } = await supabase.from('send_devices').select('id, name, phone_number')
      devs?.forEach(d => { deviceNames[d.id] = d.name || d.phone_number })
    }

    const updateData: any = { updated_at: new Date().toISOString() }

    if (updates.status !== undefined) {
      updateData.status = updates.status
      if (updates.status === 'pause') updateData.paused_at = new Date().toISOString()
      if (updates.status === 'cancel') {
        updateData.cancelled_at = new Date().toISOString()
        updateData.cancel_reason = updates.cancel_reason || null
      }
      if (updates.status === 'live' && updates.start_date === undefined) {
        updateData.paused_at = null
      }
    }
    if (updates.device_id !== undefined) updateData.device_id = updates.device_id
    if (updates.start_date !== undefined) {
      updateData.start_date = updates.start_date
      if (updates.start_date && targetIds.length === 1) {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('duration_days')
          .eq('id', targetIds[0])
          .single()
        if (sub) {
          const startDate = new Date(updates.start_date)
          const endDate = new Date(startDate)
          endDate.setDate(endDate.getDate() + sub.duration_days - 1)
          updateData.end_date = endDate.toISOString().slice(0, 10)
        }
      }
    }
    if (updates.friend_confirmed !== undefined) {
      updateData.friend_confirmed = updates.friend_confirmed
      if (updates.friend_confirmed) {
        updateData.friend_confirmed_at = new Date().toISOString()
      } else {
        updateData.friend_confirmed_at = null
      }
    }
    if (updates.memo !== undefined) updateData.memo = updates.memo

    const { error } = await supabase
      .from('subscriptions')
      .update(updateData)
      .in('id', targetIds)

    // kakao_friend_name 업데이트
    if (updates.kakao_friend_name !== undefined && targetIds.length === 1) {
      const prev = prevMap.get(targetIds[0])
      if (prev) {
        await supabase
          .from('customers')
          .update({ kakao_friend_name: updates.kakao_friend_name || null })
          .eq('id', prev.customer_id)
      }
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // ─── 히스토리 로그 기록 ─────────────────────────
    for (const subId of targetIds) {
      const prev = prevMap.get(subId)
      if (!prev) continue

      if (updates.status !== undefined && prev.status !== updates.status) {
        await logChange(subId, 'status_change', 'status',
          STATUS_LABELS[prev.status] || prev.status,
          STATUS_LABELS[updates.status] || updates.status,
          session.userId,
          updates.cancel_reason || undefined,
        )
      }
      if (updates.device_id !== undefined && prev.device_id !== updates.device_id) {
        await logChange(subId, 'device_change', 'device_id',
          prev.device_id ? (deviceNames[prev.device_id] || prev.device_id) : '미배정',
          updates.device_id ? (deviceNames[updates.device_id] || updates.device_id) : '미배정',
          session.userId,
        )
      }
      if (updates.friend_confirmed !== undefined && prev.friend_confirmed !== updates.friend_confirmed) {
        await logChange(subId, 'friend_confirmed', 'friend_confirmed',
          prev.friend_confirmed ? '확인' : '미확인',
          updates.friend_confirmed ? '확인' : '미확인',
          session.userId,
        )
      }
      if (updates.memo !== undefined && prev.memo !== updates.memo) {
        await logChange(subId, 'memo_update', 'memo', prev.memo, updates.memo, session.userId)
      }
      if (updates.start_date !== undefined && prev.start_date !== updates.start_date) {
        await logChange(subId, 'start_date_change', 'start_date',
          prev.start_date || '-', updates.start_date || '-', session.userId)
      }
      if (updates.kakao_friend_name !== undefined) {
        await logChange(subId, 'kakao_name_change', 'kakao_friend_name',
          null, updates.kakao_friend_name, session.userId)
      }
    }

    // 친구확인 시 customer phone_expires_at
    if (updates.friend_confirmed === true) {
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('customer_id')
        .in('id', targetIds)
      if (subs?.length) {
        const customerIds = Array.from(new Set(subs.map(s => s.customer_id)))
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7)
        await supabase
          .from('customers')
          .update({ phone_expires_at: expiresAt.toISOString() })
          .in('id', customerIds)
      }
    }

    return NextResponse.json({ ok: true, updated: targetIds.length })
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
