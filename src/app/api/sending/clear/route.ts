import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { device_id } = await req.json().catch(() => ({ device_id: null }))
  const today = new Date().toISOString().slice(0, 10)

  let query = supabase
    .from('send_queues')
    .delete()
    .eq('send_date', today)

  if (device_id) query = query.eq('device_id', device_id)

  const { error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, date: today, device_id: device_id || 'all' })
}
