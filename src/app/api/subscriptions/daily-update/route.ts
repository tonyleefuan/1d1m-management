export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { daysAgoKST } from '@/lib/day'

// Vercel Cron은 GET으로 호출
export async function GET(req: Request) {
  return handleDailyUpdate(req)
}

export async function POST(req: Request) {
  return handleDailyUpdate(req)
}

async function handleDailyUpdate(req: Request) {
  // Vercel Cron 또는 admin 세션 인증
  const isVercelCron = req.headers.get('x-vercel-cron') === '1' ||
    (!!process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`)

  if (!isVercelCron) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
  const now = new Date().toISOString()
  const results: Record<string, number> = {
    pending_to_live: 0,
    live_to_archive: 0,
    pause_to_live: 0,
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
      .select('id, paused_at, end_date, paused_days')
      .eq('status', 'pause')
      .lte('resume_date', today)

    if (pauseSubs?.length) {
      for (const sub of pauseSubs) {
        try {
          const updateFields: Record<string, unknown> = {
            status: 'live',
            paused_at: null,
            pause_reason: null,
            resume_date: null,
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
          }
          await supabase.from('subscriptions').update(updateFields).eq('id', sub.id)
        } catch (innerErr) {
          errors.push(`step3-sub-${sub.id}: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`)
        }
      }
      results.pause_to_live = pauseSubs.length
    }
  } catch (e) { errors.push(`step3: ${e instanceof Error ? e.message : String(e)}`) }

  // === Step 4: 7일 이전 send_queues 정리 ===
  try {
    const sevenDaysAgo = daysAgoKST(7)
    const { count: cleanedCount } = await supabase
      .from('send_queues')
      .delete()
      .lt('send_date', sevenDaysAgo)
    results.queues_cleaned = cleanedCount ?? 0
  } catch (e) { errors.push(`step4: ${e instanceof Error ? e.message : String(e)}`) }

  return NextResponse.json({
    ok: true,
    date: today,
    ...results,
    ...(errors.length > 0 ? { errors } : {}),
  })
}
