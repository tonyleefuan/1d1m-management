import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { todayKST } from '@/lib/day'

export async function POST(req: Request) {
  const body = await req.json()
  const { device_id, date, results } = body

  if (!device_id || !results?.length) {
    return NextResponse.json({ error: 'device_id and results required' }, { status: 400 })
  }

  // 입력 검증
  if (results.length > 10000) {
    return NextResponse.json({ error: 'Too many results (max 10000)' }, { status: 400 })
  }

  const validStatuses = new Set(['sent', 'failed'])
  for (const r of results) {
    if (!r.queue_id || typeof r.queue_id !== 'string') {
      return NextResponse.json({ error: 'Invalid queue_id in results' }, { status: 400 })
    }
    if (!validStatuses.has(r.status)) {
      return NextResponse.json({ error: `Invalid status: ${r.status}` }, { status: 400 })
    }
  }

  const reportDate = date || todayKST()

  // 1. send_queues 상태 업데이트 (배치)
  const sentIds = results.filter((r: any) => r.status === 'sent').map((r: any) => r.queue_id)
  const failedResults = results.filter((r: any) => r.status === 'failed')

  if (sentIds.length > 0) {
    for (let i = 0; i < sentIds.length; i += 500) {
      const batch = sentIds.slice(i, i + 500)
      await supabase
        .from('send_queues')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .in('id', batch)
    }
  }

  // 실패 건을 error_type별로 그룹화하여 배치 업데이트
  const failedByType = new Map<string, string[]>()
  for (const r of failedResults) {
    const errorType = r.error_type || 'unknown'
    const ids = failedByType.get(errorType) || []
    ids.push(r.queue_id)
    failedByType.set(errorType, ids)
  }

  for (const [errorType, ids] of failedByType) {
    for (let i = 0; i < ids.length; i += 500) {
      const batch = ids.slice(i, i + 500)
      await supabase
        .from('send_queues')
        .update({ status: 'failed', error_message: errorType })
        .in('id', batch)
    }
  }

  // 2. 구독별 성공/실패 집계
  const allQueueIds = results.map((r: any) => r.queue_id)
  const { data: queueItems } = await supabase
    .from('send_queues')
    .select('id, subscription_id, day_number')
    .in('id', allQueueIds)

  if (!queueItems?.length) return NextResponse.json({ ok: true, processed: 0 })

  // results를 Map으로 변환 (queue_id → result)
  const resultMap = new Map(results.map((r: any) => [r.queue_id, r]))

  // 구독별 Day별 그룹화
  const subMap = new Map<string, {
    days: Map<number, { sent: number; failed: number }>,
    errorType: string | null
  }>()

  for (const item of queueItems) {
    if (!subMap.has(item.subscription_id)) {
      subMap.set(item.subscription_id, { days: new Map(), errorType: null })
    }
    const sub = subMap.get(item.subscription_id)!

    if (!sub.days.has(item.day_number)) {
      sub.days.set(item.day_number, { sent: 0, failed: 0 })
    }

    const result = resultMap.get(item.id)
    if (result?.status === 'sent') {
      sub.days.get(item.day_number)!.sent++
    } else {
      sub.days.get(item.day_number)!.failed++
      if (result?.error_type) sub.errorType = result.error_type
    }
  }

  // 3. 관련 구독 일괄 조회
  const subIds = [...subMap.keys()]
  const { data: existingSubs } = await supabase
    .from('subscriptions')
    .select('id, last_sent_day, recovery_mode, customer_id, device_id')
    .in('id', subIds)

  const existingSubMap = new Map(
    (existingSubs || []).map(s => [s.id, s])
  )

  // 구독별 last_sent_day 업데이트
  for (const [subId, info] of subMap) {
    const existingSub = existingSubMap.get(subId)
    const existingLastSent = existingSub?.last_sent_day ?? 0

    // Day별로 연속 성공 확인 (기존 last_sent_day부터 연속이어야 함)
    const sortedDays = [...info.days.entries()].sort((a, b) => a[0] - b[0])
    let maxCompletedDay = existingLastSent

    for (const [dayNum, counts] of sortedDays) {
      if (dayNum !== maxCompletedDay + 1) break // 연속이 아니면 중단
      if (counts.failed > 0) break // 실패가 있으면 중단
      maxCompletedDay = dayNum
    }

    if (maxCompletedDay > existingLastSent) {
      // 진행 성공: last_sent_day 업데이트
      const updates: any = {
        last_sent_day: maxCompletedDay,
        updated_at: new Date().toISOString(),
      }

      // recovery_mode 초기화
      if (existingSub?.recovery_mode === 'bulk') {
        updates.recovery_mode = null
      }

      // 전체 성공이면 failure 초기화, 부분 성공이면 failure 유지/설정
      if (!info.errorType) {
        updates.failure_type = null
        updates.failure_date = null
      } else {
        updates.failure_type = info.errorType
        updates.failure_date = reportDate
      }

      await supabase.from('subscriptions').update(updates).eq('id', subId)
    } else if (info.errorType) {
      // 진행 없이 실패만
      await supabase.from('subscriptions').update({
        failure_type: info.errorType,
        failure_date: reportDate,
        updated_at: new Date().toISOString(),
      }).eq('id', subId)
    }
  }

  // 4. friend_not_found 사람 단위 전파
  const friendNotFoundSubIds = [...subMap.entries()]
    .filter(([_, info]) => info.errorType === 'friend_not_found')
    .map(([subId]) => subId)

  for (const subId of friendNotFoundSubIds) {
    const sub = existingSubMap.get(subId)
    if (sub) {
      await supabase.from('subscriptions').update({
        failure_type: 'friend_not_found',
        failure_date: reportDate,
        updated_at: new Date().toISOString(),
      })
      .eq('customer_id', sub.customer_id)
      .eq('device_id', sub.device_id)
      .is('failure_type', null)
    }
  }

  return NextResponse.json({
    ok: true,
    processed: subMap.size,
    date: reportDate,
  })
}
