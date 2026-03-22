# Day 시스템 서버 핵심 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Day 계산을 날짜 기반 자동 계산으로 전환하고, 매크로 API 3개를 구현한다.

**Architecture:** subscriptions 테이블에 새 칼럼 추가 후, Day/상태를 실시간 계산하는 유틸리티를 만들고, 기존 API를 마이그레이션한다. 매크로용 API 3개(queue, heartbeat, report)를 새로 만든다.

**Tech Stack:** Next.js 14 (App Router), Supabase (PostgreSQL), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-22-day-system-macro-design.md`

---

## 파일 구조

### 새로 생성
| 파일 | 책임 |
|------|------|
| `src/lib/day.ts` | Day 계산, 상태 판단, end_date 계산 유틸리티 |
| `src/lib/day.test.ts` | Day 계산 유틸리티 테스트 |
| `src/lib/queue-generator.ts` | 대기열 생성 공통 로직 (크론 + 온디맨드 공유) |
| `src/app/api/macro/queue/route.ts` | 매크로용 대기열 조회 + 온디맨드 생성 |
| `src/app/api/macro/heartbeat/route.ts` | 매크로 진행 상황 보고 |
| `src/app/api/macro/report/route.ts` | 매크로 발송 결과 보고 |
| `src/app/api/cron/generate-queue/route.ts` | 대기열 생성 크론 (02:00) |
| `vitest.config.ts` | 테스트 설정 |

### 수정
| 파일 | 변경 내용 |
|------|----------|
| `src/lib/types.ts` | Subscription 인터페이스에 새 필드 추가, 기존 필드 유지 (하위호환) |
| `src/app/api/subscriptions/list/route.ts` | Day/상태를 계산값으로 반환하도록 변경 |
| `src/app/api/subscriptions/update/route.ts` | 새 필드(failure_type, recovery_mode 등) 처리 추가 |
| `src/app/api/sending/generate/route.ts` | 새 Day 계산 로직 사용, day_number 칼럼 추가 |
| `src/middleware.ts` | 매크로 API 인증 로직 추가 |
| `package.json` | vitest 의존성 추가 |

---

### Task 1: 테스트 환경 설정

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: vitest 설치**

```bash
npm install -D vitest @vitejs/plugin-react
```

- [ ] **Step 2: vitest.config.ts 생성**

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 3: package.json에 test 스크립트 추가**

`package.json`의 `"scripts"`에 추가:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: 동작 확인**

Run: `npm test`
Expected: "No test files found" (아직 테스트 없으므로 정상)

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest test infrastructure"
```

---

### Task 2: DB 스키마 마이그레이션

**Files:**
- 작업: Supabase Dashboard 또는 SQL Editor에서 실행

- [ ] **Step 1: 새 칼럼 추가 SQL 작성 및 실행**

Supabase SQL Editor에서 실행:

```sql
-- 1. subscriptions 새 칼럼 추가 (기존 칼럼 유지, 하위호환)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS last_sent_day INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_days INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS failure_type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS failure_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recovery_mode TEXT DEFAULT NULL;

-- 2. send_queues에 day_number 추가 (subscription_id는 이미 존재)
ALTER TABLE send_queues
  ADD COLUMN IF NOT EXISTS day_number INT DEFAULT NULL;

-- 2.1. subscription_id 존재 확인 (없으면 추가)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'send_queues' AND column_name = 'subscription_id'
  ) THEN
    ALTER TABLE send_queues ADD COLUMN subscription_id UUID REFERENCES subscriptions(id);
  END IF;
END $$;

-- 2.2. send_devices에 sending_progress 칼럼 추가
ALTER TABLE send_devices
  ADD COLUMN IF NOT EXISTS sending_progress JSONB DEFAULT NULL;

-- 2.3. paused_days 증감용 RPC 함수 생성
CREATE OR REPLACE FUNCTION increment_paused_days(sub_id UUID, days INT)
RETURNS void AS $$
BEGIN
  UPDATE subscriptions
  SET paused_days = paused_days + days,
      paused_at = NULL,
      resume_date = NULL,
      updated_at = NOW()
  WHERE id = sub_id;
END;
$$ LANGUAGE plpgsql;

-- 3. 기존 데이터 마이그레이션
-- status = 'cancel' → is_cancelled = true
UPDATE subscriptions SET is_cancelled = true WHERE status = 'cancel';

-- last_send_failure → failure_type
UPDATE subscriptions SET failure_type = 'other', failure_date = CURRENT_DATE
  WHERE last_send_failure IS NOT NULL;

-- day → last_sent_day (day가 0보다 크면)
UPDATE subscriptions SET last_sent_day = GREATEST(day - 1, 0)
  WHERE day > 0;

-- 4. 인덱스
CREATE INDEX IF NOT EXISTS idx_subs_last_sent_day ON subscriptions(last_sent_day);
CREATE INDEX IF NOT EXISTS idx_subs_failure_type ON subscriptions(failure_type);
CREATE INDEX IF NOT EXISTS idx_subs_is_cancelled ON subscriptions(is_cancelled);
CREATE INDEX IF NOT EXISTS idx_send_queues_day_number ON send_queues(day_number);
```

- [ ] **Step 2: 마이그레이션 결과 확인**

Supabase SQL Editor에서 확인:
```sql
SELECT last_sent_day, paused_days, is_cancelled, failure_type, recovery_mode
FROM subscriptions LIMIT 5;
```

Expected: 새 칼럼이 기본값으로 채워져 있음

- [ ] **Step 3: Commit (마이그레이션 기록)**

```bash
echo "-- Migration executed on $(date)" > docs/migrations/2026-03-22-day-system.sql
# 위 SQL을 파일에 복사
git add docs/migrations/
git commit -m "docs: record day system DB migration SQL"
```

---

### Task 3: 타입 정의 업데이트

**Files:**
- Modify: `src/lib/types.ts:86-113`

- [ ] **Step 1: Subscription 인터페이스에 새 필드 추가**

`src/lib/types.ts`의 Subscription 인터페이스에 새 필드 추가 (기존 필드 유지):

```typescript
// --- 기존 필드 유지 (하위호환) ---
// day: number
// status: 'live' | 'pending' | 'pause' | 'archive' | 'cancel'
// last_send_failure: string | null

// --- 새 필드 추가 ---
last_sent_day: number           // 마지막 성공 발송 Day (0 = 미발송)
paused_days: number             // 총 정지 일수
is_cancelled: boolean           // 취소 여부
failure_type: 'friend_not_found' | 'device_error' | 'not_sent' | 'other' | null
failure_date: string | null     // 실패 발생일
recovery_mode: 'bulk' | 'sequential' | null
```

- [ ] **Step 2: 계산된 상태 타입 추가**

같은 파일 하단에 추가:

```typescript
// --- Day 시스템 계산 결과 ---
export type ComputedStatus = 'active' | 'pending' | 'completed' | 'paused' | 'cancelled'

export interface ComputedSubscription {
  current_day: number
  computed_status: ComputedStatus
  computed_end_date: string  // YYYY-MM-DD
  pending_days: number[]     // 발송해야 할 Day 목록
  missed_days: number        // 밀린 일수
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add new Day system types to Subscription interface"
```

---

### Task 4: Day 계산 유틸리티 — 테스트 작성

**Files:**
- Create: `src/lib/day.test.ts`

- [ ] **Step 1: 핵심 계산 테스트 작성**

```typescript
import { describe, it, expect } from 'vitest'
import { calcCurrentDay, calcComputedStatus, calcEndDate, calcPendingDays } from './day'

describe('calcCurrentDay', () => {
  it('시작일 당일이면 Day 1', () => {
    expect(calcCurrentDay({
      start_date: '2026-03-22',
      paused_days: 0,
      paused_at: null,
      today: '2026-03-22',
    })).toBe(1)
  })

  it('시작일 전이면 Day < 1', () => {
    expect(calcCurrentDay({
      start_date: '2026-03-25',
      paused_days: 0,
      paused_at: null,
      today: '2026-03-22',
    })).toBe(-2)
  })

  it('paused_days 반영', () => {
    expect(calcCurrentDay({
      start_date: '2026-03-01',
      paused_days: 5,
      paused_at: null,
      today: '2026-03-22',
    })).toBe(17) // 22 - 5 = 17
  })

  it('정지 중이면 active_pause 반영', () => {
    expect(calcCurrentDay({
      start_date: '2026-03-01',
      paused_days: 0,
      paused_at: '2026-03-20',
      today: '2026-03-22',
    })).toBe(20) // 22 - 2(active) = 20
  })

  it('정지 중 + 과거 정지 일수', () => {
    expect(calcCurrentDay({
      start_date: '2026-03-01',
      paused_days: 3,
      paused_at: '2026-03-20',
      today: '2026-03-22',
    })).toBe(17) // 22 - 3 - 2 = 17
  })
})

describe('calcComputedStatus', () => {
  it('is_cancelled이면 cancelled', () => {
    expect(calcComputedStatus({
      is_cancelled: true,
      paused_at: null,
      current_day: 10,
      last_sent_day: 5,
      duration_days: 365,
    })).toBe('cancelled')
  })

  it('paused_at이 있으면 paused', () => {
    expect(calcComputedStatus({
      is_cancelled: false,
      paused_at: '2026-03-20',
      current_day: 10,
      last_sent_day: 5,
      duration_days: 365,
    })).toBe('paused')
  })

  it('current_day < 1이면 pending', () => {
    expect(calcComputedStatus({
      is_cancelled: false,
      paused_at: null,
      current_day: -2,
      last_sent_day: 0,
      duration_days: 365,
    })).toBe('pending')
  })

  it('last_sent_day >= duration_days이면 completed', () => {
    expect(calcComputedStatus({
      is_cancelled: false,
      paused_at: null,
      current_day: 370,
      last_sent_day: 365,
      duration_days: 365,
    })).toBe('completed')
  })

  it('그 외에는 active', () => {
    expect(calcComputedStatus({
      is_cancelled: false,
      paused_at: null,
      current_day: 37,
      last_sent_day: 36,
      duration_days: 365,
    })).toBe('active')
  })
})

describe('calcEndDate', () => {
  it('정상 케이스', () => {
    expect(calcEndDate({
      start_date: '2026-03-01',
      duration_days: 90,
      paused_days: 0,
      active_pause: 0,
      missed_days: 0,
    })).toBe('2026-05-29') // 3/1 + 89
  })

  it('밀린 일수 + 정지 일수 반영', () => {
    expect(calcEndDate({
      start_date: '2026-03-01',
      duration_days: 90,
      paused_days: 5,
      active_pause: 0,
      missed_days: 2,
    })).toBe('2026-06-05') // 3/1 + 89 + 5 + 2
  })
})

describe('calcPendingDays', () => {
  it('정상: 1개', () => {
    expect(calcPendingDays(36, 37)).toEqual([37])
  })

  it('1일 밀림: 2개', () => {
    expect(calcPendingDays(36, 38)).toEqual([37, 38])
  })

  it('2일 밀림: 3개', () => {
    expect(calcPendingDays(36, 39)).toEqual([37, 38, 39])
  })

  it('last_sent_day >= current_day: 빈 배열', () => {
    expect(calcPendingDays(37, 37)).toEqual([])
  })
})

describe('computeSubscription', () => {
  it('정상 활성 구독', () => {
    const result = computeSubscription({
      start_date: '2026-03-01',
      duration_days: 365,
      last_sent_day: 20,
      paused_days: 0,
      paused_at: null,
      is_cancelled: false,
    }, '2026-03-22')

    expect(result.current_day).toBe(22)
    expect(result.computed_status).toBe('active')
    expect(result.pending_days).toEqual([21, 22])
    expect(result.missed_days).toBe(1) // 22 - 20 - 1 = 1
  })

  it('정지 중 구독', () => {
    const result = computeSubscription({
      start_date: '2026-03-01',
      duration_days: 365,
      last_sent_day: 9,
      paused_days: 0,
      paused_at: '2026-03-10',
      is_cancelled: false,
    }, '2026-03-22')

    expect(result.current_day).toBe(10) // 정지 중 Day 안 올라감
    expect(result.computed_status).toBe('paused')
  })

  it('start_date가 null이면 pending', () => {
    const result = computeSubscription({
      start_date: null,
      duration_days: 365,
      last_sent_day: 0,
      paused_days: 0,
      paused_at: null,
      is_cancelled: false,
    })

    expect(result.computed_status).toBe('pending')
    expect(result.current_day).toBe(0)
  })
})
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npx vitest run src/lib/day.test.ts`
Expected: FAIL (day.ts 파일이 없으므로)

- [ ] **Step 3: Commit**

```bash
git add src/lib/day.test.ts
git commit -m "test: add Day calculation utility tests"
```

---

### Task 5: Day 계산 유틸리티 — 구현

**Files:**
- Create: `src/lib/day.ts`

- [ ] **Step 1: Day 계산 유틸리티 구현**

```typescript
import { ComputedStatus } from './types'

// KST 기준 오늘 날짜 (YYYY-MM-DD)
export function todayKST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

// 두 날짜 사이의 일수 차이
function diffDays(a: string, b: string): number {
  const msPerDay = 86400000
  return Math.floor((new Date(a).getTime() - new Date(b).getTime()) / msPerDay)
}

// 날짜에 일수 더하기
function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

interface CalcCurrentDayInput {
  start_date: string
  paused_days: number
  paused_at: string | null
  today?: string
}

export function calcCurrentDay(input: CalcCurrentDayInput): number {
  const today = input.today || todayKST()
  const elapsed = diffDays(today, input.start_date) + 1
  const activePause = input.paused_at ? Math.max(0, diffDays(today, input.paused_at)) : 0
  return elapsed - input.paused_days - activePause
}

interface CalcStatusInput {
  is_cancelled: boolean
  paused_at: string | null
  current_day: number
  last_sent_day: number
  duration_days: number
}

export function calcComputedStatus(input: CalcStatusInput): ComputedStatus {
  if (input.is_cancelled) return 'cancelled'
  if (input.paused_at) return 'paused'
  if (input.current_day < 1) return 'pending'
  if (input.last_sent_day >= input.duration_days) return 'completed'
  return 'active'
}

interface CalcEndDateInput {
  start_date: string
  duration_days: number
  paused_days: number
  active_pause: number
  missed_days: number
}

export function calcEndDate(input: CalcEndDateInput): string {
  const totalExtra = input.paused_days + input.active_pause + input.missed_days
  return addDays(input.start_date, input.duration_days - 1 + totalExtra)
}

export function calcPendingDays(lastSentDay: number, currentDay: number): number[] {
  if (lastSentDay >= currentDay) return []
  const days: number[] = []
  for (let d = lastSentDay + 1; d <= currentDay; d++) {
    days.push(d)
  }
  return days
}

export function calcMissedDays(currentDay: number, lastSentDay: number): number {
  return Math.max(0, currentDay - lastSentDay - 1)
}

// 구독 행에서 모든 계산값을 한 번에 산출
export function computeSubscription(sub: {
  start_date: string | null
  duration_days: number
  last_sent_day: number
  paused_days: number
  paused_at: string | null
  is_cancelled: boolean
}, today?: string) {
  const t = today || todayKST()

  if (!sub.start_date) {
    return {
      current_day: 0,
      computed_status: 'pending' as ComputedStatus,
      computed_end_date: '',
      pending_days: [] as number[],
      missed_days: 0,
    }
  }

  const activePause = sub.paused_at ? Math.max(0, diffDays(t, sub.paused_at)) : 0
  const currentDay = calcCurrentDay({
    start_date: sub.start_date,
    paused_days: sub.paused_days,
    paused_at: sub.paused_at,
    today: t,
  })

  const computedStatus = calcComputedStatus({
    is_cancelled: sub.is_cancelled,
    paused_at: sub.paused_at,
    current_day: currentDay,
    last_sent_day: sub.last_sent_day,
    duration_days: sub.duration_days,
  })

  const missedDays = calcMissedDays(currentDay, sub.last_sent_day)

  const computedEndDate = calcEndDate({
    start_date: sub.start_date,
    duration_days: sub.duration_days,
    paused_days: sub.paused_days,
    active_pause: activePause,
    missed_days: missedDays,
  })

  const pendingDays = calcPendingDays(sub.last_sent_day, currentDay)

  return {
    current_day: currentDay,
    computed_status: computedStatus,
    computed_end_date: computedEndDate,
    pending_days: pendingDays,
    missed_days: missedDays,
  }
}
```

- [ ] **Step 2: 테스트 실행 — 통과 확인**

Run: `npx vitest run src/lib/day.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/day.ts
git commit -m "feat: implement Day calculation utility with KST support"
```

---

### Task 6: 매크로 API 인증 미들웨어

**Files:**
- Create: `src/lib/macro-auth.ts`
- Modify: `src/middleware.ts`

- [ ] **Step 1: 매크로 인증 헬퍼 생성**

`src/lib/macro-auth.ts`:

```typescript
export function validateMacroApiKey(request: Request): boolean {
  const auth = request.headers.get('authorization')
  if (!auth) return false
  const token = auth.replace('Bearer ', '')
  return token === process.env.MACRO_API_KEY
}
```

- [ ] **Step 2: middleware.ts에 매크로 인증 추가**

`src/middleware.ts`의 `/api/macro/` 처리 부분을 수정. 현재는 완전 public인데, api_key 체크 추가:

기존 PUBLIC_PATHS에서 `/api/macro/`를 제거하고, 별도 처리:

```typescript
const PUBLIC_PATHS = ['/login', '/api/auth/login']
const MACRO_PATHS = ['/api/macro/']

// middleware 함수 내:
if (MACRO_PATHS.some(p => pathname.startsWith(p))) {
  const auth = req.headers.get('authorization')
  const macroKey = process.env.MACRO_API_KEY
  if (!macroKey || auth !== `Bearer ${macroKey}`) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }
  return NextResponse.next()
}
```

- [ ] **Step 3: .env.local에 MACRO_API_KEY 추가**

```
MACRO_API_KEY=1d1m-macro-secret-key-change-in-production
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/macro-auth.ts src/middleware.ts
git commit -m "feat: add macro API key authentication"
```

---

### Task 7: 매크로 API — GET /api/macro/queue

**Files:**
- Create: `src/app/api/macro/queue/route.ts`

- [ ] **Step 1: queue API 구현**

```typescript
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { todayKST, computeSubscription } from '@/lib/day'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const deviceId = searchParams.get('device_id')
  if (!deviceId) return NextResponse.json({ error: 'device_id required' }, { status: 400 })

  const today = todayKST()

  // 오늘 대기열이 이미 있는지 확인
  const { data: existing, error: existErr } = await supabase
    .from('send_queues')
    .select('*')
    .eq('device_id', deviceId)
    .eq('send_date', today)

  if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 })

  // 있으면 반환
  if (existing && existing.length > 0) {
    return NextResponse.json({
      data: existing.sort((a: any, b: any) => a.sort_order - b.sort_order),
      total: existing.length,
      date: today,
    })
  }

  // 없으면 이 PC 것만 온디맨드 생성 (백업)
  const result = await generateQueueForDevice(deviceId, today)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 })

  return NextResponse.json({
    data: result.data,
    total: result.data.length,
    date: today,
  })
}

async function generateQueueForDevice(deviceId: string, today: string) {
  // 이 PC에 배정된 활성 구독 조회
  const { data: subs, error: subErr } = await supabase
    .from('subscriptions')
    .select(`
      id, customer_id, product_id, device_id,
      start_date, duration_days, last_sent_day, paused_days, paused_at,
      is_cancelled, failure_type, recovery_mode, send_priority,
      customer:customers(kakao_friend_name),
      product:products(sku_code, message_type),
      order_item:order_items(order:orders(ordered_at))
    `)
    .eq('device_id', deviceId)
    .eq('is_cancelled', false)
    .is('paused_at', null)

  if (subErr) return { error: subErr.message }
  if (!subs?.length) return { data: [] }

  // 메시지 캐시
  const msgCache = new Map<string, any[]>()

  async function getMessages(productId: string, messageType: string, day: number) {
    const key = `${productId}:${day}:${messageType}`
    if (msgCache.has(key)) return msgCache.get(key)!

    let messages: any[] = []
    if (messageType === 'realtime') {
      const { data } = await supabase
        .from('daily_messages')
        .select('content, image_path')
        .eq('product_id', productId)
        .eq('send_date', today)
        .limit(1)
      if (data?.length) messages = [{ content: data[0].content, image_path: data[0].image_path, sort_order: 1 }]
    } else {
      const { data } = await supabase
        .from('messages')
        .select('content, image_path, sort_order')
        .eq('product_id', productId)
        .eq('day_number', day)
        .order('sort_order', { ascending: true })
      if (data?.length) messages = data
    }
    msgCache.set(key, messages)
    return messages
  }

  // 구독별로 보낼 Day 결정
  const queueRows: any[] = []
  let sortOrder = 0

  // 사람별 묶음 + 발송순서 정렬
  const sorted = subs
    .filter(sub => {
      const computed = computeSubscription(sub as any, today)
      if (computed.computed_status !== 'active') return false
      if (sub.failure_type === 'friend_not_found' || sub.failure_type === 'other') return false

      const pendingCount = computed.pending_days.length
      if (sub.recovery_mode === null && pendingCount >= 3) return false
      if (pendingCount === 0) return false
      return true
    })
    .sort((a, b) => (a.send_priority || 3) - (b.send_priority || 3))

  // 사람별로 그룹화
  const personGroups = new Map<string, typeof sorted>()
  for (const sub of sorted) {
    const name = (sub.customer as any)?.kakao_friend_name || 'unknown'
    const group = personGroups.get(name) || []
    group.push(sub)
    personGroups.set(name, group)
  }

  // 사람별로 대기열 생성
  for (const [friendName, personSubs] of personGroups) {
    for (const sub of personSubs) {
      const computed = computeSubscription(sub as any, today)
      const product = sub.product as any

      // recovery_mode에 따라 보낼 Day 결정
      let daysToSend: number[]
      if (sub.recovery_mode === 'bulk') {
        daysToSend = computed.pending_days
      } else if (sub.recovery_mode === 'sequential') {
        daysToSend = [sub.last_sent_day + 1]
      } else {
        // null: pending_count 1이면 1개, 2이면 2개
        daysToSend = computed.pending_days.slice(0, 2)
      }

      for (const dayNum of daysToSend) {
        if (dayNum < 1 || dayNum > sub.duration_days) continue
        const messages = await getMessages(sub.product_id, product?.message_type, dayNum)
        if (!messages.length) continue

        for (const msg of messages) {
          sortOrder++
          queueRows.push({
            subscription_id: sub.id,
            device_id: deviceId,
            send_date: today,
            day_number: dayNum,
            kakao_friend_name: friendName,
            message_content: msg.content || '',
            image_path: msg.image_path || null,
            sort_order: sortOrder,
            status: 'pending',
          })
        }
      }
    }
  }

  if (queueRows.length > 0) {
    // 배치 삽입
    for (let i = 0; i < queueRows.length; i += 500) {
      const batch = queueRows.slice(i, i + 500)
      const { error } = await supabase.from('send_queues').insert(batch)
      if (error) return { error: `대기열 생성 실패: ${error.message}` }
    }
  }

  return { data: queueRows }
}
```

- [ ] **Step 2: 동작 확인**

```bash
curl -H "Authorization: Bearer $MACRO_API_KEY" \
  "http://localhost:3000/api/macro/queue?device_id=010-2785-8940"
```

Expected: JSON 응답 (data 배열, total, date)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/macro/queue/route.ts
git commit -m "feat: implement macro queue API with on-demand generation"
```

---

### Task 8: 매크로 API — POST /api/macro/heartbeat

**Files:**
- Create: `src/app/api/macro/heartbeat/route.ts`

- [ ] **Step 1: heartbeat API 구현**

```typescript
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: Request) {
  const body = await req.json()
  const { device_id, pending, sent, failed, total } = body

  if (!device_id) return NextResponse.json({ error: 'device_id required' }, { status: 400 })

  const { error } = await supabase
    .from('send_devices')
    .update({
      last_heartbeat: new Date().toISOString(),
      sending_progress: { pending, sent, failed, total },
    })
    .eq('phone_number', device_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/macro/heartbeat/route.ts
git commit -m "feat: implement macro heartbeat API"
```

---

### Task 9: 매크로 API — POST /api/macro/report

**Files:**
- Create: `src/app/api/macro/report/route.ts`

- [ ] **Step 1: report API 구현**

```typescript
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { todayKST } from '@/lib/day'

export async function POST(req: Request) {
  const body = await req.json()
  const { device_id, date, results } = body

  if (!device_id || !results?.length) {
    return NextResponse.json({ error: 'device_id and results required' }, { status: 400 })
  }

  const reportDate = date || todayKST()

  // 1. send_queues 상태 업데이트 (배치)
  for (const r of results) {
    await supabase
      .from('send_queues')
      .update({
        status: r.status,
        sent_at: r.status === 'sent' ? new Date().toISOString() : null,
        error_message: r.error_type || null,
      })
      .eq('id', r.queue_id)
  }

  // 2. 구독별 성공/실패 집계
  // queue_id → subscription_id + day_number 매핑 조회
  const queueIds = results.map((r: any) => r.queue_id)
  const { data: queueItems } = await supabase
    .from('send_queues')
    .select('id, subscription_id, day_number, status')
    .in('id', queueIds)

  if (!queueItems) return NextResponse.json({ ok: true, processed: 0 })

  // 구독별로 그룹화
  const subMap = new Map<string, { days: Map<number, boolean[]>, errorType: string | null }>()

  for (const item of queueItems) {
    if (!subMap.has(item.subscription_id)) {
      subMap.set(item.subscription_id, { days: new Map(), errorType: null })
    }
    const sub = subMap.get(item.subscription_id)!

    if (!sub.days.has(item.day_number)) {
      sub.days.set(item.day_number, [])
    }
    sub.days.get(item.day_number)!.push(item.status === 'sent')

    // 실패 유형 기록
    if (item.status === 'failed') {
      const result = results.find((r: any) => r.queue_id === item.id)
      if (result?.error_type) sub.errorType = result.error_type
    }
  }

  // 3. 구독별 last_sent_day 업데이트
  for (const [subId, info] of subMap) {
    // Day별로 전체 성공 여부 확인
    let maxCompletedDay = 0
    let allSuccess = true

    // 연속된 성공 Day 찾기
    const sortedDays = [...info.days.entries()].sort((a, b) => a[0] - b[0])
    for (const [dayNum, results] of sortedDays) {
      const daySuccess = results.every(r => r === true)
      if (daySuccess) {
        maxCompletedDay = dayNum
      } else {
        allSuccess = false
        break
      }
    }

    if (allSuccess && maxCompletedDay > 0) {
      // 전체 성공: last_sent_day 업데이트, failure 초기화, recovery_mode 초기화
      const updates: any = {
        last_sent_day: maxCompletedDay,
        failure_type: null,
        failure_date: null,
        updated_at: new Date().toISOString(),
      }

      // recovery_mode 초기화 조건 확인
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('recovery_mode')
        .eq('id', subId)
        .single()

      if (sub?.recovery_mode === 'bulk') {
        updates.recovery_mode = null
      }
      // sequential은 calcPendingDays로 확인 필요 — 다음 크론에서 처리

      await supabase.from('subscriptions').update(updates).eq('id', subId)
    } else if (info.errorType) {
      // 실패: failure_type 설정
      await supabase.from('subscriptions').update({
        failure_type: info.errorType,
        failure_date: reportDate,
        updated_at: new Date().toISOString(),
      }).eq('id', subId)
    }
  }

  // 4. 사람 단위 friend_not_found 전파
  const friendNotFoundSubs = [...subMap.entries()]
    .filter(([_, info]) => info.errorType === 'friend_not_found')

  for (const [subId, _] of friendNotFoundSubs) {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('customer_id, device_id')
      .eq('id', subId)
      .single()

    if (sub) {
      // 같은 사람, 같은 PC의 다른 구독도 실패 처리
      await supabase.from('subscriptions').update({
        failure_type: 'friend_not_found',
        failure_date: reportDate,
        updated_at: new Date().toISOString(),
      })
      .eq('customer_id', sub.customer_id)
      .eq('device_id', sub.device_id)
      .is('failure_type', null)
    }
  }

  return NextResponse.json({
    ok: true,
    processed: subMap.size,
    date: reportDate,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/macro/report/route.ts
git commit -m "feat: implement macro report API with failure propagation"
```

---

### Task 10: 대기열 생성 크론 API

**Files:**
- Create: `src/app/api/cron/generate-queue/route.ts`

- [ ] **Step 1: 크론 API 구현**

```typescript
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { todayKST, computeSubscription } from '@/lib/day'

export async function POST(req: Request) {
  // Vercel Cron 또는 admin 인증
  const cronSecret = req.headers.get('authorization')
  const isVercelCron = cronSecret === `Bearer ${process.env.CRON_SECRET}`

  if (!isVercelCron) {
    // admin 세션 체크 (기존 getSession 사용)
    const { getSession } = await import('@/lib/auth')
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const today = todayKST()
  const yesterday = new Date(new Date(today).getTime() - 86400000).toISOString().slice(0, 10)

  // === 사전 처리 (스펙 섹션 9.0) ===

  // 1. not_sent 감지: 어제 send_queues에서 status='pending' 건
  const { data: unreportedQueues } = await supabase
    .from('send_queues')
    .select('subscription_id')
    .eq('send_date', yesterday)
    .eq('status', 'pending')

  if (unreportedQueues?.length) {
    const unreportedSubIds = [...new Set(unreportedQueues.map(q => q.subscription_id))]
    for (const subId of unreportedSubIds) {
      await supabase.from('subscriptions').update({
        failure_type: 'not_sent',
        failure_date: yesterday,
        updated_at: new Date().toISOString(),
      }).eq('id', subId).is('failure_type', null)
    }
    // 해당 queue 항목도 failed 처리
    await supabase.from('send_queues')
      .update({ status: 'failed', error_message: 'not_sent' })
      .eq('send_date', yesterday)
      .eq('status', 'pending')
  }

  // 2. 자동 정지 해제: resume_date <= 오늘
  const { data: resumeSubs } = await supabase
    .from('subscriptions')
    .select('id, paused_at')
    .not('paused_at', 'is', null)
    .lte('resume_date', today)

  if (resumeSubs?.length) {
    for (const sub of resumeSubs) {
      if (sub.paused_at) {
        const pauseDays = Math.max(0, Math.floor(
          (new Date(today).getTime() - new Date(sub.paused_at).getTime()) / 86400000
        ))
        // RPC로 paused_days += pauseDays (기존값 보존)
        await supabase.rpc('increment_paused_days', {
          sub_id: sub.id,
          days: pauseDays,
        })
      }
    }
  }

  // 3. sequential recovery_mode 초기화: 따라잡은 구독
  const { data: seqSubs } = await supabase
    .from('subscriptions')
    .select('id, start_date, duration_days, last_sent_day, paused_days, paused_at, is_cancelled')
    .eq('recovery_mode', 'sequential')

  if (seqSubs?.length) {
    for (const sub of seqSubs) {
      const computed = computeSubscription(sub as any, today)
      if (sub.last_sent_day >= computed.current_day - 1) {
        await supabase.from('subscriptions').update({
          recovery_mode: null,
          updated_at: new Date().toISOString(),
        }).eq('id', sub.id)
      }
    }
  }

  // 4. 2일 연속 실패 전환: pending_count >= 3이고 device_error/not_sent인 구독
  // → 대기열 생성 시 자동 제외됨 (pending_count >= 3 체크)

  // === 대기열 생성 ===

  // 활성 PC 목록 조회
  const { data: devices } = await supabase
    .from('send_devices')
    .select('id, phone_number')
    .eq('is_active', true)
    .order('phone_number')

  if (!devices?.length) {
    return NextResponse.json({ ok: true, message: '활성 PC 없음', devices: 0, total: 0 })
  }

  // 기존 오늘 대기열 확인
  const { count: existingCount } = await supabase
    .from('send_queues')
    .select('id', { count: 'exact', head: true })
    .eq('send_date', today)

  if (existingCount && existingCount > 0) {
    return NextResponse.json({
      error: `오늘(${today}) 대기열이 이미 ${existingCount}건 존재합니다.`,
    }, { status: 400 })
  }

  // PC별 순차 생성 (스펙 섹션 9.6)
  // generateQueueForDevice는 src/lib/queue-generator.ts로 추출하여 공유
  const { generateQueueForDevice } = await import('@/lib/queue-generator')
  const summary: Record<string, number> = {}
  let totalGenerated = 0

  for (const device of devices) {
    const result = await generateQueueForDevice(device.phone_number, today)
    const count = 'error' in result ? 0 : result.data.length
    summary[device.phone_number] = count
    totalGenerated += count
  }

  // TODO: 슬랙 알림 (Phase 7에서 구현)

  return NextResponse.json({
    ok: true,
    date: today,
    devices: devices.length,
    total: totalGenerated,
    summary,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cron/generate-queue/route.ts
git commit -m "feat: implement queue generation cron with pre-processing"
```

---

### Task 11: subscriptions/list API — Day 계산값 반환

**Files:**
- Modify: `src/app/api/subscriptions/list/route.ts`

- [ ] **Step 1: 기존 enriched 로직을 computeSubscription으로 교체**

`src/app/api/subscriptions/list/route.ts`의 enriched 매핑 부분 (lines 76-87)을 수정:

기존:
```typescript
const enriched = data?.map(sub => {
  let dDay: number | null = null
  // ... 기존 로직
  return { ...sub, d_day: dDay, is_started: isStarted }
})
```

교체:
```typescript
import { computeSubscription, todayKST } from '@/lib/day'

const today = todayKST()
const enriched = data?.map(sub => {
  const computed = computeSubscription({
    start_date: sub.start_date,
    duration_days: sub.duration_days,
    last_sent_day: sub.last_sent_day ?? 0,
    paused_days: sub.paused_days ?? 0,
    paused_at: sub.paused_at,
    is_cancelled: sub.is_cancelled ?? false,
  }, today)

  // 기존 호환 필드 + 새 계산 필드
  return {
    ...sub,
    // 기존 (하위호환)
    d_day: computed.computed_status === 'paused' ? null
      : sub.end_date ? Math.ceil((new Date(computed.computed_end_date).getTime() - new Date(today).getTime()) / 86400000)
      : null,
    is_started: computed.current_day >= 1,
    // 새 계산 필드
    current_day: computed.current_day,
    computed_status: computed.computed_status,
    computed_end_date: computed.computed_end_date,
    pending_days: computed.pending_days,
    missed_days: computed.missed_days,
  }
})
```

- [ ] **Step 2: 로컬에서 목록 확인**

```bash
curl http://localhost:3000/api/subscriptions/list?limit=5
```

Expected: 응답에 `current_day`, `computed_status`, `computed_end_date` 필드 포함

- [ ] **Step 3: Commit**

```bash
git add src/app/api/subscriptions/list/route.ts
git commit -m "feat: return computed Day values in subscriptions list API"
```

---

### Task 12: subscriptions/update API — 실패 해제 처리

**Files:**
- Modify: `src/app/api/subscriptions/update/route.ts`

- [ ] **Step 1: 실패 해제 엔드포인트 추가**

기존 PATCH 핸들러에 `resolve_failure` 액션 추가:

```typescript
// 실패 해제 처리
if (updates.resolve_failure) {
  const { action } = updates.resolve_failure
  // action: 'manual_sent' | 'bulk' | 'sequential'

  const today = todayKST()
  const computed = computeSubscription(prev, today)

  const updateData: any = {
    failure_type: null,
    failure_date: null,
    updated_at: new Date().toISOString(),
  }

  if (action === 'manual_sent') {
    // 직접 보냈어요: last_sent_day = current_day
    updateData.last_sent_day = computed.current_day
    updateData.recovery_mode = null
  } else if (action === 'bulk') {
    // 몰아서 보내기
    updateData.recovery_mode = 'bulk'
  } else if (action === 'sequential') {
    // 하루씩 순서대로
    updateData.recovery_mode = 'sequential'
  }

  await supabase.from('subscriptions').update(updateData).eq('id', targetId)

  // 로그 기록
  await supabase.from('subscription_logs').insert({
    subscription_id: targetId,
    action: 'resolve_failure',
    field: 'failure_type',
    old_value: prev.failure_type,
    new_value: action,
    user_id: session.id,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/subscriptions/update/route.ts
git commit -m "feat: add failure resolution to subscriptions update API"
```

---

## 다음 계획

이 계획이 완료되면 서버 핵심 로직이 동작합니다. 이후 순서:

1. **Plan 2: 구독 관리 UI** — 상태/발송상태/정지재개 칼럼, 실패 해제 팝업, Day 오버라이드
2. **Plan 3: 발송 모니터링 UI** — 대기열 상태, 실시간 진행률, 재생성 버튼
3. **Plan 4: 메시지 관리 UI** — 이미지 미리보기, 재업로드
4. **Plan 5: 매크로 프로그램 (Python)** — 별도 프로젝트
5. **Plan 6: 슬랙 알림 연동**
