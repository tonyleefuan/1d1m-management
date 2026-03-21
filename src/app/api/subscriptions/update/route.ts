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

    // 변경 전 상태 조회 (로그용 + 검증용)
    const { data: prevSubs } = await supabase
      .from('subscriptions')
      .select('id, status, device_id, start_date, end_date, day, duration_days, friend_confirmed, memo, customer_id, paused_at')
      .in('id', targetIds)
    const prevMap = new Map(prevSubs?.map(s => [s.id, s]) || [])

    // 상태 전환 유효성 검증
    const VALID_TRANSITIONS: Record<string, string[]> = {
      pending: ['live', 'pause', 'cancel'],
      live: ['pending', 'pause', 'archive', 'cancel'],
      pause: ['pending', 'live', 'cancel'],
      archive: [],  // archive에서는 전환 불가
      cancel: [],   // cancel에서는 전환 불가
    }

    if (updates.status !== undefined) {
      const today = new Date().toISOString().slice(0, 10)
      for (const subId of targetIds) {
        const prev = prevMap.get(subId)
        if (!prev) continue
        const allowed = VALID_TRANSITIONS[prev.status] || []
        if (!allowed.includes(updates.status)) {
          return NextResponse.json(
            { error: `${STATUS_LABELS[prev.status] || prev.status} → ${STATUS_LABELS[updates.status] || updates.status} 전환은 허용되지 않습니다` },
            { status: 400 }
          )
        }
        // pending → live: 시작일이 도래해야만 가능
        if (updates.status === 'live' && prev.status === 'pending') {
          if (!prev.start_date || prev.start_date > today) {
            return NextResponse.json(
              { error: `시작일(${prev.start_date || '미설정'})이 아직 도래하지 않아 발송중으로 변경할 수 없습니다` },
              { status: 400 }
            )
          }
        }
      }
    }

    // start_date 변경은 pending 상태에서만 허용
    if (updates.start_date !== undefined) {
      for (const subId of targetIds) {
        const prev = prevMap.get(subId)
        if (prev && prev.status !== 'pending') {
          return NextResponse.json(
            { error: '시작일은 대기 상태에서만 변경할 수 있습니다' },
            { status: 400 }
          )
        }
      }
    }

    // 디바이스 이름 조회 (로그용)
    let deviceNames: Record<string, string> = {}
    if (updates.device_id !== undefined) {
      const { data: devs } = await supabase.from('send_devices').select('id, name, phone_number')
      devs?.forEach(d => { deviceNames[d.id] = d.name || d.phone_number })
    }

    const updateData: any = { updated_at: new Date().toISOString() }

    if (updates.status !== undefined) {
      updateData.status = updates.status
      if (updates.status === 'pause') {
        updateData.paused_at = new Date().toISOString()
        if (updates.resume_date) {
          updateData.resume_date = updates.resume_date
        }
      }
      if (updates.status === 'cancel') {
        updateData.cancelled_at = new Date().toISOString()
        updateData.cancel_reason = updates.cancel_reason || null
      }
      if (updates.status === 'live') {
        updateData.paused_at = null
        updateData.resume_date = null
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
    if (updates.send_priority !== undefined) updateData.send_priority = updates.send_priority
    if (updates.last_send_failure !== undefined) {
      updateData.last_send_failure = updates.last_send_failure
      // If clearing failure (setting to null), transition back to live
      if (updates.last_send_failure === null) {
        updateData.status = 'live'
      }
    }
    if (updates.resume_date !== undefined) {
      updateData.resume_date = updates.resume_date
    }
    // day 수동 조정 (+1 또는 -1)
    if (updates.day_adjust !== undefined && targetIds.length === 1) {
      const adjust = updates.day_adjust // +1 또는 -1
      if (adjust !== 1 && adjust !== -1) {
        return NextResponse.json({ error: 'day 조정은 +1 또는 -1만 가능합니다' }, { status: 400 })
      }
      const prev = prevMap.get(targetIds[0])
      if (prev) {
        const newDay = prev.day + adjust
        if (newDay < 1) {
          return NextResponse.json({ error: 'day는 1 미만이 될 수 없습니다' }, { status: 400 })
        }
        updateData.day = newDay
        // end_date도 같이 조정
        if (prev.end_date) {
          const newEnd = new Date(prev.end_date)
          newEnd.setDate(newEnd.getDate() - adjust) // day +1이면 end_date -1, day -1이면 end_date +1
          updateData.end_date = newEnd.toISOString().slice(0, 10)
        }
      }
    }

    const { error } = await supabase
      .from('subscriptions')
      .update(updateData)
      .in('id', targetIds)

    // Fix end_date individually for pause→live transitions
    if (updates.status === 'live') {
      for (const subId of targetIds) {
        const prev = prevMap.get(subId)
        if (prev?.status === 'pause' && prev.paused_at && prev.end_date) {
          const pausedAt = new Date(prev.paused_at)
          const endDate = new Date(prev.end_date)
          const now = new Date()
          const pauseDays = Math.ceil((now.getTime() - pausedAt.getTime()) / (1000 * 60 * 60 * 24))
          const newEnd = new Date(endDate)
          newEnd.setDate(newEnd.getDate() + pauseDays)
          await supabase
            .from('subscriptions')
            .update({ end_date: newEnd.toISOString().slice(0, 10) })
            .eq('id', subId)
        }
      }
    }

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
      if (updates.day_adjust !== undefined) {
        await logChange(subId, 'day_adjust', 'day',
          String(prev.day), String(prev.day + updates.day_adjust),
          session.userId)
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
