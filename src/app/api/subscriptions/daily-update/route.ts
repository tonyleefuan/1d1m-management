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

  // KST (UTC+9) 기준 오늘 날짜
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  const results = { pending_to_live: 0, live_to_archive: 0, pause_to_live: 0 }

  // 1. pending -> live: start_date <= today AND failure_type IS NULL
  // last_sent_day를 0으로 세팅 (아직 발송 전)
  const { data: pendingToLive, error: e1 } = await supabase
    .from('subscriptions')
    .update({ status: 'live', last_sent_day: 0, updated_at: new Date().toISOString() })
    .eq('status', 'pending')
    .lte('start_date', today)
    .is('failure_type', null)
    .select('id')
  if (!e1) results.pending_to_live = pendingToLive?.length || 0

  // 2. live -> archive: last_sent_day >= duration_days (모든 메시지 발송 완료)
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
        .update({ status: 'archive', updated_at: new Date().toISOString() })
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
      const updateFields: any = {
        status: 'live',
        paused_at: null,
        resume_date: null,
        updated_at: new Date().toISOString(),
      }
      // end_date 연장: pause 일수만큼
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

  return NextResponse.json({
    ok: true,
    date: today,
    ...results,
    total: results.pending_to_live + results.live_to_archive + results.pause_to_live,
  })
}
