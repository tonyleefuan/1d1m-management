import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

// GET: inquiry detail with replies
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('cs_inquiries')
    .select('*, customer:customers(id, name, kakao_friend_name), subscription:subscriptions(id, product:products(title), last_sent_day, duration_days), cs_replies(*)')
    .eq('id', params.id)
    .single()

  if (error || !data) return NextResponse.json({ error: '문의를 찾을 수 없습니다.' }, { status: 404 })

  if (data.cs_replies) {
    data.cs_replies.sort((a: any, b: any) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }

  return NextResponse.json({ data })
}

// PATCH: update status (reply or dismiss)
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, content } = await req.json()

  if (action === 'dismiss') {
    const { error } = await supabase
      .from('cs_inquiries')
      .update({ status: 'dismissed' })
      .eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'reply') {
    if (!content?.trim()) {
      return NextResponse.json({ error: '답변 내용을 입력해 주세요.' }, { status: 400 })
    }

    const { error: replyErr } = await supabase
      .from('cs_replies')
      .insert({
        inquiry_id: params.id,
        author_type: 'admin',
        author_name: session.username,
        content: content.trim(),
      })
    if (replyErr) return NextResponse.json({ error: replyErr.message }, { status: 500 })

    const { error: statusErr } = await supabase
      .from('cs_inquiries')
      .update({ status: 'admin_answered' })
      .eq('id', params.id)
    if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '올바르지 않은 액션입니다.' }, { status: 400 })
}
