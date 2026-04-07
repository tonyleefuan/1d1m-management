export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { computeSubscription, daysAgoKST } from '@/lib/day'

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

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
  const yesterday = daysAgoKST(1)
  const now = new Date().toISOString()
  const results: Record<string, number> = {
    pending_to_live: 0,
    live_to_archive: 0,
    pause_to_live: 0,
    unreported_marked: 0,
    failure_marked: 0,
    recovery_reset: 0,
    queues_cleaned: 0,
  }
  const errors: string[] = []

  // === Step 1: pending → live ===
  try {
    const { data: pendingToLive, error: e1 } = await supabase
      .from('subscriptions')
      .update({ status: 'live', updated_at: now })
      .eq('status', 'pending')
      .lte('start_date', today)
      .is('failure_type', null)
      .not('device_id', 'is', null)
      .select('id, last_sent_day')
    if (!e1 && pendingToLive?.length) {
      const needInit = pendingToLive.filter(s => s.last_sent_day == null).map(s => s.id)
      if (needInit.length > 0) {
        await supabase.from('subscriptions')
          .update({ last_sent_day: 0 })
          .in('id', needInit)
      }
      results.pending_to_live = pendingToLive.length
    }
  } catch (e) { errors.push(`step1: ${e instanceof Error ? e.message : String(e)}`) }

  // === Step 2: live → archive (last_sent_day >= duration_days) ===
  try {
    // 페이지네이션으로 1000행 제한 회피
    const toArchiveIds: string[] = []
    let offset = 0
    const PAGE = 1000
    while (true) {
      const { data } = await supabase
        .from('subscriptions')
        .select('id, last_sent_day, duration_days')
        .eq('status', 'live')
        .range(offset, offset + PAGE - 1)
      if (!data || data.length === 0) break
      for (const s of data) {
        if ((s.last_sent_day ?? 0) >= s.duration_days) toArchiveIds.push(s.id)
      }
      if (data.length < PAGE) break
      offset += PAGE
    }
    if (toArchiveIds.length > 0) {
      for (let i = 0; i < toArchiveIds.length; i += 500) {
        await supabase
          .from('subscriptions')
          .update({ status: 'archive', updated_at: now })
          .in('id', toArchiveIds.slice(i, i + 500))
      }
      results.live_to_archive = toArchiveIds.length
    }
  } catch (e) { errors.push(`step2: ${e instanceof Error ? e.message : String(e)}`) }

  // === Step 3: pause → live (resume_date <= today) ===
  try {
    const { data: pauseSubs } = await supabase
      .from('subscriptions')
      .select('id, paused_at, end_date, paused_days, start_date, duration_days, last_sent_day, is_cancelled')
      .eq('status', 'pause')
      .lte('resume_date', today)

    if (pauseSubs?.length) {
      for (const sub of pauseSubs) {
        try {
          const updateFields: Record<string, unknown> = {
            status: 'live',
            paused_at: null,
            resume_date: null,
            failure_type: null,
            failure_date: null,
            recovery_mode: null,
            updated_at: now,
          }
          if (sub.paused_at) {
            const pausedAtKST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(sub.paused_at))
            const pauseStart = new Date(pausedAtKST + 'T00:00:00Z')
            const todayMidnight = new Date(today + 'T00:00:00Z')
            const pauseDays = Math.max(0, Math.floor((todayMidnight.getTime() - pauseStart.getTime()) / 86400000))
            updateFields.paused_days = (sub.paused_days ?? 0) + pauseDays
            if (pauseDays > 0 && sub.end_date) {
              const newEnd = new Date(sub.end_date + 'T00:00:00Z')
              newEnd.setUTCDate(newEnd.getUTCDate() + pauseDays)
              updateFields.end_date = newEnd.toISOString().slice(0, 10)
            }
            // 재개 후 pending_days >= 4이면 자동 bulk 모드
            const computed = computeSubscription({
              start_date: sub.start_date,
              duration_days: sub.duration_days ?? 0,
              last_sent_day: sub.last_sent_day ?? 0,
              paused_days: (sub.paused_days ?? 0) + pauseDays,
              paused_at: null,
              is_cancelled: false,
            }, today)
            if (computed.pending_days.length >= 4) {
              updateFields.recovery_mode = 'bulk'
            }
          }
          await supabase.from('subscriptions').update(updateFields).eq('id', sub.id)
        } catch (innerErr) {
          errors.push(`step3-sub-${sub.id}: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`)
        }
      }
      results.pause_to_live = pauseSubs.length
    }
  } catch (e) { errors.push(`step3: ${e instanceof Error ? e.message : String(e)}`) }

  // === Step 4: 어제 미보고 큐 → failed 처리 ===
  try {
    const { count } = await supabase.from('send_queues')
      .select('id', { count: 'exact', head: true })
      .eq('send_date', yesterday)
      .eq('status', 'pending')

    if (count && count > 0) {
      await supabase.from('send_queues')
        .update({ status: 'failed', error_message: 'not_sent' })
        .eq('send_date', yesterday)
        .eq('status', 'pending')
      results.unreported_marked = count
    }
  } catch (e) { errors.push(`step4: ${e instanceof Error ? e.message : String(e)}`) }

  // === Step 5: sequential recovery_mode 초기화 ===
  try {
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
  } catch (e) { errors.push(`step5: ${e instanceof Error ? e.message : String(e)}`) }

  // === Step 6: 3일 연속 실패 → failure_type 마킹 ===
  try {
    const { data: candidates } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('is_cancelled', false)
      .is('paused_at', null)
      .is('recovery_mode', null)
      .is('failure_type', null)

    if (candidates?.length) {
      const candidateIds = candidates.map(c => c.id)
      const threeDaysAgo = daysAgoKST(4)
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
          const d0 = new Date(dates[0] + 'T00:00:00Z')
          const d2 = new Date(dates[2] + 'T00:00:00Z')
          const daySpan = Math.round((d0.getTime() - d2.getTime()) / 86400000)
          if (daySpan !== 2) continue

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
  } catch (e) { errors.push(`step6: ${e instanceof Error ? e.message : String(e)}`) }

  // === Step 7: 7일 이전 send_queues 정리 ===
  try {
    const sevenDaysAgo = daysAgoKST(7)
    const { count: cleanedCount } = await supabase
      .from('send_queues')
      .delete()
      .lt('send_date', sevenDaysAgo)
    results.queues_cleaned = cleanedCount ?? 0
  } catch (e) { errors.push(`step7: ${e instanceof Error ? e.message : String(e)}`) }

  return NextResponse.json({
    ok: errors.length === 0,
    date: today,
    ...results,
    ...(errors.length > 0 ? { errors } : {}),
  })
}
