export const dynamic = 'force-dynamic'
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

  // 정적 지시사항 (캐싱) + 동적 정책 (캐싱) 분리
  const systemPrompt: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: `당신은 1D1M CS 운영 정책 관리 어시스턴트입니다. 관리자와 대화하며 정책을 검토/수정/추가합니다.

## 역할
1. 두서없는 요청도 체계적으로 정리. 2. 정책 간 모순/허점 지적. 3. 구체적 문구 제안.

## 제안 형식 (수정/추가 시 반드시 아래 JSON 블록 포함)
${'```'}policy_action
{"action":"update"|"add", "id":"정책ID(update시)", "category":"카테고리", "title":"제목", "content":"내용", "ai_instruction":"AI지시(선택)"}
${'```'}

## 주의: 수정 시 ID 필수. 추가 시 action="add", id 생략. 단순 답변엔 JSON 없이. 한국어.`,
      cache_control: { type: 'ephemeral' as const },
    },
    {
      type: 'text',
      text: `## 현재 등록된 운영 정책\n${policyContext}`,
    },
  ]

  // 히스토리 트리밍 — 최근 20턴
  const MAX_POLICY_HISTORY = 20
  const trimmedMessages = messages.length > MAX_POLICY_HISTORY
    ? messages.slice(-MAX_POLICY_HISTORY)
    : messages

  try {
    // Opus → Sonnet 다운그레이드 (비용 75% 절감, 정책 정리에 Opus 불필요)
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: trimmedMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    })
    const u = response.usage as any
    console.log(`[AI:policy-chat] tokens — input: ${u.input_tokens - (u.cache_read_input_tokens||0)}, cache_read: ${u.cache_read_input_tokens||0}, output: ${u.output_tokens}`)

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
