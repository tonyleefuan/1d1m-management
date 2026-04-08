export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { todayKST } from '@/lib/day'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // status별 건수 (개별 count 쿼리 — PostgREST 1000행 제한 회피)
  const statuses = ['live', 'pending', 'pause', 'archive', 'cancel'] as const
  const countResults = await Promise.all(
    statuses.map(s =>
      supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', s)
    )
  )
  const counts: Record<string, number> = { live: 0, pending: 0, pause: 0, archive: 0, cancel: 0 }
  statuses.forEach((s, i) => { counts[s] = countResults[i].count ?? 0 })

  // 오늘 발송 수
  const today = todayKST()
  const { count: todaySent } = await supabase
    .from('send_queues')
    .select('id', { count: 'exact', head: true })
    .eq('send_date', today)

  return NextResponse.json({ ...counts, today_sending: todaySent || 0 })
}
