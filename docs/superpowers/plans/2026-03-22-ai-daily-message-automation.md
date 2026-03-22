# AI 일일 메시지 자동 생성 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 7개 실시간 상품의 일일 메시지를 Claude API로 자동 생성하고, 대시보드에서 확인/수정/승인하는 시스템 구축

**Architecture:** Vercel Cron(매일 18시 KST)이 API 라우트를 트리거하면, 상품별 프롬프트를 로드하고 Claude API(web_search + 메시지 생성)를 2단계로 호출하여 draft 메시지를 생성. 운영자가 대시보드에서 승인하면 발송 대상이 됨.

**Tech Stack:** Next.js 14 App Router, @anthropic-ai/sdk, Supabase PostgreSQL, Vercel Cron, TinyURL API

**Spec:** `docs/superpowers/specs/2026-03-22-ai-daily-message-automation-design.md`

---

### Task 1: DB 마이그레이션 — status 컬럼 + product_prompts 테이블

**Files:**
- Modify: Supabase SQL (직접 실행)
- Modify: `src/lib/types.ts:145-154`

- [ ] **Step 1: daily_messages에 status 컬럼 추가**

Supabase SQL Editor에서 실행:
```sql
ALTER TABLE daily_messages ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';
```

- [ ] **Step 2: product_prompts 테이블 생성**

Supabase SQL Editor에서 실행:
```sql
CREATE TABLE product_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  search_prompt TEXT NOT NULL,
  generation_prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id)
);
```

- [ ] **Step 3: DailyMessage 타입에 status 추가**

`src/lib/types.ts:145-154` 수정:
```typescript
export interface DailyMessage {
  id: string
  product_id: string
  send_date: string
  content: string
  image_path: string | null
  status: 'draft' | 'approved'
  created_by: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 4: ProductPrompt 타입 추가**

`src/lib/types.ts`에 추가:
```typescript
export interface ProductPrompt {
  id: string
  product_id: string
  search_prompt: string
  generation_prompt: string
  created_at: string
  updated_at: string
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add status field to DailyMessage, add ProductPrompt type"
```

---

### Task 2: 프롬프트 시드 데이터 삽입

**Files:**
- Read: `docs/prompts/SUB-*.md` (7개 파일)
- Modify: Supabase SQL (직접 실행)

- [ ] **Step 1: 각 SUB-*.md 파일에서 search_prompt와 generation_prompt 추출**

7개 프롬프트 파일을 읽고, 각 파일에서:
- `## 뉴스 검색 프롬프트 (search_prompt)` 섹션 → search_prompt
- `## 시스템 프롬프트` + `## 출력 포맷` 섹션 → generation_prompt

- [ ] **Step 2: product_prompts에 시드 데이터 INSERT**

각 상품에 대해 Supabase SQL로 실행. 예시:
```sql
INSERT INTO product_prompts (product_id, search_prompt, generation_prompt)
SELECT id, '검색 프롬프트 내용...', '생성 프롬프트 내용...'
FROM products WHERE sku_code = 'SUB-45';
```

7개 상품 모두 반복 실행.

- [ ] **Step 3: 삽입 확인**

```sql
SELECT p.sku_code, LENGTH(pp.search_prompt) as search_len, LENGTH(pp.generation_prompt) as gen_len
FROM product_prompts pp JOIN products p ON p.id = pp.product_id
ORDER BY p.sku_code;
```

---

### Task 3: URL 축약 유틸리티

**Files:**
- Create: `src/lib/ai/url-shortener.ts`

- [ ] **Step 1: url-shortener.ts 작성**

```typescript
/**
 * TinyURL API로 URL 축약. 실패 시 원본 URL 반환.
 */
export async function shortenUrl(url: string): Promise<string> {
  try {
    const res = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return url
    const shortened = await res.text()
    return shortened.startsWith('http') ? shortened : url
  } catch {
    return url
  }
}

/**
 * 텍스트 내 모든 URL을 축약 URL로 치환.
 * 이미 축약된 URL(tinyurl.com, bit.ly 등)은 건너뜀.
 */
export async function shortenUrlsInText(text: string): Promise<string> {
  const urlRegex = /https?:\/\/[^\s\]\)]+/g
  const urls = text.match(urlRegex) || []
  const skipDomains = ['tinyurl.com', 'bit.ly', 'bitly.com', 't.co']

  let result = text
  for (const url of urls) {
    if (skipDomains.some(d => url.includes(d))) continue
    const shortened = await shortenUrl(url)
    if (shortened !== url) {
      result = result.replace(url, shortened)
    }
  }
  return result
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ai/url-shortener.ts
git commit -m "feat: add TinyURL shortener utility"
```

---

### Task 4: Claude API 클라이언트

**Files:**
- Create: `src/lib/ai/claude.ts`

- [ ] **Step 1: @anthropic-ai/sdk 설치**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: claude.ts 작성**

```typescript
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const MODEL = 'claude-sonnet-4-20250514'

/**
 * 웹 검색 도구를 사용하여 뉴스 검색/선정
 */
export async function searchNews(
  searchPrompt: string,
  recentHistory: string,
  articleUrl?: string
): Promise<string> {
  const userMessage = articleUrl
    ? `다음 기사를 사용하세요: ${articleUrl}\n\n최근 7일간 이미 다룬 주제:\n${recentHistory}`
    : `오늘 날짜 기준으로 뉴스를 검색하세요.\n\n최근 7일간 이미 다룬 주제 (중복 회피):\n${recentHistory}`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: searchPrompt,
    tools: articleUrl ? [] : [
      { type: 'web_search_20250305' as const, name: 'web_search', max_uses: 5 }
    ],
    messages: [{ role: 'user', content: userMessage }],
  })

  // 텍스트 블록만 추출
  return response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

/**
 * 검색된 뉴스를 바탕으로 메시지 생성
 */
export async function generateMessage(
  generationPrompt: string,
  newsContext: string,
  recentHistory: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: generationPrompt,
    messages: [{
      role: 'user',
      content: `아래 뉴스를 바탕으로 메시지를 작성하세요.\n\n## 뉴스 내용\n${newsContext}\n\n## 최근 메시지 (참고용, 톤/포맷 참조)\n${recentHistory}`
    }],
  })

  return response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

/**
 * 기존 메시지를 지시에 따라 수정
 */
export async function modifyMessage(
  currentMessage: string,
  instruction: string,
  generationPrompt: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: generationPrompt,
    messages: [
      { role: 'user', content: `현재 메시지:\n${currentMessage}` },
      { role: 'assistant', content: currentMessage },
      { role: 'user', content: `다음 지시에 따라 위 메시지를 수정해주세요: ${instruction}\n\n수정된 전체 메시지만 출력하세요.` },
    ],
  })

  return response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/claude.ts package.json package-lock.json
git commit -m "feat: add Claude API client with search, generate, modify"
```

---

### Task 5: 메시지 생성 파이프라인

**Files:**
- Create: `src/lib/ai/message-generator.ts`

- [ ] **Step 1: message-generator.ts 작성**

```typescript
import { supabase } from '@/lib/supabase'
import { searchNews, generateMessage } from './claude'
import { shortenUrlsInText } from './url-shortener'

interface GenerateResult {
  sku: string
  status: 'success' | 'error'
  message_id?: string
  error?: string
}

/**
 * 단일 상품의 메시지 생성 파이프라인
 */
async function generateForProduct(
  productId: string,
  sku: string,
  searchPrompt: string,
  generationPrompt: string,
  targetDate: string,
  articleUrl?: string
): Promise<GenerateResult> {
  try {
    // 1. 최근 7일 히스토리 조회
    const { data: history } = await supabase
      .from('daily_messages')
      .select('send_date, content')
      .eq('product_id', productId)
      .gte('send_date', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
      .order('send_date', { ascending: false })
      .limit(7)

    const recentHistory = (history || [])
      .map(h => `[${h.send_date}] ${h.content.slice(0, 200)}...`)
      .join('\n\n')

    // 2. 뉴스 검색
    const newsContext = await searchNews(searchPrompt, recentHistory, articleUrl)

    // 3. 메시지 생성
    let message = await generateMessage(generationPrompt, newsContext, recentHistory)

    // 4. URL 축약 (인라인)
    message = await shortenUrlsInText(message)

    // 5. DB 저장 (UPSERT, approved는 덮어쓰지 않음)
    const { data: existing } = await supabase
      .from('daily_messages')
      .select('id, status')
      .eq('product_id', productId)
      .eq('send_date', targetDate)
      .single()

    if (existing?.status === 'approved') {
      return { sku, status: 'error', error: '이미 승인된 메시지가 있습니다' }
    }

    const { data, error } = await supabase
      .from('daily_messages')
      .upsert({
        product_id: productId,
        send_date: targetDate,
        content: message,
        status: 'draft',
      }, { onConflict: 'product_id,send_date' })
      .select('id')
      .single()

    if (error) throw error

    return { sku, status: 'success', message_id: data.id }
  } catch (err) {
    return { sku, status: 'error', error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * 배열을 n개씩 나누는 유틸
 */
function chunks<T>(arr: T[], n: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += n) {
    result.push(arr.slice(i, i + n))
  }
  return result
}

/**
 * 전체 상품 메시지 생성 (배치 처리)
 */
export async function generateDailyMessages(
  targetDate: string,
  skuFilter?: string,
  articleUrl?: string
): Promise<GenerateResult[]> {
  // 1. realtime 상품 + 프롬프트 조회
  let query = supabase
    .from('products')
    .select('id, sku_code, product_prompts(search_prompt, generation_prompt)')
    .eq('message_type', 'realtime')
    .eq('is_active', true)

  if (skuFilter) {
    query = query.eq('sku_code', skuFilter)
  }

  const { data: products, error } = await query
  if (error || !products?.length) {
    return [{ sku: skuFilter || 'ALL', status: 'error', error: '상품 조회 실패' }]
  }

  // 2. 3개씩 배치 처리
  const results: GenerateResult[] = []
  const batches = chunks(products, 3)

  for (const batch of batches) {
    const batchResults = await Promise.allSettled(
      batch.map(p => {
        const prompt = (p as any).product_prompts?.[0]
        if (!prompt) {
          return Promise.resolve({
            sku: p.sku_code,
            status: 'error' as const,
            error: '프롬프트 미설정'
          })
        }
        return generateForProduct(
          p.id,
          p.sku_code,
          prompt.search_prompt,
          prompt.generation_prompt,
          targetDate,
          articleUrl
        )
      })
    )

    for (const r of batchResults) {
      results.push(r.status === 'fulfilled' ? r.value : {
        sku: 'unknown',
        status: 'error',
        error: r.reason?.message || 'Unknown error'
      })
    }
  }

  return results
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ai/message-generator.ts
git commit -m "feat: add message generation pipeline with batch processing"
```

---

### Task 6: API 라우트 — generate-daily

**Files:**
- Create: `src/app/api/ai/generate-daily/route.ts`

- [ ] **Step 1: generate-daily/route.ts 작성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateDailyMessages } from '@/lib/ai/message-generator'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  // 이중 인증: CRON_SECRET 또는 세션
  const authHeader = request.headers.get('authorization')
  const cronSecret = authHeader?.replace('Bearer ', '')
  const isValidCron = cronSecret === process.env.CRON_SECRET

  if (!isValidCron) {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    }
  }

  // 파라미터 파싱
  const { searchParams } = new URL(request.url)
  const sku = searchParams.get('sku') || undefined
  const articleUrl = searchParams.get('article_url') || undefined

  // 대상 날짜: 기본값 내일 (KST)
  let targetDate = searchParams.get('date')
  if (!targetDate) {
    const tomorrow = new Date()
    tomorrow.setHours(tomorrow.getHours() + 9) // UTC → KST
    tomorrow.setDate(tomorrow.getDate() + 1)
    targetDate = tomorrow.toISOString().slice(0, 10)
  }

  const results = await generateDailyMessages(targetDate, sku, articleUrl)

  return NextResponse.json({ ok: true, date: targetDate, results })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/ai/generate-daily/route.ts
git commit -m "feat: add /api/ai/generate-daily endpoint with dual auth"
```

---

### Task 7: API 라우트 — modify-message, status, prompts

**Files:**
- Create: `src/app/api/ai/modify-message/route.ts`
- Create: `src/app/api/daily-messages/status/route.ts`
- Create: `src/app/api/ai/prompts/route.ts`

- [ ] **Step 1: modify-message/route.ts 작성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { modifyMessage } from '@/lib/ai/claude'
import { shortenUrlsInText } from '@/lib/ai/url-shortener'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { message_id, instruction } = await request.json()
  if (!message_id || !instruction) {
    return NextResponse.json({ error: 'message_id, instruction 필요' }, { status: 400 })
  }

  // 기존 메시지 + 프롬프트 조회
  const { data: msg } = await supabase
    .from('daily_messages')
    .select('content, product_id')
    .eq('id', message_id)
    .single()

  if (!msg) return NextResponse.json({ error: '메시지 없음' }, { status: 404 })

  const { data: prompt } = await supabase
    .from('product_prompts')
    .select('generation_prompt')
    .eq('product_id', msg.product_id)
    .single()

  // AI 수정
  let modified = await modifyMessage(
    msg.content,
    instruction,
    prompt?.generation_prompt || ''
  )
  modified = await shortenUrlsInText(modified)

  // 수정본 저장
  await supabase
    .from('daily_messages')
    .update({ content: modified, status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', message_id)

  return NextResponse.json({ ok: true, content: modified })
}
```

- [ ] **Step 2: status/route.ts 작성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { id, status } = await request.json()
  if (!id || !['draft', 'approved'].includes(status)) {
    return NextResponse.json({ error: 'id, status(draft|approved) 필요' }, { status: 400 })
  }

  const { error } = await supabase
    .from('daily_messages')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: prompts/route.ts 작성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data, error } = await supabase
    .from('product_prompts')
    .select('*, products(sku_code, title)')
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prompts: data })
}

export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { product_id, search_prompt, generation_prompt } = await request.json()
  if (!product_id) return NextResponse.json({ error: 'product_id 필요' }, { status: 400 })

  const { error } = await supabase
    .from('product_prompts')
    .upsert({
      product_id,
      search_prompt: search_prompt || '',
      generation_prompt: generation_prompt || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'product_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ai/modify-message/route.ts src/app/api/daily-messages/status/route.ts src/app/api/ai/prompts/route.ts
git commit -m "feat: add modify-message, status, prompts API routes"
```

---

### Task 8: 발송 쿼리 수정 — status 필터 추가

**Files:**
- Modify: `src/app/api/sending/generate/route.ts:57-62`

- [ ] **Step 1: daily_messages 쿼리에 status 필터 추가**

`src/app/api/sending/generate/route.ts` 61번째 줄 뒤에 추가:
```typescript
// 기존
.eq('product_id', productId)
.eq('send_date', today)
// 추가
.eq('status', 'approved')
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/sending/generate/route.ts
git commit -m "fix: filter daily_messages by status=approved in send queue"
```

---

### Task 9: Vercel Cron 설정 + 환경변수

**Files:**
- Modify: `vercel.json`
- Modify: `.env.local`

- [ ] **Step 1: vercel.json에 cron 추가**

```json
{
  "crons": [
    {
      "path": "/api/subscriptions/daily-update",
      "schedule": "0 */2 * * *"
    },
    {
      "path": "/api/ai/generate-daily",
      "schedule": "0 9 * * *"
    }
  ]
}
```

- [ ] **Step 2: .env.local에 CRON_SECRET 추가**

```bash
echo "CRON_SECRET=$(openssl rand -hex 32)" >> .env.local
```

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "feat: add Vercel Cron for daily message generation at 18:00 KST"
```

---

### Task 10: 대시보드 UI — 오늘 메시지 탭 확장

**Files:**
- Modify: `src/components/tabs/MessagesTab.tsx:328-504` (TodayMessagesPanel)
- Modify: `src/app/api/daily-messages/today-status/route.ts` (status 포함)

- [ ] **Step 1: today-status API에 status 필드 포함**

`src/app/api/daily-messages/today-status/route.ts`에서 select에 status 추가:
```typescript
// 기존: .select('product_id, send_date, content')
// 변경:
.select('product_id, send_date, content, status')
```

grid 데이터에 status 포함되도록 응답 구조 수정.

- [ ] **Step 2: TodayMessagesPanel 상단에 자동 생성 버튼 추가**

MessagesTab.tsx의 TodayMessagesPanel 컴포넌트 내, 기존 진행률 뱃지 옆에:
```tsx
const [generating, setGenerating] = useState(false)

async function handleGenerate() {
  setGenerating(true)
  try {
    const res = await fetch('/api/ai/generate-daily', { method: 'POST' })
    if (!res.ok) throw new Error('생성 실패')
    const data = await res.json()
    showSuccess(`${data.results.filter((r: any) => r.status === 'success').length}개 메시지 생성 완료`)
    fetchGrid() // 그리드 새로고침
  } catch (err) {
    showError('메시지 생성 실패')
  } finally {
    setGenerating(false)
  }
}

// JSX: 버튼
<Button onClick={handleGenerate} disabled={generating} size="sm">
  {generating ? <Spinner className="w-4 h-4 mr-1" /> : null}
  내일 메시지 자동 생성
</Button>
```

- [ ] **Step 3: 그리드 셀에 status 뱃지 추가**

셀 내용 표시 부분에 draft/approved 뱃지:
```tsx
{cellStatus === 'draft' && (
  <span className="text-xs bg-yellow-100 text-yellow-800 px-1 rounded">초안</span>
)}
{cellStatus === 'approved' && (
  <span className="text-xs bg-green-100 text-green-800 px-1 rounded">승인됨</span>
)}
```

- [ ] **Step 4: 메시지 편집 모달 확장**

기존 MessageEditModal에 추가 버튼:
- "승인" 버튼: `PATCH /api/daily-messages/status` → `{ id, status: 'approved' }`
- "재생성" 버튼: `POST /api/ai/generate-daily?sku=SUB-XX&date=YYYY-MM-DD`
- "AI 수정" 입력: instruction 텍스트 → `POST /api/ai/modify-message`

```tsx
// 승인 버튼
<Button onClick={() => handleStatusChange('approved')} variant="default">
  승인
</Button>

// 재생성 버튼
<Button onClick={() => handleRegenerate()} variant="outline">
  재생성
</Button>

// AI 수정
<div className="flex gap-2">
  <Input
    value={aiInstruction}
    onChange={e => setAiInstruction(e.target.value)}
    placeholder="수정 지시 (예: 좀 더 짧게)"
  />
  <Button onClick={() => handleAiModify()} variant="outline">
    AI 수정
  </Button>
</div>
```

- [ ] **Step 5: Commit**

```bash
git add src/components/tabs/MessagesTab.tsx src/app/api/daily-messages/today-status/route.ts
git commit -m "feat: add auto-generate button, status badges, AI modify to message UI"
```

---

### Task 11: 관리자 설정 — 프롬프트 관리 UI

**Files:**
- Modify: `src/components/tabs/AdminTab.tsx` (프롬프트 관리 섹션 추가)

- [ ] **Step 1: AdminTab에 프롬프트 관리 패널 추가**

AdminTab.tsx에 새 하위 패널 추가:
- 좌측: 상품 목록 (realtime 상품만)
- 우측: 선택된 상품의 search_prompt, generation_prompt 편집 Textarea
- 저장 버튼 → `PUT /api/ai/prompts`

```tsx
function PromptManagementPanel() {
  const [prompts, setPrompts] = useState<any[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [searchPrompt, setSearchPrompt] = useState('')
  const [genPrompt, setGenPrompt] = useState('')

  // GET /api/ai/prompts로 로드
  // 상품 선택 시 해당 프롬프트 표시
  // 저장 버튼 → PUT /api/ai/prompts
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tabs/AdminTab.tsx
git commit -m "feat: add prompt management panel in admin settings"
```

---

### Task 12: 통합 테스트 및 배포

- [ ] **Step 1: 로컬에서 generate-daily API 테스트**

```bash
curl -X POST http://localhost:3000/api/ai/generate-daily?sku=SUB-46 \
  -H "Cookie: $(cat .cookie)" \
  -v
```

Expected: SUB-46 상품에 대해 내일 날짜의 draft 메시지 생성.

- [ ] **Step 2: 대시보드에서 UI 테스트**

1. 오늘 메시지 탭에서 "내일 메시지 자동 생성" 버튼 클릭
2. draft 뱃지 확인
3. 셀 클릭 → 모달에서 내용 확인
4. "승인" 버튼 클릭 → approved로 변경 확인
5. "AI 수정" 입력 → 수정 결과 확인

- [ ] **Step 3: Vercel 환경변수 추가**

Vercel 대시보드에서:
- `ANTHROPIC_API_KEY` 추가
- `CRON_SECRET` 추가 (.env.local과 동일 값)

- [ ] **Step 4: Vercel 배포**

```bash
git push origin main
```

- [ ] **Step 5: 프로덕션에서 Cron 동작 확인**

Vercel Functions 로그에서 `/api/ai/generate-daily` 실행 확인 (다음 날 18:00 KST).
