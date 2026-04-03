import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || ''

  let query = supabase
    .from('cs_inquiries')
    .select('*, customer:customers(id, name, kakao_friend_name, phone_last4), cs_replies(id)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const enriched = data?.map(inq => ({
    ...inq,
    reply_count: inq.cs_replies?.length ?? 0,
    cs_replies: undefined,
  }))

  return NextResponse.json({ data: enriched })
}
