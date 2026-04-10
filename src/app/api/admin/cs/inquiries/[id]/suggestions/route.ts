export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

    // 대화 맥락 구성
    const thread = replies
      .map((r: any) => `[${r.author_type === 'customer' ? '고객' : r.author_type === 'ai' ? 'AI' : '관리자'}] ${r.content}`)
      .join('\n\n')

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

    // JSON 파싱
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
