export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { todayKST } from '@/lib/day'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({ device_id: null, date: null }))
  const device_id = body.device_id || null
  const date = body.date || todayKST()

  // 이미 발송된 건이 있는지 확인
  let sentCheck = supabase
    .from('send_queues')
    .select('id', { count: 'exact', head: true })
    .eq('send_date', date)
    .eq('status', 'sent')

  if (device_id) sentCheck = sentCheck.eq('device_id', device_id)

  const { count: sentCount } = await sentCheck

  if (sentCount && sentCount > 0) {
    return NextResponse.json(
      { error: '이미 발송된 건이 있어 삭제할 수 없습니다. 먼저 결과를 가져와주세요.' },
      { status: 409 }
    )
  }

  let query = supabase
    .from('send_queues')
    .delete()
    .eq('send_date', date)

  if (device_id) query = query.eq('device_id', device_id)

  const { error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, date, device_id: device_id || 'all' })
}
