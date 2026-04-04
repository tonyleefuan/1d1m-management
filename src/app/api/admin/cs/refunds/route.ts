import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

// GET: 환불 요청 목록 조회 (status 필터 지원)
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') // pending, approved, completed, rejected
  const limit = Math.min(Number(searchParams.get('limit') || 50), 100)

  let query = supabase
    .from('cs_refund_requests')
    .select(`
      *,
      customer:customers(id, name, kakao_friend_name, phone_last4),
      subscription:subscriptions(id, last_sent_day, duration_days, product:products(id, title)),
      inquiry:cs_inquiries(id, title, status)
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
