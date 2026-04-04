import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export const maxDuration = 60

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { messages } = (await req.json()) as { messages: ChatMessage[] }
  if (!messages?.length) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 })
  }

  // 현재 모든 정책을 DB에서 로드
  const { data: policies } = await supabase
    .from('cs_policies')
    .select('id, category, title, content, ai_instruction, sort_order')
    .order('sort_order', { ascending: true })

  const policyContext = policies?.map(p => {
    let text = `### [${p.id}] ${p.title} (${p.category})\n${p.content}`
    if (p.ai_instruction) text += `\n[AI 지시사항] ${p.ai_instruction}`
    return text
  }).join('\n\n---\n\n') || '(정책 없음)'

  const systemPrompt = `당신은 1Day1Message(1D1M) CS 운영 정책 관리 어시스턴트입니다.
관리자와 대화하며 운영 정책을 검토, 수정, 추가하는 것을 도와줍니다.

## 현재 등록된 운영 정책
${policyContext}

## 역할
1. 관리자가 두서 없이 말해도 체계적으로 정리해 줍니다.
2. 정책 간 모순이나 허점을 발견하면 지적합니다.
3. 수정/추가가 필요한 경우, 구체적인 정책 문구를 제안합니다.
4. 제안할 때는 반드시 아래 형식으로 출력하세요:

## 제안 형식
정책을 수정하거나 추가할 때는 반드시 아래 JSON 블록을 포함하세요:

${'```'}policy_action
{
  "action": "update" | "add",
  "id": "기존 정책 ID (update 시)",
  "category": "카테고리",
  "title": "정책 제목",
  "content": "정책 내용",
  "ai_instruction": "AI 지시사항 (선택)"
}
${'```'}

여러 정책을 한 번에 제안할 수 있습니다 (블록 여러 개).

## 주의사항
- 기존 정책을 수정할 때는 반드시 해당 정책의 ID를 포함하세요.
- 새 정책을 추가할 때는 action을 "add"로 하고 id는 생략하세요.
- 정책 내용은 고객에게 보이지 않습니다. 내부 운영 기준입니다.
- ai_instruction은 AI 자동응답 시 참고하는 추가 지시사항입니다.
- 제안 없이 단순 질문에 답할 때는 JSON 블록을 포함하지 마세요.
- 한국어로 대화합니다.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')

    // policy_action 블록 파싱
    const actionRegex = /```policy_action\n([\s\S]*?)\n```/g
    const actions: Array<{
      action: 'update' | 'add'
      id?: string
      category: string
      title: string
      content: string
      ai_instruction?: string
    }> = []

    let match
    while ((match = actionRegex.exec(text)) !== null) {
      try {
        actions.push(JSON.parse(match[1]))
      } catch { /* skip malformed */ }
    }

    // 제안 블록을 제거한 순수 텍스트
    const cleanText = text.replace(/```policy_action\n[\s\S]*?\n```/g, '').trim()

    return NextResponse.json({
      reply: cleanText,
      actions,
    })
  } catch (err: any) {
    console.error('[Policy Chat] Error:', err)
    return NextResponse.json({ error: err.message || 'AI 응답 실패' }, { status: 500 })
  }
}
