import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST(req: Request) {
  // Vercel Cron 또는 admin 세션 인증
  const cronSecret = req.headers.get('authorization')
  const isVercelCron = cronSecret === `Bearer ${process.env.CRON_SECRET}`

  if (!isVercelCron) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const results = { pending_to_live: 0, live_to_archive: 0, pause_to_live: 0 }

  // 1. pending -> live: start_date <= today AND last_send_failure IS NULL
  // day를 1로 세팅 (발송 시작)
  const { data: pendingToLive, error: e1 } = await supabase
    .from('subscriptions')
    .update({ status: 'live', day: 1, updated_at: new Date().toISOString() })
    .eq('status', 'pending')
    .lte('start_date', today)
    .is('last_send_failure', null)
    .select('id')
  if (!e1) results.pending_to_live = pendingToLive?.length || 0

  // 2. live -> archive: day > duration_days (모든 메시지 발송 완료)
  const { data: archiveSubs } = await supabase
    .from('subscriptions')
    .select('id, day, duration_days')
    .eq('status', 'live')

  if (archiveSubs) {
    const toArchiveIds = archiveSubs
      .filter(s => s.day > s.duration_days)
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
