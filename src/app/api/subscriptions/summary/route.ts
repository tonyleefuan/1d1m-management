import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const statuses = ['live', 'pending', 'pause', 'archive', 'cancel']
  const counts: Record<string, number> = {}

  for (const status of statuses) {
    const { count } = await supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', status)
    counts[status] = count || 0
  }

  // 오늘 발송 수
  const today = new Date().toISOString().slice(0, 10)
  const { count: todaySent } = await supabase
    .from('send_queues')
    .select('id', { count: 'exact', head: true })
    .eq('send_date', today)

  return NextResponse.json({ ...counts, today_sending: todaySent || 0 })
}
