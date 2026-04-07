export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// 정적 시스템 프롬프트 — cache_control로 캐싱 (DB 스키마 + 규칙은 거의 변하지 않음)
const SYSTEM_PROMPT: Anthropic.Messages.TextBlockParam[] = [
  {
    type: 'text',
    text: `당신은 1D1M 구독 서비스의 관리 어시스턴트입니다. 관리자가 자연어로 요청하면 DB를 조회/수정합니다.

## DB 스키마
### subscriptions
id(uuid PK), customer_id(FK→customers), product_id(FK→products), device_id(FK→send_devices, nullable), status('live'|'pending'|'pause'|'archive'|'cancel'), start_date, end_date, duration_days(int), day(int, 현재 일차), last_sent_day(int, default 0), paused_days(int), paused_at(timestamptz), is_cancelled(bool), backlog_mode('flagged'|'bulk'|'sequential'|null), failure_date, send_priority(1~4), memo, created_at, updated_at

### customers
id(uuid PK), name, phone, phone_last4, kakao_friend_name, memo

### products
id(uuid PK), sku_code(unique, e.g. SUB-46), title, message_type('fixed'|'realtime'), total_days(int), is_active(bool)

### send_devices
id(uuid PK), phone_number(unique, e.g. 010-5535-8940), name(e.g. PC 3), is_active(bool), color

### send_queues
id(uuid PK), subscription_id(FK), device_id(FK), send_date, day_number(int), kakao_friend_name, message_content, image_path, sort_order(int), status('pending'|'sent'|'failed'), sent_at

## 규칙
1. SELECT → 바로 실행, 결과를 마크다운 표로.
2. UPDATE/INSERT/DELETE → 먼저 SELECT로 영향 행 보여주고 확인 요청.
3. "응","ㅇㅇ","해줘","실행" 등이면 실행.
4. 위험 작업(대량 삭제/전체 업데이트)은 경고. DROP/TRUNCATE/ALTER/CREATE 거부.
5. 한국어 응답. 결과 많으면 LIMIT 20 + "더 보시겠습니까?"
6. 고객 검색: name, kakao_friend_name, phone_last4. 동명이인이면 목록 보여주고 선택.
7. 구독 조회 시 항상 customers(name,kakao_friend_name), products(sku_code,title), send_devices(phone_number,name) JOIN.
8. PC 정보는 반드시 send_devices JOIN하여 phone_number+name 함께 표시.`,
    cache_control: { type: 'ephemeral' as const },
  },
]

const tools: Anthropic.Messages.Tool[] = [
  {
    name: 'execute_sql',
    description:
      'PostgreSQL 쿼리를 실행합니다. SELECT/UPDATE/INSERT/DELETE 모두 가능. 결과는 JSON 배열로 반환됩니다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'SQL 쿼리' },
        description: { type: 'string', description: '이 쿼리가 하는 일을 한국어로 설명' },
      },
      required: ['query', 'description'],
    },
  },
]

async function executeSql(query: string): Promise<string> {
  const { data, error } = await supabase.rpc('execute_raw_sql', {
    sql_query: query,
  })
  if (error) return JSON.stringify({ error: error.message })
  const result = JSON.stringify(data, null, 2)
  return result.length > 2000
    ? result.slice(0, 2000) + '\n... (결과가 잘림, LIMIT 추가 권장)'
    : result
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const { message, history = [] } = body
    if (!message)
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 },
      )

    // Build messages for Claude — 최근 20턴으로 제한 (토큰 절감)
    const MAX_CHAT_HISTORY = 20
    const trimmedHistory = history.length > MAX_CHAT_HISTORY
      ? history.slice(-MAX_CHAT_HISTORY)
      : history
    const apiMessages: Anthropic.Messages.MessageParam[] = [
      ...trimmedHistory.map((h: { role: string; content: string }) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user', content: message },
    ]

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: Record<string, unknown>) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          )
        }

        try {
          let currentMessages = [...apiMessages]
          let maxIterations = 3

          while (maxIterations-- > 0) {
            const response = await anthropic.messages.create({
              model: 'claude-haiku-4-6',
              max_tokens: 2048,
              system: SYSTEM_PROMPT,
              tools,
              messages: currentMessages,
            })
            const u = response.usage as any
            console.log(`[AI:workspace] tokens — input: ${u.input_tokens - (u.cache_read_input_tokens||0)}, cache_read: ${u.cache_read_input_tokens||0}, output: ${u.output_tokens}`)

            let hasToolUse = false
            const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []

            for (const block of response.content) {
              if (block.type === 'text' && block.text) {
                // Stream in small chunks for perceived streaming effect
                const text = block.text
                const chunkSize = 20
                for (let i = 0; i < text.length; i += chunkSize) {
                  send({ type: 'delta', text: text.slice(i, i + chunkSize) })
                }
              } else if (block.type === 'tool_use') {
                hasToolUse = true
                const input = block.input as {
                  query: string
                  description: string
                }

                // Block dangerous DDL queries
                const upper = input.query.toUpperCase().trim()
                if (/^(DROP|TRUNCATE|ALTER|CREATE)\s/i.test(upper)) {
                  toolResults.push({
                    type: 'tool_result',
                    tool_use_id: block.id,
                    content:
                      '스키마 변경 쿼리(DROP/TRUNCATE/ALTER/CREATE)는 실행할 수 없습니다.',
                  })
                  continue
                }

                send({
                  type: 'status',
                  text: `쿼리 실행 중: ${input.description}`,
                })
                const result = await executeSql(input.query)
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: result,
                })
              }
            }

            // If there were tool uses, feed results back and loop
            if (hasToolUse && toolResults.length > 0) {
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: response.content },
                { role: 'user', content: toolResults },
              ]
              continue
            }

            // No more tool use — done
            break
          }

          send({ type: 'done' })
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : 'AI 응답 생성 실패'
          send({ type: 'error', text: message })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : '채팅 처리 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
