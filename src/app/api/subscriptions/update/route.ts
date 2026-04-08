export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { todayKST } from '@/lib/day'

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
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
      .select('id, status, device_id, start_date, end_date, last_sent_day, duration_days, memo, customer_id, paused_at, paused_days')
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
      const today = todayKST()
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
      // end_date는 저장하지 않음 — computed_end_date로 매번 계산
    }
    if (updates.product_id !== undefined) updateData.product_id = updates.product_id
    if (updates.memo !== undefined) updateData.memo = updates.memo
    if (updates.send_priority !== undefined) updateData.send_priority = updates.send_priority
    if (updates.resume_date !== undefined) {
      updateData.resume_date = updates.resume_date
    }
    // last_sent_day 직접 지정 (Day 수동 지정) — 벌크 지원
    if (updates.last_sent_day !== undefined) {
      const newLastSentDay = Number(updates.last_sent_day)
      if (newLastSentDay < 0) {
        return NextResponse.json({ error: 'last_sent_day는 0 이상이어야 합니다' }, { status: 400 })
      }
      // 각 구독의 duration_days 범위 체크
      for (const subId of targetIds) {
        const prev = prevMap.get(subId)
        if (prev && newLastSentDay > prev.duration_days) {
          return NextResponse.json({ error: `last_sent_day는 ${prev.duration_days} 이하여야 합니다` }, { status: 400 })
        }
      }
      updateData.last_sent_day = newLastSentDay
      // old failed 큐 정리 (day_number <= 새 값)
      for (const subId of targetIds) {
        await supabase
          .from('send_queues')
          .delete()
          .eq('subscription_id', subId)
          .eq('status', 'failed')
          .lte('day_number', newLastSentDay)
      }
    }
    // last_sent_day 상대 조정 (day_adjust: 양수/음수 모두 가능) — 벌크 지원
    if (updates.day_adjust !== undefined) {
      const adjust = Number(updates.day_adjust)
      if (!Number.isInteger(adjust) || adjust === 0) {
        return NextResponse.json({ error: 'day_adjust는 0이 아닌 정수여야 합니다' }, { status: 400 })
      }
      // 벌크: 각 구독별로 개별 업데이트 필요 (현재 last_sent_day가 다르므로)
      for (const subId of targetIds) {
        const prev = prevMap.get(subId)
        if (prev) {
          const newDay = Math.max(0, (prev.last_sent_day ?? 0) + adjust)
          const perUpdate: Record<string, unknown> = {
            last_sent_day: newDay,
            updated_at: new Date().toISOString(),
          }
          await supabase.from('subscriptions').update(perUpdate).eq('id', subId)
          await logChange(subId, 'day_adjust', 'last_sent_day', String(prev.last_sent_day ?? 0), String(newDay), session.userId, `Day 조정: ${adjust > 0 ? '+' : ''}${adjust}`)
        }
      }
      // day_adjust는 개별 처리했으므로 공통 update 건너뛰기
      return NextResponse.json({ success: true, count: targetIds.length })
    }

    const { error } = await supabase
      .from('subscriptions')
      .update(updateData)
      .in('id', targetIds)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // 취소 시 당일 이후 pending 큐 삭제 (발송 방지)
    if (updates.status === 'cancel') {
      await supabase
        .from('send_queues')
        .delete()
        .in('subscription_id', targetIds)
        .eq('status', 'pending')
    }

    // Fix end_date + paused_days individually for pause→live transitions
    if (updates.status === 'live') {
      const todayDateStr = todayKST()
      for (const subId of targetIds) {
        const prev = prevMap.get(subId)
        if (prev?.status === 'pause' && prev.paused_at) {
          // KST 자정 기준 일수 계산 (daily-update와 통일)
          const pausedAtKST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(prev.paused_at))
          const pauseStart = new Date(pausedAtKST + 'T00:00:00Z')
          const todayMidnight = new Date(todayDateStr + 'T00:00:00Z')
          const pauseDays = Math.max(0, Math.floor((todayMidnight.getTime() - pauseStart.getTime()) / 86400000))
          const updateFields: Record<string, unknown> = {
            paused_days: (prev.paused_days ?? 0) + pauseDays,
          }

          await supabase.from('subscriptions').update(updateFields).eq('id', subId)
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
      if (updates.product_id !== undefined) {
        await logChange(subId, 'product_change', 'product_id',
          null, updates.product_id, session.userId)
      }
      if (updates.last_sent_day !== undefined && prev.last_sent_day !== updates.last_sent_day) {
        await logChange(subId, 'day_set', 'last_sent_day',
          String(prev.last_sent_day ?? 0), String(updates.last_sent_day),
          session.userId, `Day 직접 설정`)
      }
    }

    return NextResponse.json({ ok: true, updated: targetIds.length })
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
