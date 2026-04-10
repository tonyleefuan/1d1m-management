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
    // 문의 + 답변 스레드 조회
    const { data: inquiry, error } = await supabase
      .from('cs_inquiries')
      .select('category, title, content, cs_replies(author_type, content, created_at)')
      .eq('id', params.id)
      .single()

    if (error || !inquiry) {
      return NextResponse.json({ error: '문의를 찾을 수 없습니다.' }, { status: 404 })
    }

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
- 다듬은 답변 텍스트만 출력. 설명/주석 금지`,
        messages: [{
          role: 'user',
          content: `[고객 문의 맥락]
카테고리: ${inquiry.title}
내용: ${inquiry.content}
${thread ? `\n[대화 내역]\n${thread}` : ''}

[관리자 초안]
${draft}

위 초안을 다듬어주세요.`,
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
고객 문의와 대화 맥락을 보고 관리자가 보낼 수 있는 답변 3개를 추천해주세요.

규칙:
- 존댓말, 친절하고 간결하게
- 각 답변은 2-3문장 이내
- 구체적인 조치 내용 포함 (확인 후 연락, 조치 완료 등)
- 반드시 JSON 배열로만 응답: ["답변1", "답변2", "답변3"]
- 마크다운/볼드 금지, 순수 텍스트만`,
      messages: [{
        role: 'user',
        content: `[카테고리] ${inquiry.title}

[고객 문의]
${inquiry.content}

${thread ? `[대화 내역]\n${thread}` : ''}

위 맥락에 맞는 관리자 답변 3개를 JSON 배열로 추천해주세요.`,
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
