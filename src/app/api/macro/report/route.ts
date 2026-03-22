import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { todayKST } from '@/lib/day'

export async function POST(req: Request) {
  const body = await req.json()
  const { device_id, date, results } = body

  if (!device_id || !results?.length) {
    return NextResponse.json({ error: 'device_id and results required' }, { status: 400 })
  }

  const reportDate = date || todayKST()

  // 1. send_queues 상태 업데이트 (배치)
  const sentIds = results.filter((r: any) => r.status === 'sent').map((r: any) => r.queue_id)
  const failedResults = results.filter((r: any) => r.status === 'failed')

  if (sentIds.length > 0) {
    await supabase
      .from('send_queues')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .in('id', sentIds)
  }

  for (const r of failedResults) {
    await supabase
      .from('send_queues')
      .update({
        status: 'failed',
        error_message: r.error_type || 'unknown',
      })
      .eq('id', r.queue_id)
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

  // 3. 구독별 last_sent_day 업데이트
  for (const [subId, info] of subMap) {
    // 기존 last_sent_day 조회
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('last_sent_day, recovery_mode')
      .eq('id', subId)
      .single()

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
      // 성공: last_sent_day 업데이트, failure 초기화
      const updates: any = {
        last_sent_day: maxCompletedDay,
        failure_type: null,
        failure_date: null,
        updated_at: new Date().toISOString(),
      }

      // recovery_mode 초기화
      if (existingSub?.recovery_mode === 'bulk') {
        updates.recovery_mode = null
      }

      await supabase.from('subscriptions').update(updates).eq('id', subId)
    }

    if (info.errorType) {
      // 실패 건이 있으면 failure_type 설정 (단, 이미 성공 업데이트된 Day 이후의 실패만)
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
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('customer_id, device_id')
      .eq('id', subId)
      .single()

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
