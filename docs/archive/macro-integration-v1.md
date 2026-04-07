# 매크로 연동 시스템 v1 아카이브

> 2026-03-22 설계, 2026-04 제거 -- 구글 시트 수동 워크플로우로 전환
>
> 이 문서는 매크로 프로그램과 서버 간 API 연동의 전체 코드와 설계를 보존하기 위한 아카이브 문서이다.

---

## 목차

1. [개요](#1-개요)
2. [아키텍처](#2-아키텍처)
3. [API 엔드포인트 전체 코드](#3-api-엔드포인트-전체-코드)
4. [대기열 생성기 (queue-generator)](#4-대기열-생성기-queue-generator)
5. [데이터 흐름](#5-데이터-흐름)
6. [비즈니스 로직 상세](#6-비즈니스-로직-상세)
7. [제거 사유](#7-제거-사유)
8. [복원 가이드](#8-복원-가이드)
9. [원본 설계 문서 참조](#9-원본-설계-문서-참조)

---

## 1. 개요

매크로 연동 시스템은 Windows PC에서 실행되는 Python 매크로 프로그램이 서버 API를 통해 카카오톡 발송 대기열을 수신하고, 발송 진행 상황을 보고하며, 최종 결과를 제출하는 구조였다.

### 핵심 구성 요소

| 구성 요소 | 역할 |
|-----------|------|
| `GET /api/macro/queue` | 매크로가 오늘의 발송 대기열을 수신 |
| `POST /api/macro/heartbeat` | 매크로가 1분마다 진행 상황을 보고 |
| `POST /api/macro/report` | 매크로가 발송 완료 후 상세 결과를 제출 |
| `queue-generator.ts` | PC(device)별 발송 대기열을 생성하는 핵심 로직 |
| `send_queues` 테이블 | 발송 대기열 저장 (queue_id, subscription_id, day_number 등) |
| `send_devices` 테이블 | PC 장치 정보 + heartbeat 저장 |

### 하루 타임라인

```
22:00  PC 자동 재부팅 (Windows 작업 스케줄러)
02:00  서버 크론 -- 대기열 생성 (PC별 순차)
04:00  매크로 실행 -- 대기열 수신 -> 이미지 다운로드 -> 카카오톡 발송
       1분마다 heartbeat (진행 숫자)
~10:00 발송 완료 -> 상세 결과 한번에 보고 -> 슬랙 완료 알림
```

---

## 2. 아키텍처

```
[Windows PC - 매크로 프로그램 (Python)]
    |
    |-- GET  /api/macro/queue?device_id=010-xxxx-xxxx
    |       -> 오늘 대기열 수신 (없으면 서버가 생성)
    |
    |-- POST /api/macro/heartbeat  (1분마다)
    |       -> send_devices.last_heartbeat + sending_progress 업데이트
    |
    |-- POST /api/macro/report  (발송 완료 후 1회)
    |       -> send_queues 상태 업데이트 (sent/failed)
    |       -> subscriptions.last_sent_day 업데이트
    |       -> failure_type 전파
    |       -> 슬랙 완료 알림
    |
[Vercel 서버 (Next.js API Routes)]
    |
    |-- Supabase (send_queues, subscriptions, send_devices, messages, daily_messages)
    |-- Slack 알림 (발송 완료 시)
```

### 인증

모든 `/api/macro/*` 요청에 `Authorization: Bearer {api_key}` 헤더 필요. 공용 키 하나 사용 (`MACRO_API_KEY` 환경 변수).

---

## 3. API 엔드포인트 전체 코드

### 3.1 GET /api/macro/queue

**파일**: `src/app/api/macro/queue/route.ts`

**역할**: 매크로가 오늘의 발송 대기열을 요청하면, 이미 생성된 대기열이 있으면 반환하고 없으면 새로 생성하여 반환한다.

```typescript
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateQueueForDevice } from '@/lib/queue-generator'
import { todayKST } from '@/lib/day'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const deviceId = searchParams.get('device_id')
  if (!deviceId) return NextResponse.json({ error: 'device_id required' }, { status: 400 })

  // Look up device by phone_number to get UUID
  const { data: device } = await supabase
    .from('send_devices')
    .select('id')
    .eq('phone_number', deviceId)
    .single()

  const actualDeviceId = device?.id || deviceId
  const result = await generateQueueForDevice(actualDeviceId)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 })

  // 고유 이미지 목록 추출
  const images = [...new Set(
    result.data
      .filter((item: any) => item.image_path)
      .map((item: any) => item.image_path)
  )]

  // 발송 설정 조회 (대시보드에서 설정한 값)
  const { data: settingsData } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['send_start_time', 'send_message_delay', 'send_file_delay'])

  const settings: Record<string, string | number> = {
    send_start_time: '04:00',
    send_message_delay: 3,
    send_file_delay: 6,
  }
  settingsData?.forEach(row => {
    const val = row.value
    settings[row.key] = typeof val === 'string' ? val.replace(/^"|"$/g, '') : val
  })

  return NextResponse.json({
    ok: true,
    data: result.data,
    total: result.data.length,
    date: todayKST(),
    generated: result.generated,
    images,
    settings,
  })
}
```

**동작 설명**:

1. `device_id` 쿼리 파라미터로 전화번호를 받는다 (예: `010-2785-8940`)
2. `send_devices` 테이블에서 전화번호로 UUID를 조회한다 (내부적으로 UUID 사용)
3. `generateQueueForDevice()`를 호출하여 대기열을 생성하거나 기존 것을 반환한다
4. 응답에 포함되는 항목:
   - `data`: 대기열 항목 배열 (queue_id, subscription_id, day_number, kakao_friend_name, message_content, image_path, sort_order)
   - `images`: 고유 이미지 URL 목록 (매크로가 미리 다운로드용)
   - `settings`: 발송 시작 시간, 메시지 딜레이, 파일 딜레이 설정값
   - `generated`: 새로 생성했는지 여부 (true/false)

---

### 3.2 POST /api/macro/heartbeat

**파일**: `src/app/api/macro/heartbeat/route.ts`

**역할**: 매크로가 1분마다 호출하여 현재 발송 진행 상황을 서버에 보고한다. 대시보드의 발송 모니터링에서 실시간 진행률 표시에 사용된다.

```typescript
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: Request) {
  const body = await req.json()
  const { device_id, pending, sent, failed, total } = body

  if (!device_id) return NextResponse.json({ error: 'device_id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('send_devices')
    .update({
      last_heartbeat: new Date().toISOString(),
      sending_progress: { pending, sent, failed, total },
    })
    .eq('phone_number', device_id)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: `Device not found: ${device_id}` }, { status: 404 })

  return NextResponse.json({ ok: true })
}
```

**동작 설명**:

1. `device_id`(전화번호), `pending`, `sent`, `failed`, `total` 수치를 받는다
2. `send_devices` 테이블에 `last_heartbeat` 타임스탬프와 `sending_progress` JSON 업데이트
3. 대시보드의 발송 모니터링 탭에서 Supabase Realtime으로 이 값을 실시간 표시

**요청 예시**:
```json
{
  "device_id": "010-2785-8940",
  "pending": 2100,
  "sent": 3050,
  "failed": 50,
  "total": 5200
}
```

---

### 3.3 POST /api/macro/report

**파일**: `src/app/api/macro/report/route.ts`

**역할**: 매크로가 발송 완료 후 전체 결과를 한 번에 보고한다. 이 API가 가장 복잡하며, 대기열 상태 업데이트, 구독별 성공/실패 집계, failure 전파, recovery_mode 초기화, 슬랙 알림까지 처리한다.

```typescript
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { todayKST } from '@/lib/day'
import { notifySendingComplete } from '@/lib/slack'

export async function POST(req: Request) {
  const body = await req.json()
  const { device_id, date, results } = body

  if (!device_id || !results?.length) {
    return NextResponse.json({ error: 'device_id and results required' }, { status: 400 })
  }

  // 입력 검증
  if (results.length > 10000) {
    return NextResponse.json({ error: 'Too many results (max 10000)' }, { status: 400 })
  }

  const validStatuses = new Set(['sent', 'failed'])
  for (const r of results) {
    if (!r.queue_id || typeof r.queue_id !== 'string') {
      return NextResponse.json({ error: 'Invalid queue_id in results' }, { status: 400 })
    }
    if (!validStatuses.has(r.status)) {
      return NextResponse.json({ error: `Invalid status: ${r.status}` }, { status: 400 })
    }
  }

  const reportDate = date || todayKST()

  // 1. send_queues 상태 업데이트 (배치)
  const sentIds = results.filter((r: any) => r.status === 'sent').map((r: any) => r.queue_id)
  const failedResults = results.filter((r: any) => r.status === 'failed')

  if (sentIds.length > 0) {
    for (let i = 0; i < sentIds.length; i += 500) {
      const batch = sentIds.slice(i, i + 500)
      await supabase
        .from('send_queues')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .in('id', batch)
    }
  }

  // 실패 건을 error_type별로 그룹화하여 배치 업데이트
  const failedByType = new Map<string, string[]>()
  for (const r of failedResults) {
    const errorType = r.error_type || 'unknown'
    const ids = failedByType.get(errorType) || []
    ids.push(r.queue_id)
    failedByType.set(errorType, ids)
  }

  for (const [errorType, ids] of failedByType) {
    for (let i = 0; i < ids.length; i += 500) {
      const batch = ids.slice(i, i + 500)
      await supabase
        .from('send_queues')
        .update({ status: 'failed', error_message: errorType })
        .in('id', batch)
    }
  }

  // 2. 구독별 성공/실패 집계
  const allQueueIds = results.map((r: any) => r.queue_id)
  const { data: queueItems } = await supabase
    .from('send_queues')
    .select('id, subscription_id, day_number')
    .in('id', allQueueIds)

  if (!queueItems?.length) return NextResponse.json({ ok: true, processed: 0 })

  // results를 Map으로 변환 (queue_id -> result)
  const resultMap = new Map<string, any>(results.map((r: any) => [r.queue_id, r]))

  // 구독별 Day별 그룹화
  const subMap = new Map<string, {
    days: Map<number, { sent: number; failed: number }>,
    errorType: string | null
  }>()

  for (const item of queueItems) {
    if (!subMap.has(item.subscription_id)) {
      subMap.set(item.subscription_id, { days: new Map(), errorType: null })
    }
    const sub = subMap.get(item.subscription_id)!

    if (!sub.days.has(item.day_number)) {
      sub.days.set(item.day_number, { sent: 0, failed: 0 })
    }

    const result = resultMap.get(item.id)
    if (result?.status === 'sent') {
      sub.days.get(item.day_number)!.sent++
    } else {
      sub.days.get(item.day_number)!.failed++
      if (result?.error_type) sub.errorType = result.error_type
    }
  }

  // 3. 관련 구독 일괄 조회
  const subIds = [...subMap.keys()]
  const { data: existingSubs } = await supabase
    .from('subscriptions')
    .select('id, last_sent_day, recovery_mode, customer_id, device_id')
    .in('id', subIds)

  const existingSubMap = new Map(
    (existingSubs || []).map(s => [s.id, s])
  )

  // 구독별 last_sent_day 업데이트
  for (const [subId, info] of subMap) {
    const existingSub = existingSubMap.get(subId)
    const existingLastSent = existingSub?.last_sent_day ?? 0

    // Day별로 연속 성공 확인 (기존 last_sent_day부터 연속이어야 함)
    const sortedDays = [...info.days.entries()].sort((a, b) => a[0] - b[0])
    let maxCompletedDay = existingLastSent

    for (const [dayNum, counts] of sortedDays) {
      if (dayNum !== maxCompletedDay + 1) break // 연속이 아니면 중단
      if (counts.failed > 0) break // 실패가 있으면 중단
      maxCompletedDay = dayNum
    }

    if (maxCompletedDay > existingLastSent) {
      // 진행 성공: last_sent_day 업데이트
      const updates: any = {
        last_sent_day: maxCompletedDay,
        updated_at: new Date().toISOString(),
      }

      // recovery_mode 초기화
      if (existingSub?.recovery_mode === 'bulk' || existingSub?.recovery_mode === 'sequential') {
        updates.recovery_mode = null
      }

      // 전체 성공이면 failure 초기화, 부분 성공이면 failure 유지/설정
      if (!info.errorType) {
        updates.failure_type = null
        updates.failure_date = null
      } else {
        updates.failure_type = info.errorType
        updates.failure_date = reportDate
      }

      await supabase.from('subscriptions').update(updates).eq('id', subId)
    } else if (info.errorType) {
      // 진행 없이 실패만
      await supabase.from('subscriptions').update({
        failure_type: info.errorType,
        failure_date: reportDate,
        updated_at: new Date().toISOString(),
      }).eq('id', subId)
    }
  }

  // 4. friend_not_found 사람 단위 전파
  const friendNotFoundSubIds = [...subMap.entries()]
    .filter(([_, info]) => info.errorType === 'friend_not_found')
    .map(([subId]) => subId)

  for (const subId of friendNotFoundSubIds) {
    const sub = existingSubMap.get(subId)
    if (sub) {
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

  // 발송 완료 확인: 오늘 남은 pending 건수 확인
  const { count: remainingPending } = await supabase
    .from('send_queues')
    .select('id', { count: 'exact', head: true })
    .eq('send_date', reportDate)
    .eq('status', 'pending')

  if (remainingPending === 0) {
    // 모든 PC 발송 완료 -> 요약 알림
    const { data: allQueues } = await supabase
      .from('send_queues')
      .select('device_id, status')
      .eq('send_date', reportDate)

    if (allQueues) {
      const deviceStats: Record<string, { sent: number; failed: number; total: number }> = {}
      for (const q of allQueues) {
        if (!deviceStats[q.device_id]) deviceStats[q.device_id] = { sent: 0, failed: 0, total: 0 }
        deviceStats[q.device_id].total++
        if (q.status === 'sent') deviceStats[q.device_id].sent++
        if (q.status === 'failed') deviceStats[q.device_id].failed++
      }

      const totalSent = Object.values(deviceStats).reduce((s, d) => s + d.sent, 0)
      const totalFailed = Object.values(deviceStats).reduce((s, d) => s + d.failed, 0)

      await notifySendingComplete(reportDate, {
        total: allQueues.length,
        sent: totalSent,
        failed: totalFailed,
        devices: deviceStats,
      })
    }
  }

  return NextResponse.json({
    ok: true,
    processed: subMap.size,
    date: reportDate,
  })
}
```

**동작 설명 (단계별)**:

1. **입력 검증**: `device_id`, `results` 필수, 최대 10000건, status는 sent/failed만 허용
2. **send_queues 상태 업데이트**: 성공 건은 `status='sent'` + `sent_at` 설정, 실패 건은 `status='failed'` + `error_message` 설정. 500건씩 배치 처리.
3. **구독별 Day별 집계**: queue_id로 subscription_id와 day_number를 조회하여 구독별-Day별 성공/실패 카운트 계산
4. **last_sent_day 업데이트**: 기존 last_sent_day부터 연속으로 성공한 Day까지만 업데이트 (중간에 실패가 있으면 거기서 중단)
5. **recovery_mode 초기화**: bulk 또는 sequential 모드에서 발송 성공하면 null로 초기화
6. **failure_type 설정/초기화**: 전체 성공이면 failure 초기화, 실패 있으면 failure_type + failure_date 설정
7. **friend_not_found 사람 단위 전파**: 한 구독에서 친구를 못 찾으면 같은 customer_id + device_id의 다른 구독에도 failure 전파
8. **발송 완료 확인**: 오늘 남은 pending이 0이면 전체 PC 발송 완료로 판단하고 슬랙 알림 발송

**요청 예시**:
```json
{
  "device_id": "010-2785-8940",
  "date": "2026-03-22",
  "results": [
    { "queue_id": "uuid-1", "status": "sent" },
    { "queue_id": "uuid-2", "status": "failed", "error_type": "friend_not_found" }
  ]
}
```

---

## 4. 대기열 생성기 (queue-generator)

**파일**: `src/lib/queue-generator.ts`

**역할**: 특정 PC(device)에 대해 오늘의 발송 대기열을 생성한다. 이미 존재하면 기존 것을 반환한다. 매크로 queue API와 서버 크론 양쪽에서 호출된다.

```typescript
import { supabase } from '@/lib/supabase'
import { computeSubscription, todayKST } from '@/lib/day'

export async function generateQueueForDevice(deviceId: string, today?: string) {
  const t = today || todayKST()

  // Check if queue already exists for this device today
  const { data: existing } = await supabase
    .from('send_queues')
    .select('*')
    .eq('device_id', deviceId)
    .eq('send_date', t)
    .order('sort_order', { ascending: true })

  if (existing && existing.length > 0) {
    return { data: existing, generated: false }
  }

  // Get active subscriptions for this device
  const { data: subs, error: subErr } = await supabase
    .from('subscriptions')
    .select(`
      id, customer_id, product_id, device_id,
      start_date, duration_days, last_sent_day, paused_days, paused_at,
      is_cancelled, failure_type, recovery_mode, send_priority,
      customer:customers(kakao_friend_name),
      product:products(sku_code, message_type)
    `)
    .eq('device_id', deviceId)
    .eq('is_cancelled', false)
    .is('paused_at', null)

  if (subErr) return { error: subErr.message }
  if (!subs?.length) return { data: [], generated: true }

  // Message cache
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
        .eq('send_date', t)
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

  // Filter and compute
  const activeSubs = subs.filter(sub => {
    if (sub.failure_type === 'friend_not_found' || sub.failure_type === 'other') return false

    const computed = computeSubscription({
      start_date: sub.start_date,
      duration_days: sub.duration_days,
      last_sent_day: sub.last_sent_day ?? 0,
      paused_days: sub.paused_days ?? 0,
      paused_at: sub.paused_at,
      is_cancelled: sub.is_cancelled ?? false,
    }, t)

    if (computed.computed_status !== 'active') return false

    const pendingCount = computed.pending_days.length
    if (pendingCount === 0) return false
    if (sub.recovery_mode === null && pendingCount >= 3) return false

    return true
  })

  // Group by person, sort by send_priority
  const personGroups = new Map<string, typeof activeSubs>()
  const sorted = activeSubs.sort((a, b) => (a.send_priority || 3) - (b.send_priority || 3))

  for (const sub of sorted) {
    const group = personGroups.get(sub.customer_id) || []
    group.push(sub)
    personGroups.set(sub.customer_id, group)
  }

  // Generate queue rows
  const queueRows: any[] = []
  let sortOrder = 0

  for (const [_customerId, personSubs] of personGroups) {
    for (const sub of personSubs) {
      const friendName = (sub.customer as any)?.kakao_friend_name || 'unknown'
      const computed = computeSubscription({
        start_date: sub.start_date,
        duration_days: sub.duration_days,
        last_sent_day: sub.last_sent_day ?? 0,
        paused_days: sub.paused_days ?? 0,
        paused_at: sub.paused_at,
        is_cancelled: sub.is_cancelled ?? false,
      }, t)

      let daysToSend: number[]
      if (sub.recovery_mode === 'bulk') {
        daysToSend = computed.pending_days
      } else if (sub.recovery_mode === 'sequential') {
        daysToSend = [(sub.last_sent_day ?? 0) + 1]
      } else {
        daysToSend = computed.pending_days.slice(0, 2)
      }

      for (const dayNum of daysToSend) {
        if (dayNum < 1 || dayNum > sub.duration_days) continue
        const product = sub.product as any
        const messages = await getMessages(sub.product_id, product?.message_type, dayNum)
        if (!messages.length) continue

        for (const msg of messages) {
          sortOrder++
          queueRows.push({
            subscription_id: sub.id,
            device_id: deviceId,
            send_date: t,
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

  // Batch insert + ID 반환
  if (queueRows.length > 0) {
    for (let i = 0; i < queueRows.length; i += 500) {
      const batch = queueRows.slice(i, i + 500)
      const { error } = await supabase.from('send_queues').insert(batch)
      if (error) return { error: `대기열 생성 실패: ${error.message}` }
    }

    // 삽입된 행을 ID와 함께 다시 조회
    const { data: inserted } = await supabase
      .from('send_queues')
      .select('*')
      .eq('device_id', deviceId)
      .eq('send_date', t)
      .order('sort_order', { ascending: true })

    return { data: inserted || [], generated: true }
  }

  return { data: [], generated: true }
}
```

### 대기열 생성 핵심 로직

**1. 구독 필터링 (대기열에 포함할 구독 결정)**:

| 조건 | 설명 |
|------|------|
| `is_cancelled = false` | 취소되지 않은 구독 |
| `paused_at IS NULL` | 정지 중이 아닌 구독 |
| `failure_type != 'friend_not_found'` | 친구 못 찾음이 아닌 구독 |
| `failure_type != 'other'` | 기타 오류가 아닌 구독 |
| `computed_status = 'active'` | Day 계산 결과 활성 상태 |
| `pending_count > 0` | 보낼 Day가 있는 구독 |
| `recovery_mode = null 이고 pending_count < 3` | 2일 이상 연속 미발송이 아닌 구독 |
| `recovery_mode != null` | 복구 모드면 pending_count 제한 없음 |

**2. 보낼 Day 결정 (recovery_mode별)**:

| recovery_mode | 보낼 Day |
|--------------|---------|
| `null` (정상) | `pending_days.slice(0, 2)` -- 최대 2개 (오늘 + 어제 밀린 것) |
| `'bulk'` | `pending_days` 전부 -- 밀린 것 + 오늘 전부 |
| `'sequential'` | `last_sent_day + 1` -- 하루씩만 |

**3. 메시지 조회 (상품 타입별)**:

| message_type | 조회 소스 |
|-------------|----------|
| `'fixed'` (고정) | `messages` 테이블 -- `product_id` + `day_number` |
| `'realtime'` (실시간) | `daily_messages` 테이블 -- `product_id` + `send_date = 오늘` |

**4. 정렬 순서**:

```
1차: 사람별 발송순서 (send_priority) -- 숫자 작을수록 먼저
2차: 같은 사람 내 구독 묶음
3차: 같은 구독 내 메시지 sort_order
```

**5. 배치 삽입**: 500건씩 나누어 삽입 후, 삽입된 행을 ID와 함께 다시 조회하여 반환

---

## 5. 데이터 흐름

### 정상 발송 흐름

```
[02:00 크론 또는 04:00 매크로 요청]
    |
    v
generateQueueForDevice()
    |-- subscriptions 조회 (활성 구독)
    |-- computeSubscription() (Day 계산, pending_days 결정)
    |-- messages / daily_messages 조회 (메시지 내용)
    |-- send_queues INSERT (대기열 생성)
    |
    v
[매크로: GET /api/macro/queue]
    |-- 대기열 수신 + 이미지 목록 + 발송 설정
    |
    v
[매크로: 카카오톡 발송 (4시간)]
    |-- POST /api/macro/heartbeat (1분마다)
    |       -> send_devices.sending_progress 업데이트
    |
    v
[매크로: POST /api/macro/report]
    |-- send_queues.status 업데이트 (sent/failed)
    |-- subscriptions.last_sent_day 업데이트 (연속 성공분)
    |-- subscriptions.failure_type 설정/초기화
    |-- friend_not_found 사람 단위 전파
    |-- recovery_mode 초기화
    |-- 남은 pending = 0 이면 슬랙 완료 알림
```

### 실패 복구 흐름

```
[Day 37 발송 실패: friend_not_found]
    |
    v
report API:
    |-- subscription.failure_type = 'friend_not_found'
    |-- 같은 사람의 다른 구독에도 전파
    |
    v
[관리자: 대시보드에서 실패 해제]
    |-- 선택 1: "직접 보냈어요" -> last_sent_day = current_day
    |-- 선택 2: "몰아서 보내기" -> recovery_mode = 'bulk'
    |-- 선택 3: "하루씩 순서대로" -> recovery_mode = 'sequential'
    |
    v
[다음 날 대기열 생성]
    |-- bulk: 밀린 Day 전부 포함
    |-- sequential: last_sent_day + 1 만 포함
    |
    v
[발송 성공 후 report]
    |-- recovery_mode = null 로 초기화
```

---

## 6. 비즈니스 로직 상세

### 6.1 Heartbeat 로직

- 매크로가 1분마다 호출
- `send_devices.last_heartbeat`: 마지막 heartbeat 시각 (장치 생존 여부 판단)
- `send_devices.sending_progress`: `{ pending, sent, failed, total }` JSON 객체
- 대시보드 발송 모니터링에서 Supabase Realtime으로 실시간 표시

### 6.2 Report 처리 로직

**배치 처리**: 성공/실패 건을 500건씩 나누어 DB 업데이트 (Supabase `.in()` 제한 대응)

**연속 성공 판정**: `last_sent_day`는 기존 값부터 연속으로 성공한 Day까지만 업데이트한다.
- 예: last_sent_day=35, Day 36 성공, Day 37 실패, Day 38 성공 -> last_sent_day=36 (37에서 끊김)

**recovery_mode 초기화 조건**:
- `bulk`: 발송 성공 후 즉시 null로 초기화
- `sequential`: last_sent_day >= current_day - 1 이면 null로 초기화 (따라잡음)

### 6.3 실패 전파 로직

**구독 단위**: 한 구독의 메시지 중 1건이라도 실패하면 해당 구독 전체 실패 처리

**사람 단위 전파 (friend_not_found)**:
- 한 구독에서 친구를 못 찾으면, 같은 `customer_id` + `device_id`의 다른 구독에도 `failure_type = 'friend_not_found'` 전파
- 단, `failure_type`이 이미 설정된 구독은 건너뜀 (`IS NULL` 조건)

### 6.4 실패 유형별 처리

| failure_type | 자동 재시도 | 대기열 포함 | 관리자 액션 필요 |
|-------------|-----------|-----------|---------------|
| `null` | - | O | - |
| `friend_not_found` | X | X | 실패 해제 필요 |
| `device_error` | O (다음 날) | O | - |
| `not_sent` | O (다음 날) | O | 2일 연속 시 관리자 확인 |
| `other` | X | X | 실패 해제 필요 |

### 6.5 발송 완료 슬랙 알림

`report` API에서 오늘의 모든 PC pending이 0이 되면 `notifySendingComplete()` 호출:
- 전체 건수, 성공, 실패
- PC별 성공/실패 건수

---

## 7. 제거 사유

매크로 연동 시스템은 다음 이유로 제거되고 구글 시트 수동 워크플로우로 전환되었다:

1. **운영 복잡성**: Windows PC 10대의 작업 스케줄러, 카카오톡 자동 로그인, 매크로 프로그램 배포/업데이트 관리 부담
2. **안정성 문제**: 카카오톡 UI 변경 시 매크로 전면 수정 필요, PC 장애 시 복구 어려움
3. **구글 시트 기반 워크플로우로 충분**: 기존 구글 시트 + 매크로 방식이 이미 안정적으로 운영 중이었음
4. **개발 리소스 집중**: 서버 API 기반 자동화보다 메시지 관리/구독 관리 등 백오피스 기능에 집중

---

## 8. 복원 가이드

매크로 연동을 다시 도입해야 할 경우 다음 단계를 따른다.

### 8.1 필요한 파일 복원

| 파일 | 위치 |
|------|------|
| queue API | `src/app/api/macro/queue/route.ts` |
| heartbeat API | `src/app/api/macro/heartbeat/route.ts` |
| report API | `src/app/api/macro/report/route.ts` |
| queue-generator | `src/lib/queue-generator.ts` (이미 존재할 수 있음) |

### 8.2 필요한 DB 테이블/칼럼

- `send_queues`: id, subscription_id, device_id, send_date, day_number, kakao_friend_name, message_content, image_path, sort_order, status, sent_at, error_message
- `send_devices`: id, phone_number, last_heartbeat, sending_progress
- `subscriptions`: last_sent_day, failure_type, failure_date, recovery_mode, send_priority
- `app_settings`: send_start_time, send_message_delay, send_file_delay

### 8.3 필요한 환경 변수

- `MACRO_API_KEY`: 매크로 인증용 공용 키

### 8.4 필요한 의존성

- `src/lib/day.ts`: `computeSubscription()`, `todayKST()` 함수
- `src/lib/slack.ts`: `notifySendingComplete()` 함수

### 8.5 미들웨어

`/api/macro/*` 경로에 대해 `Authorization: Bearer {MACRO_API_KEY}` 검증 미들웨어 추가 필요.

### 8.6 크론 설정

02:00 KST에 PC별 대기열 사전 생성 크론 설정 필요 (Vercel Cron 또는 외부 스케줄러).

---

## 9. 원본 설계 문서 참조

전체 설계 문서: `docs/archive/day-system-macro-design.md`

이 문서에는 다음 내용이 포함되어 있다:
- Day 계산 시스템 전체 설계 (공식, DB 칼럼, 상태 판단)
- 실패 처리 전체 규칙 (실패 유형, 자동 재시도, 2일 연속 실패 전환)
- 실패 해제 팝업 UI 설계
- 정지/취소 로직
- Day 오버라이드 (개별/대량 CSV)
- 매크로 프로그램 구조 (Python, config.json, install.bat, progress.json)
- 매크로 API 전체 스펙
- 대기열 생성 크론 상세 (사전 처리, 생성 대상, 정렬 순서)
- 구독 관리/발송 모니터링 UI 변경 사항
- 이미지 관리 (캐싱, Supabase 스토리지)
- 슬랙 알림 설계
- 데이터 마이그레이션 계획
