export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const action = body.action || 'suggest' // 'suggest' | 'polish'

  try {
    // 문의 + 답변 스레드 + 구독/상품 타입 조회
    const { data: inquiry, error } = await supabase
      .from('cs_inquiries')
      .select('category, title, content, subscription_id, cs_replies(author_type, content, created_at)')
      .eq('id', params.id)
      .single()

    if (error || !inquiry) {
      return NextResponse.json({ error: '문의를 찾을 수 없습니다.' }, { status: 404 })
    }

    // 연결된 구독의 상품 타입 조회 (고정/실시간 분기용)
    let subscriptionContext = ''
    if (inquiry.subscription_id) {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('status, last_sent_day, duration_days, product:products(title, message_type)')
        .eq('id', inquiry.subscription_id)
        .single()
      if (sub) {
        const prod: any = Array.isArray(sub.product) ? sub.product[0] : sub.product
        subscriptionContext = `[구독 정보] 상태: ${sub.status}, 진행: Day ${sub.last_sent_day}/${sub.duration_days}, 상품: ${prod?.title ?? '-'}, 타입: ${prod?.message_type ?? '-'}`
      }
    }

    // 카테고리 관련 운영 정책 로드 (message_stopped 등)
    const { data: policies } = await supabase
      .from('cs_policies')
      .select('category, title, content, ai_instruction')
      .in('category', [inquiry.category, 'general_notice'])
      .order('sort_order')
    const policyContext = (policies || [])
      .map((p: any) => `[${p.title}]\n${p.content}\n\n[처리 지침]\n${p.ai_instruction || ''}`)
      .join('\n\n---\n\n')

    const replies = (inquiry.cs_replies || [])
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    const thread = replies
      .map((r: any) => `[${r.author_type === 'customer' ? '고객' : r.author_type === 'ai' ? 'AI' : '관리자'}] ${r.content}`)
      .join('\n\n')

    // ── 다듬기 모드 ──
    if (action === 'polish') {
      const draft = body.draft?.trim()
      if (!draft) return NextResponse.json({ error: '다듬을 내용이 없습니다.' }, { status: 400 })

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: `당신은 1Day1Message 구독 서비스의 CS 관리자 답변 다듬기 도우미입니다.

관리자가 작성한 초안을 고객에게 보내기 적합하도록 다듬어주세요.

규칙:
- 초안의 의도와 핵심 내용은 절대 변경하지 말 것
- 존댓말, 친절하고 전문적인 톤으로
- 마크다운/볼드 금지, 순수 텍스트만
- 불필요하게 길게 늘리지 말 것. 간결하게
- 운영 정책에 어긋나는 표현이 초안에 있다면 정책에 맞게 교정 (예: "오늘 중 재발송"을 "내일 함께 발송" 또는 "기간 연장"으로)
- 다듬은 답변 텍스트만 출력. 설명/주석 금지

[운영 정책]
${policyContext || '(관련 정책 없음)'}`,
        messages: [{
          role: 'user',
          content: `[고객 문의 맥락]
카테고리: ${inquiry.title}
내용: ${inquiry.content}
${subscriptionContext ? `\n${subscriptionContext}` : ''}
${thread ? `\n[대화 내역]\n${thread}` : ''}

[관리자 초안]
${draft}

위 초안을 정책에 맞게 다듬어주세요.`,
        }],
      })

      const polished = response.content[0].type === 'text' ? response.content[0].text.trim() : draft
      return NextResponse.json({ polished })
    }

    // ── 추천 모드 (기본) ──
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: `당신은 1Day1Message 구독 서비스의 CS 관리자 답변 작성 도우미입니다.
고객 문의와 대화 맥락, 그리고 아래 운영 정책을 반드시 따라 관리자가 보낼 수 있는 답변 3개를 추천해주세요.

[운영 정책 — 반드시 이대로 안내]
${policyContext || '(관련 정책 없음)'}

규칙:
- 존댓말, 친절하고 간결하게
- 각 답변은 2-3문장 이내
- 구독 정보가 주어지면 상품 타입(fixed/realtime)에 맞는 기본 처리를 안내:
  - fixed(고정): "내일 함께 발송" (오늘 중 재발송 아님, 구독 기간 연장 아님)
  - realtime(실시간): "구독 기간 자동 연장" (오늘 재발송 아님)
- 정책에 명시되지 않은 방식("오늘 중 재발송", "즉시 재발송", "담당자 확인 요청" 등) 금지
- 반드시 JSON 배열로만 응답: ["답변1", "답변2", "답변3"]
- 마크다운/볼드 금지, 순수 텍스트만`,
      messages: [{
        role: 'user',
        content: `[카테고리] ${inquiry.title}

[고객 문의]
${inquiry.content}

${subscriptionContext ? `${subscriptionContext}\n` : ''}
${thread ? `[대화 내역]\n${thread}` : ''}

위 맥락과 운영 정책에 맞는 관리자 답변 3개를 JSON 배열로 추천해주세요. 반드시 상품 타입별 기본 처리(fixed=내일 함께 발송, realtime=기간 연장)를 따라 작성하세요.`,
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    let suggestions: string[] = []
    try {
      const match = text.match(/\[[\s\S]*\]/)
      if (match) {
        suggestions = JSON.parse(match[0])
      }
    } catch {
      // 파싱 실패 시 빈 배열
    }

    return NextResponse.json({ suggestions })
  } catch (err: any) {
    console.error('[CS Suggestions]', err.message)
    return NextResponse.json({ suggestions: [] })
  }
}
