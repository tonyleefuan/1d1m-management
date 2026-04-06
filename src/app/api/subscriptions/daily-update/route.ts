export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { computeSubscription } from '@/lib/day'

// Vercel Cron은 GET으로 호출
export async function GET(req: Request) {
  return handleDailyUpdate(req)
}

export async function POST(req: Request) {
  return handleDailyUpdate(req)
}

async function handleDailyUpdate(req: Request) {
  // Vercel Cron 또는 admin 세션 인증
  const cronSecret = req.headers.get('authorization')
  const envSecret = process.env.CRON_SECRET
  const isVercelCron = !!envSecret && cronSecret === `Bearer ${envSecret}`

  if (!isVercelCron) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // KST (UTC+9) 기준 오늘 날짜
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  const yesterday = new Date(new Date(today + 'T00:00:00').getTime() - 86400000).toISOString().slice(0, 10)
  const now = new Date().toISOString()
  const results = {
    pending_to_live: 0,
    live_to_archive: 0,
    pause_to_live: 0,
    unreported_marked: 0,
    failure_marked: 0,
    recovery_reset: 0,
    queues_cleaned: 0,
  }

  // === 구독 상태 전환 ===

  // 1. pending -> live: start_date <= today AND failure_type IS NULL
  const { data: pendingToLive, error: e1 } = await supabase
    .from('subscriptions')
    .update({ status: 'live', last_sent_day: 0, updated_at: now })
    .eq('status', 'pending')
    .lte('start_date', today)
    .is('failure_type', null)
    .select('id')
  if (!e1) results.pending_to_live = pendingToLive?.length || 0

  // 2. live -> archive: last_sent_day >= duration_days
  const { data: archiveSubs } = await supabase
    .from('subscriptions')
    .select('id, last_sent_day, duration_days')
    .eq('status', 'live')

  if (archiveSubs) {
    const toArchiveIds = archiveSubs
      .filter(s => (s.last_sent_day ?? 0) >= s.duration_days)
      .map(s => s.id)

    if (toArchiveIds.length > 0) {
      await supabase
        .from('subscriptions')
        .update({ status: 'archive', updated_at: now })
        .in('id', toArchiveIds)
      results.live_to_archive = toArchiveIds.length
    }
  }

  // 3. pause -> live: resume_date <= today (end_date를 pause 일수만큼 연장)
  const { data: pauseSubs } = await supabase
    .from('subscriptions')
    .select('id, paused_at, end_date')
    .eq('status', 'pause')
    .lte('resume_date', today)

  if (pauseSubs?.length) {
    for (const sub of pauseSubs) {
      const updateFields: Record<string, unknown> = {
        status: 'live',
        paused_at: null,
        resume_date: null,
        updated_at: now,
      }
      if (sub.paused_at && sub.end_date) {
        const pausedAt = new Date(sub.paused_at)
        pausedAt.setHours(0, 0, 0, 0)
        const todayDate = new Date(today)
        const pauseDays = Math.max(0, Math.floor((todayDate.getTime() - pausedAt.getTime()) / (1000 * 60 * 60 * 24)))
        if (pauseDays > 0) {
          const newEnd = new Date(sub.end_date)
          newEnd.setDate(newEnd.getDate() + pauseDays)
          updateFields.end_date = newEnd.toISOString().slice(0, 10)
        }
      }
      await supabase.from('subscriptions').update(updateFields).eq('id', sub.id)
    }
    results.pause_to_live = pauseSubs.length
  }

  // === 발송 유지보수 ===

  // 4. 어제 미보고 큐 → failed 처리 (구독은 건드리지 않음)
  const { data: unreportedQueues } = await supabase
    .from('send_queues')
    .select('id')
    .eq('send_date', yesterday)
    .eq('status', 'pending')

  if (unreportedQueues?.length) {
    await supabase.from('send_queues')
      .update({ status: 'failed', error_message: 'not_sent' })
      .eq('send_date', yesterday)
      .eq('status', 'pending')
    results.unreported_marked = unreportedQueues.length
  }

  // 5. sequential recovery_mode 초기화 (따라잡기 완료 시)
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
          updated_at: now,
        }).eq('id', sub.id)
        results.recovery_reset++
      }
    }
  }

  // 6. 3일 연속 실패 → failure_type 마킹
  const { data: candidates } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('is_cancelled', false)
    .is('paused_at', null)
    .is('recovery_mode', null)
    .is('failure_type', null)

  if (candidates?.length) {
    const candidateIds = candidates.map(c => c.id)
    const threeDaysAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 4); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d) })()
    const recentQueues: { subscription_id: string; send_date: string; status: string }[] = []
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
      const subQueues = new Map<string, Map<string, string[]>>()
      for (const q of recentQueues) {
        if (!subQueues.has(q.subscription_id)) subQueues.set(q.subscription_id, new Map())
        const dateMap = subQueues.get(q.subscription_id)!
        if (!dateMap.has(q.send_date)) dateMap.set(q.send_date, [])
        dateMap.get(q.send_date)!.push(q.status)
      }

      for (const [subId, dateMap] of subQueues) {
        const dates = [...dateMap.keys()].sort().reverse().slice(0, 3)
        if (dates.length < 3) continue

        let consecutiveFailures = 0
        for (const date of dates) {
          const statuses = dateMap.get(date)!
          if (statuses.includes('pending')) break
          if (statuses.includes('failed')) {
            consecutiveFailures++
          } else {
            break
          }
        }

        if (consecutiveFailures >= 3) {
          await supabase.from('subscriptions').update({
            failure_type: 'failed',
            failure_date: today,
            updated_at: now,
          }).eq('id', subId).is('failure_type', null)
          results.failure_marked++
        }
      }
    }
  }

  // 7. 7일 이전 send_queues 정리
  const sevenDaysAgo = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d)
  })()
  const { count: cleanedCount } = await supabase
    .from('send_queues')
    .delete()
    .lt('send_date', sevenDaysAgo)
  results.queues_cleaned = cleanedCount ?? 0

  return NextResponse.json({
    ok: true,
    date: today,
    ...results,
  })
}
