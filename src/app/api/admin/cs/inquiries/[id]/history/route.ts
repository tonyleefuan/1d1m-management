export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 현재 문의에서 customer_id 조회
  const { data: current, error: curErr } = await supabase
    .from('cs_inquiries')
    .select('customer_id')
    .eq('id', params.id)
    .single()

  if (curErr || !current) {
    return NextResponse.json({ error: '문의를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 같은 고객의 다른 문의 조회 (현재 문의 제외, 최신순)
  const { data, error } = await supabase
    .from('cs_inquiries')
    .select('id, category, title, status, content, created_at, updated_at, cs_replies(id, author_type, author_name, content, created_at)')
    .eq('customer_id', current.customer_id)
    .neq('id', params.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // replies 정렬
  const enriched = (data || []).map(inq => ({
    ...inq,
    cs_replies: inq.cs_replies?.sort((a: any, b: any) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ) || [],
  }))

  return NextResponse.json({ data: enriched })
}
