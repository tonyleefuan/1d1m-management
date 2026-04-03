import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getCsSession } from '@/lib/cs-auth'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getCsSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { content } = await req.json()
    if (!content?.trim()) {
      return NextResponse.json({ error: '내용을 입력해 주세요.' }, { status: 400 })
    }

    // ── 댓글 Rate Limit: 문의당 1시간 10회 ──
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: replyCount } = await supabase
      .from('cs_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('identifier', `${session.customerId}:${params.id}`)
      .eq('action', 'reply')
      .gte('attempted_at', oneHourAgo)

    if ((replyCount ?? 0) >= 10) {
      return NextResponse.json({ error: '답변 등록 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 })
    }

    const { data: inquiry } = await supabase
      .from('cs_inquiries')
      .select('id, customer_id, status')
      .eq('id', params.id)
      .single()

    if (!inquiry) {
      return NextResponse.json({ error: '문의를 찾을 수 없습니다.' }, { status: 404 })
    }
    if (inquiry.customer_id !== session.customerId) {
      return NextResponse.json({ error: '문의를 찾을 수 없습니다.' }, { status: 404 }) // 403 대신 404 (정보 은닉)
    }
    if (inquiry.status === 'closed' || inquiry.status === 'dismissed') {
      return NextResponse.json({ error: '종료된 문의에는 답변할 수 없습니다.' }, { status: 400 })
    }
    if (inquiry.status === 'processing') {
      return NextResponse.json({ error: '문의가 처리 중입니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 })
    }

    // Rate limit 기록
    await supabase.from('cs_rate_limits').insert({
      identifier: `${session.customerId}:${params.id}`,
      action: 'reply',
    })

    const { data: reply, error } = await supabase
      .from('cs_replies')
      .insert({
        inquiry_id: params.id,
        author_type: 'customer',
        content: content.trim(),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // AI 답변 횟수 확인
    const { count: aiCount } = await supabase
      .from('cs_replies')
      .select('id', { count: 'exact', head: true })
      .eq('inquiry_id', params.id)
      .eq('author_type', 'ai')

    if ((aiCount ?? 0) < 2) {
      // AI 재응답 가능 → pending으로 되돌림 (다음 Cron에서 handleCsReply 호출)
      await supabase
        .from('cs_inquiries')
        .update({ status: 'pending' })
        .eq('id', params.id)
    } else {
      // AI 응답 2회 초과 → 에스컬레이션
      await supabase
        .from('cs_inquiries')
        .update({ status: 'escalated' })
        .eq('id', params.id)
    }

    return NextResponse.json({ data: reply }, { status: 201 })
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
