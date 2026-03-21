import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const today = new Date().toISOString().slice(0, 10)
  const results = { pending_to_live: 0, live_to_archive: 0, pause_to_live: 0 }

  // 1. pending -> live: start_date <= today AND last_send_failure IS NULL
  const { data: pendingToLive, error: e1 } = await supabase
    .from('subscriptions')
    .update({ status: 'live', updated_at: new Date().toISOString() })
    .eq('status', 'pending')
    .lte('start_date', today)
    .is('last_send_failure', null)
    .select('id')
  if (!e1) results.pending_to_live = pendingToLive?.length || 0

  // 2. live -> archive: day >= duration_days
  const { data: archiveSubs } = await supabase
    .from('subscriptions')
    .select('id, day, duration_days')
    .eq('status', 'live')

  if (archiveSubs) {
    const toArchiveIds = archiveSubs
      .filter(s => s.day >= s.duration_days)
      .map(s => s.id)

    if (toArchiveIds.length > 0) {
      await supabase
        .from('subscriptions')
        .update({ status: 'archive', updated_at: new Date().toISOString() })
        .in('id', toArchiveIds)
      results.live_to_archive = toArchiveIds.length
    }
  }

  // 3. pause -> live: resume_date <= today
  const { data: pauseToLive, error: e3 } = await supabase
    .from('subscriptions')
    .update({
      status: 'live',
      paused_at: null,
      resume_date: null,
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'pause')
    .lte('resume_date', today)
    .select('id')
  if (!e3) results.pause_to_live = pauseToLive?.length || 0

  return NextResponse.json({
    ok: true,
    date: today,
    ...results,
    total: results.pending_to_live + results.live_to_archive + results.pause_to_live,
  })
}
