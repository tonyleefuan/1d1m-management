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

  // count_unread: admin_read_at IS NULL인 ai_answered 건수
  let unreadAiCount = 0
  if (status === 'ai_answered') {
    const { count } = await supabase
      .from('cs_inquiries')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'ai_answered')
      .is('admin_read_at', null)
    unreadAiCount = count || 0
  }

  return NextResponse.json({ data: enriched, unreadAiCount })
}

// PATCH: AI 응대 탭 진입 시 일괄 읽음 처리
export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action } = await req.json()

  if (action === 'mark_ai_read') {
    await supabase
      .from('cs_inquiries')
      .update({ admin_read_at: new Date().toISOString() })
      .eq('status', 'ai_answered')
      .is('admin_read_at', null)

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
