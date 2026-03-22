import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // KST 기준 오늘 날짜
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('daily_messages')
    .select('product_id, content')
    .eq('send_date', today)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // product_id → boolean 맵
  const statusMap: Record<string, string> = {}
  for (const row of data || []) {
    statusMap[row.product_id] = row.content?.slice(0, 80) || ''
  }

  return NextResponse.json({ date: today, status: statusMap })
}
