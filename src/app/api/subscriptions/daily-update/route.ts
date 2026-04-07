export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

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

  // KST 기준 날짜
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
  const now = new Date().toISOString()
  const results = {
    pending_to_live: 0,
    live_to_archive: 0,
    pause_to_live: 0,
    queues_cleaned: 0,
  }

  // === 구독 상태 전환 ===

  // 1. pending -> live: start_date <= today AND device_id 있음
  const { data: pendingToLive, error: e1 } = await supabase
    .from('subscriptions')
    .update({ status: 'live', updated_at: now })
    .eq('status', 'pending')
    .lte('start_date', today)
    .not('device_id', 'is', null)
    .select('id, last_sent_day')
  if (!e1 && pendingToLive?.length) {
    // last_sent_day가 null인 신규 구독만 0으로 초기화
    const needInit = pendingToLive.filter(s => s.last_sent_day == null).map(s => s.id)
    if (needInit.length > 0) {
      await supabase.from('subscriptions')
        .update({ last_sent_day: 0 })
        .in('id', needInit)
    }
    results.pending_to_live = pendingToLive.length
  }

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

  // 3. pause -> live: resume_date <= today (end_date 연장 + paused_days 누적)
  const { data: pauseSubs } = await supabase
    .from('subscriptions')
    .select('id, paused_at, end_date, paused_days')
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
      if (sub.paused_at) {
        const pausedAt = new Date(sub.paused_at)
        const pauseStart = new Date(pausedAt.toISOString().slice(0, 10) + 'T00:00:00Z')
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
    }
    results.pause_to_live = pauseSubs.length
  }

  // === 유지보수 ===

  // 4. 7일 이전 send_queues 정리
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
