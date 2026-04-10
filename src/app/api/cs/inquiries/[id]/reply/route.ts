export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getCsSession } from '@/lib/cs-auth'
import { getSystemSettings } from '@/lib/settings'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getCsSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const settings = await getSystemSettings(['cs_content_max_length', 'cs_rate_limit_reply', 'ai_cs_escalation_threshold'])
    const maxLen = Number(settings.cs_content_max_length) || 2000
    const replyRateLimit = Number(settings.cs_rate_limit_reply) || 10
    const escalationThreshold = Number(settings.ai_cs_escalation_threshold) || 2

    const { content } = await req.json()
    if (!content?.trim()) {
      return NextResponse.json({ error: '문의 내용을 입력해 주세요.' }, { status: 400 })
    }
    if (content.trim().length > maxLen) {
      return NextResponse.json({ error: `문의 내용은 ${maxLen.toLocaleString()}자 이내로 작성해 주세요.` }, { status: 400 })
    }

    // ── 댓글 Rate Limit ──
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: replyCount } = await supabase
      .from('cs_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('identifier', `${session.customerId}:${params.id}`)
      .eq('action', 'reply')
      .gte('attempted_at', oneHourAgo)

    if ((replyCount ?? 0) >= replyRateLimit) {
      return NextResponse.json({ error: '짧은 시간 내 너무 많은 문의를 등록하셨습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 })
    }

    const { data: inquiry } = await supabase
      .from('cs_inquiries')
      .select('id, customer_id, status')
      .eq('id', params.id)
      .single()

    if (!inquiry) {
      return NextResponse.json({ error: '해당 문의를 찾을 수 없습니다.' }, { status: 404 })
    }
    if (inquiry.customer_id !== session.customerId) {
      return NextResponse.json({ error: '해당 문의를 찾을 수 없습니다.' }, { status: 404 }) // 403 대신 404 (정보 은닉)
    }
    if (inquiry.status === 'dismissed') {
      return NextResponse.json({ error: '이미 종료된 문의입니다. 추가 문의가 필요하시면 새 문의를 등록해 주세요.' }, { status: 400 })
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

    // processing 중에는 상태 변경하지 않음 (현재 AI 처리 완료 후 Cron이 다음 실행에서 처리)
    if (inquiry.status !== 'processing') {
      // 상태 전이: 관리자 답변 후 고객 재문의 → 에스컬레이션 (관리자 재확인 필요)
      if (inquiry.status === 'admin_answered') {
        await supabase
          .from('cs_inquiries')
          .update({ status: 'escalated' })
          .eq('id', params.id)
      } else if (inquiry.status === 'closed') {
        // closed → pending (reopening, AI 재처리)
        await supabase
          .from('cs_inquiries')
          .update({ status: 'pending' })
          .eq('id', params.id)
      } else {
        // AI 답변 횟수 확인
        const { count: aiCount } = await supabase
          .from('cs_replies')
          .select('id', { count: 'exact', head: true })
          .eq('inquiry_id', params.id)
          .eq('author_type', 'ai')

        if ((aiCount ?? 0) < escalationThreshold) {
          await supabase
            .from('cs_inquiries')
            .update({ status: 'pending' })
            .eq('id', params.id)
        } else {
          await supabase
            .from('cs_inquiries')
            .update({ status: 'escalated' })
            .eq('id', params.id)
        }
      }
    }

    return NextResponse.json({ data: reply }, { status: 201 })
  } catch {
    return NextResponse.json({ error: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 })
  }
}
