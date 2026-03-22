import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: Request) {
  const body = await req.json()
  const { device_id, pending, sent, failed, total } = body

  if (!device_id) return NextResponse.json({ error: 'device_id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('send_devices')
    .update({
      last_heartbeat: new Date().toISOString(),
      sending_progress: { pending, sent, failed, total },
    })
    .eq('phone_number', device_id)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: `Device not found: ${device_id}` }, { status: 404 })

  return NextResponse.json({ ok: true })
}
