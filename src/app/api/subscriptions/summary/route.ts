import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { todayKST } from '@/lib/day'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 1 query: status별 건수
  const { data: statusRows } = await supabase
    .from('subscriptions')
    .select('status')

  const counts: Record<string, number> = { live: 0, pending: 0, pause: 0, archive: 0, cancel: 0 }
  statusRows?.forEach(r => {
    if (counts[r.status] !== undefined) counts[r.status]++
  })

  // 오늘 발송 수
  const today = todayKST()
  const { count: todaySent } = await supabase
    .from('send_queues')
    .select('id', { count: 'exact', head: true })
    .eq('send_date', today)

  return NextResponse.json({ ...counts, today_sending: todaySent || 0 })
}
