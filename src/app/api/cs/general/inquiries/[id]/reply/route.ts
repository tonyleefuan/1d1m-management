import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getGeneralSession } from '@/lib/cs-general-auth'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getGeneralSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { content } = await req.json()

    if (!content?.trim()) {
      return NextResponse.json({ error: '내용을 입력해 주세요.' }, { status: 400 })
    }
    if (content.trim().length > 2000) {
      return NextResponse.json({ error: '내용은 2,000자 이내로 작성해 주세요.' }, { status: 400 })
    }

    // 본인 문의인지 확인
    const { data: inquiry } = await supabase
      .from('cs_general_inquiries')
      .select('id, status')
      .eq('id', params.id)
      .eq('email', session.email)
      .single()

    if (!inquiry) {
      return NextResponse.json({ error: '문의를 찾을 수 없습니다.' }, { status: 404 })
    }
    if (inquiry.status === 'closed') {
      return NextResponse.json({ error: '종료된 문의에는 답글을 남길 수 없습니다.' }, { status: 400 })
    }

    // 답글 생성
    const { data, error } = await supabase
      .from('cs_general_replies')
      .insert({
        inquiry_id: params.id,
        author_type: 'customer',
        content: content.trim(),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // 상태를 pending으로 변경 (관리자 확인 필요)
    await supabase
      .from('cs_general_inquiries')
      .update({ status: 'pending', is_read: false, updated_at: new Date().toISOString() })
      .eq('id', params.id)

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: '답글 등록에 실패했습니다.' }, { status: 500 })
  }
}
