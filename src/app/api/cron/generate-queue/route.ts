import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { todayKST, computeSubscription } from '@/lib/day'
import { generateQueueForDevice } from '@/lib/queue-generator'
import { notifyQueueGenerated } from '@/lib/slack'

export const maxDuration = 120

export async function POST(req: Request) {
  // Vercel Cron or admin auth
  const cronSecret = req.headers.get('authorization')
  const envSecret = process.env.CRON_SECRET
  const isVercelCron = !!envSecret && cronSecret === `Bearer ${envSecret}`

  if (!isVercelCron) {
    const { getSession } = await import('@/lib/auth')
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const today = todayKST()
  const yesterday = new Date(new Date(today + 'T00:00:00').getTime() - 86400000).toISOString().slice(0, 10)

  // 이미 오늘 대기열이 있으면 사전처리 스킵 (크론 중복 실행 방지)
  const { count: existingQueueCount } = await supabase
    .from('send_queues')
    .select('id', { count: 'exact', head: true })
    .eq('send_date', today)

  if (existingQueueCount && existingQueueCount > 0) {
    return NextResponse.json({
      ok: true,
      message: `오늘(${today}) 대기열이 이미 ${existingQueueCount}건 존재합니다. 중복 실행 방지.`,
      skipped: true,
    })
  }

  // === 사전 처리 ===

  // 1. not_sent 감지: 어제 send_queues에서 status='pending' 건 → 큐만 실패 처리
  //    (구독 failure_type은 Step 4에서 3일 연속 미발송 시에만 마킹)
  const { data: unreportedQueues } = await supabase
    .from('send_queues')
    .select('subscription_id')
    .eq('send_date', yesterday)
    .eq('status', 'pending')

  if (unreportedQueues?.length) {
    await supabase.from('send_queues')
      .update({ status: 'failed', error_message: 'not_sent' })
      .eq('send_date', yesterday)
      .eq('status', 'pending')
  }

  // 2. 자동 정지 해제: resume_date <= 오늘
  const { data: resumeSubs } = await supabase
    .from('subscriptions')
    .select('id, paused_at')
    .not('paused_at', 'is', null)
    .lte('resume_date', today)

  if (resumeSubs?.length) {
    for (const sub of resumeSubs) {
      if (sub.paused_at) {
        const pauseDays = Math.max(0, Math.floor(
          (new Date(today + 'T00:00:00').getTime() - new Date(sub.paused_at).getTime()) / 86400000
        ))
        await supabase.rpc('increment_paused_days', {
          sub_id: sub.id,
          days: pauseDays,
        })
      }
    }
  }

  // 3. sequential recovery_mode 초기화
  const { data: seqSubs } = await supabase
    .from('subscriptions')
    .select('id, start_date, duration_days, last_sent_day, paused_days, paused_at, is_cancelled')
    .eq('recovery_mode', 'sequential')

  if (seqSubs?.length) {
    for (const sub of seqSubs) {
      const computed = computeSubscription({
        start_date: sub.start_date,
        duration_days: sub.duration_days,
        last_sent_day: sub.last_sent_day ?? 0,
        paused_days: sub.paused_days ?? 0,
        paused_at: sub.paused_at,
        is_cancelled: sub.is_cancelled ?? false,
      }, today)
      if (sub.last_sent_day >= computed.current_day - 1) {
        await supabase.from('subscriptions').update({
          recovery_mode: null,
          updated_at: new Date().toISOString(),
        }).eq('id', sub.id)
      }
    }
  }

  // 4. 3일 연속 실패 자동 중지
  // 후보: 활성, recovery_mode 없음, 아직 auto-stop 안 된 구독
  const { data: candidates } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('is_cancelled', false)
    .is('paused_at', null)
    .is('recovery_mode', null)
    .is('failure_type', null)

  if (candidates?.length) {
    const candidateIds = candidates.map(c => c.id)

    // 모든 후보의 최근 3일 send_queue 기록 조회 (배치 500개씩)
    const threeDaysAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 4); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d) })()
    const recentQueues: any[] = []
    for (let i = 0; i < candidateIds.length; i += 500) {
      const batch = candidateIds.slice(i, i + 500)
      const { data } = await supabase
        .from('send_queues')
        .select('subscription_id, send_date, status, is_notice')
        .in('subscription_id', batch)
        .eq('is_notice', false)
        .gte('send_date', threeDaysAgo)
        .order('send_date', { ascending: false })
      if (data) recentQueues.push(...data)
    }

    if (recentQueues.length > 0) {
      // 구독별로 그룹화
      const subQueues = new Map<string, Map<string, string[]>>()
      for (const q of recentQueues) {
        if (!subQueues.has(q.subscription_id)) subQueues.set(q.subscription_id, new Map())
        const dateMap = subQueues.get(q.subscription_id)!
        if (!dateMap.has(q.send_date)) dateMap.set(q.send_date, [])
        dateMap.get(q.send_date)!.push(q.status)
      }

      const now = new Date().toISOString()
      for (const [subId, dateMap] of subQueues) {
        // 최근 3개 날짜만 확인
        const dates = [...dateMap.keys()].sort().reverse().slice(0, 3)
        if (dates.length < 3) continue

        let consecutiveFailures = 0
        for (const date of dates) {
          const statuses = dateMap.get(date)!
          if (statuses.includes('pending')) break // 판단 보류
          if (statuses.includes('failed')) {
            consecutiveFailures++
          } else {
            break // 전부 성공 — 연속 끊김
          }
        }

        if (consecutiveFailures >= 3) {
          await supabase.from('subscriptions').update({
            failure_type: 'failed',
            failure_date: today,
            updated_at: now,
          }).eq('id', subId)
        }
      }
    }
  }

  // 5. 7일 이전 send_queues 정리
  const sevenDaysAgo = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d)
  })()
  await supabase
    .from('send_queues')
    .delete()
    .lt('send_date', sevenDaysAgo)

  // === 대기열 생성 ===

  const { data: devices } = await supabase
    .from('send_devices')
    .select('id, phone_number')
    .eq('is_active', true)
    .order('phone_number')

  if (!devices?.length) {
    return NextResponse.json({ ok: true, message: '활성 PC 없음', devices: 0, total: 0 })
  }

  // PC별 순차 생성
  const summary: Record<string, number> = {}
  let totalGenerated = 0

  for (const device of devices) {
    const result = await generateQueueForDevice(device.id, today)
    const count = 'error' in result ? 0 : result.data.length
    summary[device.phone_number] = count
    totalGenerated += count
  }

  // 슬랙 알림
  await notifyQueueGenerated(summary, totalGenerated, today)

  return NextResponse.json({
    ok: true,
    date: today,
    devices: devices.length,
    total: totalGenerated,
    summary,
  })
}
