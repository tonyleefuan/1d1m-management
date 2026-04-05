import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

// 기타 문의 상세 조회
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('cs_general_inquiries')
    .select('*, cs_general_replies(*)')
    .eq('id', params.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: '문의를 찾을 수 없습니다.' }, { status: 404 })
  }

  if (data.cs_general_replies) {
    data.cs_general_replies.sort(
      (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }

  // 읽음 처리
  if (!data.is_read) {
    await supabase
      .from('cs_general_inquiries')
      .update({ is_read: true })
      .eq('id', params.id)
  }

  return NextResponse.json({ data })
}

// 관리자 답변
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { content } = await req.json()
  if (!content?.trim()) {
    return NextResponse.json({ error: '답변 내용을 입력해 주세요.' }, { status: 400 })
  }

  // 답글 생성
  const { error: replyErr } = await supabase
    .from('cs_general_replies')
    .insert({
      inquiry_id: params.id,
      author_type: 'admin',
      author_name: session.username || '관리자',
      content: content.trim(),
    })

  if (replyErr) return NextResponse.json({ error: replyErr.message }, { status: 500 })

  // 상태를 answered로 변경
  await supabase
    .from('cs_general_inquiries')
    .update({ status: 'answered', updated_at: new Date().toISOString() })
    .eq('id', params.id)

  return NextResponse.json({ success: true })
}
