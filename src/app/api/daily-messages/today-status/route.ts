export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // KST 기준: 내일(+1) ~ 6일전(-6) = 총 8일
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const dates: string[] = []
  for (let i = -1; i <= 6; i++) {
    const d = new Date(kstNow)
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }
  // dates[0]=내일, dates[1]=오늘, dates[2~7]=과거

  const today = dates[1]

  const { data, error } = await supabase
    .from('daily_messages')
    .select('id, product_id, send_date, content, status')
    .gte('send_date', dates[dates.length - 1])
    .lte('send_date', dates[0])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const grid: Record<string, Record<string, { content: string; status: string; id: string }>> = {}
  for (const row of data || []) {
    if (!grid[row.product_id]) grid[row.product_id] = {}
    grid[row.product_id][row.send_date] = {
      content: row.content || '',
      status: row.status || 'draft',
      id: row.id,
    }
  }

  return NextResponse.json({ dates, today, grid })
}
