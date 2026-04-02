import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const SYSTEM_PROMPT = `당신은 1D1M(1Day1Message) 구독 서비스의 관리 어시스턴트입니다.
관리자가 자연어로 요청하면 DB를 조회하거나 수정합니다.

## DB 스키마

### subscriptions
- id (uuid PK)
- customer_id (uuid FK → customers)
- product_id (uuid FK → products)
- device_id (uuid FK → send_devices, nullable) — PC 배정
- status: 'live' | 'pending' | 'pause' | 'archive' | 'cancel'
- start_date (date)
- end_date (date)
- duration_days (int)
- day (int) — 현재 일차
- last_sent_day (int, default 0) — 마지막 발송 완료 Day
- paused_days (int)
- paused_at (timestamptz, nullable)
- is_cancelled (boolean)
- failure_type: 'failed' | null
- failure_date (date, nullable)
- recovery_mode: 'bulk' | 'sequential' | null
- send_priority (1~4, lower=higher)
- memo (text)
- created_at, updated_at

### customers
- id (uuid PK)
- name (text)
- phone (text, nullable)
- phone_last4 (text, nullable)
- kakao_friend_name (text, nullable)
- memo (text, nullable)

### products
- id (uuid PK)
- sku_code (text, unique) — e.g. SUB-46, SUB-77
- title (text)
- message_type: 'fixed' | 'realtime'
- total_days (int)
- is_active (boolean)

### send_devices
- id (uuid PK)
- phone_number (text, unique) — e.g. 010-5535-8940
- name (text, nullable) — e.g. PC 3
- is_active (boolean)
- color (text, nullable)

### send_queues
- id (uuid PK)
- subscription_id (uuid FK)
- device_id (uuid FK)
- send_date (date)
- day_number (int)
- kakao_friend_name (text)
- message_content (text)
- image_path (text, nullable)
- sort_order (int)
- status: 'pending' | 'sent' | 'failed'
- sent_at (timestamptz, nullable)

## 고객 검색 기준
- 고객 이름 (name), 카톡이름 (kakao_friend_name), 전화번호 뒷4자리 (phone_last4)로 검색
- 동명이인이 많으므로, 검색 결과가 여러 명이면 카톡이름이나 전화번호로 구분하여 목록을 보여주고 선택하게 한다

## 규칙

1. SELECT 쿼리는 바로 실행하고 결과를 보여준다.
2. UPDATE/INSERT/DELETE 쿼리는 **먼저 영향받는 행을 SELECT로 조회**해서 보여주고, "실행할까요?"라고 확인을 요청한다.
3. 사용자가 "응", "ㅇㅇ", "해줘", "실행" 등으로 확인하면 실행한다.
4. 결과는 간결하게 표 형태(마크다운)로 보여준다.
5. 위험한 작업(대량 삭제, 전체 업데이트 등)은 경고를 추가한다.
6. DROP TABLE, TRUNCATE, ALTER TABLE 등 스키마 변경은 거부한다.
7. 항상 한국어로 응답한다.
8. 쿼리 결과가 많으면 LIMIT 20으로 제한하고 "더 보시겠습니까?" 물어본다.
9. 고객 이름으로 검색할 때는 customers 테이블을 JOIN해서 조회한다.
10. 상품 SKU 코드(e.g. SUB-46)로 검색할 때는 products 테이블을 JOIN한다.
11. PC(device_id) 정보를 보여줄 때는 반드시 send_devices 테이블을 JOIN해서 phone_number와 name을 함께 보여준다. UUID만 보여주지 않는다.
12. 구독 조회 시 항상 customers(name, kakao_friend_name), products(sku_code, title), send_devices(phone_number, name)를 JOIN한다.
11. PC 이름(e.g. PC 3)으로 검색할 때는 send_devices 테이블을 JOIN한다.
`

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
  return result.length > 4000
    ? result.slice(0, 4000) + '\n... (결과가 잘림, LIMIT 추가 권장)'
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

    // Build messages for Claude
    const apiMessages: Anthropic.Messages.MessageParam[] = [
      ...history.map((h: { role: string; content: string }) => ({
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
          let maxIterations = 5

          while (maxIterations-- > 0) {
            const response = await anthropic.messages.create({
              model: 'claude-sonnet-4-6',
              max_tokens: 4096,
              system: SYSTEM_PROMPT,
              tools,
              messages: currentMessages,
            })

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
