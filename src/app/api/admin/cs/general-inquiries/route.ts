export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

// 기타 문의 목록 조회 (admin 전용)
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const unreadOnly = searchParams.get('unread') === 'true'

  let query = supabase
    .from('cs_general_inquiries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (unreadOnly) {
    query = query.eq('is_read', false)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data || [] })
}

// 읽음 처리 (PATCH)
export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, action } = await req.json()

  if (action === 'mark_read' && id) {
    const { error } = await supabase
      .from('cs_general_inquiries')
      .update({ is_read: true })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'mark_all_read') {
    const { error } = await supabase
      .from('cs_general_inquiries')
      .update({ is_read: true })
      .eq('is_read', false)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
