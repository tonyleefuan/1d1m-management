import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // KST 기준: 모레(+2) ~ 6일전(-6) = 총 9일
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const dates: string[] = []
  for (let i = -2; i <= 6; i++) {
    const d = new Date(kstNow)
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }
  // dates[0]=모레, dates[1]=내일, dates[2]=오늘, dates[3~8]=과거

  const today = dates[2]

  const { data, error } = await supabase
    .from('daily_messages')
    .select('product_id, send_date, content')
    .gte('send_date', dates[dates.length - 1])
    .lte('send_date', dates[0])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const grid: Record<string, Record<string, string>> = {}
  for (const row of data || []) {
    if (!grid[row.product_id]) grid[row.product_id] = {}
    grid[row.product_id][row.send_date] = row.content || ''
  }

  return NextResponse.json({ dates, today, grid })
}
