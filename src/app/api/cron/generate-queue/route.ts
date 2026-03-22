import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { todayKST, computeSubscription } from '@/lib/day'
import { generateQueueForDevice } from '@/lib/queue-generator'
import { notifyQueueGenerated } from '@/lib/slack'

export async function POST(req: Request) {
  // Vercel Cron or admin auth
  const cronSecret = req.headers.get('authorization')
  const isVercelCron = cronSecret === `Bearer ${process.env.CRON_SECRET}`

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

  // 1. not_sent 감지: 어제 send_queues에서 status='pending' 건
  const { data: unreportedQueues } = await supabase
    .from('send_queues')
    .select('subscription_id')
    .eq('send_date', yesterday)
    .eq('status', 'pending')

  if (unreportedQueues?.length) {
    const unreportedSubIds = [...new Set(unreportedQueues.map(q => q.subscription_id))]
    for (const subId of unreportedSubIds) {
      if (!subId) continue
      await supabase.from('subscriptions').update({
        failure_type: 'not_sent',
        failure_date: yesterday,
        updated_at: new Date().toISOString(),
      }).eq('id', subId).is('failure_type', null)
    }
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

  // 4. 2일 연속 미발송 구독 명시적 마킹
  const { data: allActiveSubs } = await supabase
    .from('subscriptions')
    .select('id, start_date, duration_days, last_sent_day, paused_days, paused_at, is_cancelled, failure_type, recovery_mode')
    .eq('is_cancelled', false)
    .is('paused_at', null)
    .in('failure_type', ['device_error', 'not_sent'])

  if (allActiveSubs?.length) {
    for (const sub of allActiveSubs) {
      if (sub.recovery_mode) continue // recovery 중이면 스킵
      const computed = computeSubscription({
        start_date: sub.start_date,
        duration_days: sub.duration_days,
        last_sent_day: sub.last_sent_day ?? 0,
        paused_days: sub.paused_days ?? 0,
        paused_at: sub.paused_at,
        is_cancelled: sub.is_cancelled ?? false,
      }, today)
      if (computed.pending_days.length >= 3) {
        // 2일 이상 연속 미발송 → 관리자 확인 필요
        await supabase.from('subscriptions').update({
          failure_type: 'not_sent',
          failure_date: today,
          updated_at: new Date().toISOString(),
        }).eq('id', sub.id)
      }
    }
  }

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
