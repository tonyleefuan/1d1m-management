# PC 컬러 + 자동 배정 + 테이블 개선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PC별 고유 컬러 표시, 주문일 컬럼 추가 + 정렬, PC 자동 배정 (카톡이름 기반 + 디폴트 PC)

**Architecture:** send_devices 테이블에 color 컬럼 추가. 구독 관리 테이블에 주문일 컬럼 + 헤더 정렬. 주문 확정 시 카톡이름으로 과거 구독 조회 → PC 자동 배정. app_settings에 default_device_id 저장.

**Tech Stack:** Next.js 14 App Router, Supabase PostgreSQL, Tailwind CSS, shadcn/ui

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/constants.ts` | PC_COLORS 팔레트 배열 추가 |
| Modify | `src/lib/types.ts` | SendDevice에 color 필드 추가 |
| Modify | `src/components/tabs/SubscriptionsTab.tsx` | 주문일 컬럼, 정렬, PC 컬러 표시, 디폴트 PC 설정 UI |
| Modify | `src/app/api/subscriptions/list/route.ts` | 정렬 파라미터 지원 + 주문일 정렬 |
| Modify | `src/app/api/orders/confirm/route.ts` | 자동 PC 배정 로직 |
| Modify | `src/app/api/admin/settings/route.ts` | default_device_id 키 허용 |
| Modify | `src/app/api/admin/devices/route.ts` | color 필드 저장 지원 |

---

### Task 1: DB — send_devices에 color 컬럼 추가

**Files:**
- Modify: Supabase migration (SQL via dashboard or CLI)

- [ ] **Step 1: send_devices 테이블에 color 컬럼 추가**

```sql
ALTER TABLE send_devices ADD COLUMN color TEXT DEFAULT NULL;
```

- [ ] **Step 2: 기존 PC들에 기본 컬러 설정**

10개 PC에 대해 스프레드시트 참고 컬러 부여:

```sql
UPDATE send_devices SET color = '#FFD6D6' WHERE name = 'PC 1';
UPDATE send_devices SET color = '#D4EDDA' WHERE name = 'PC 2';
UPDATE send_devices SET color = '#CCE5FF' WHERE name = 'PC 3';
UPDATE send_devices SET color = '#FFF3CD' WHERE name = 'PC 4';
UPDATE send_devices SET color = '#F8D7DA' WHERE name = 'PC 5';
UPDATE send_devices SET color = '#E2D9F3' WHERE name = 'PC 6';
UPDATE send_devices SET color = '#D1ECF1' WHERE name = 'PC 7';
UPDATE send_devices SET color = '#FEEBC8' WHERE name = 'PC 8';
UPDATE send_devices SET color = '#C6F6D5' WHERE name = 'PC 9';
UPDATE send_devices SET color = '#E9D8FD' WHERE name = 'PC 10';
```

실제 name이 다를 수 있으므로 phone_number 기준으로 순서대로 UPDATE 해도 됨.

- [ ] **Step 3: app_settings에 default_device_id 키 추가 가능하도록 확인**

`app_settings` 테이블에 key='default_device_id' row가 upsert 가능한 구조 확인 (이미 key-value 구조).

---

### Task 2: 타입 + 상수 업데이트

**Files:**
- Modify: `src/lib/types.ts:148-156`
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: SendDevice 타입에 color 추가**

`src/lib/types.ts` — SendDevice 인터페이스:

```typescript
export interface SendDevice {
  id: string
  phone_number: string
  name: string | null
  color: string | null       // ← 추가
  is_active: boolean
  last_heartbeat: string | null
  total_friends: number
  created_at: string
}
```

- [ ] **Step 2: constants.ts에 PC 기본 컬러 팔레트 추가**

```typescript
// PC device colors (fallback when DB color is null)
export const PC_COLORS = [
  '#FFD6D6', // PC 1 — 연빨강
  '#D4EDDA', // PC 2 — 연초록
  '#CCE5FF', // PC 3 — 연파랑
  '#FFF3CD', // PC 4 — 연노랑
  '#F8D7DA', // PC 5 — 핑크
  '#E2D9F3', // PC 6 — 연보라
  '#D1ECF1', // PC 7 — 시안
  '#FEEBC8', // PC 8 — 연주황
  '#C6F6D5', // PC 9 — 민트
  '#E9D8FD', // PC 10 — 라벤더
] as const
```

- [ ] **Step 3: 커밋**

```bash
git add src/lib/types.ts src/lib/constants.ts
git commit -m "feat: add PC color support — type + constants"
```

---

### Task 3: API — devices 라우트에 color 지원

**Files:**
- Modify: `src/app/api/admin/devices/route.ts`

- [ ] **Step 1: GET 응답에 color 포함 확인**

`select('*')` 또는 명시적 필드 목록에 `color` 추가. Supabase는 `*` 사용 시 자동 포함되므로 확인만.

- [ ] **Step 2: POST에 color 저장 지원**

기존 insert/update 로직에서 `color` 필드를 body에서 받아 저장:

```typescript
const { phone_number, name, is_active, color } = body  // color 추가
// ...
const row = { phone_number, name, is_active, color }
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/admin/devices/route.ts
git commit -m "feat: support color field in devices API"
```

---

### Task 4: API — settings 라우트에 default_device_id 허용

**Files:**
- Modify: `src/app/api/admin/settings/route.ts:34`

- [ ] **Step 1: VALID_KEYS에 default_device_id 추가**

```typescript
const VALID_KEYS = ['tab_order', 'default_device_id'] as const
```

- [ ] **Step 2: GET에서 default_device_id도 조회**

```typescript
.in('key', ['tab_order', 'default_device_id'])
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/admin/settings/route.ts
git commit -m "feat: allow default_device_id in app settings"
```

---

### Task 5: API — 주문 확정 시 PC 자동 배정

**Files:**
- Modify: `src/app/api/orders/confirm/route.ts:123-160`

- [ ] **Step 1: 구독 생성 전에 디폴트 PC 조회**

구독 생성 루프 직전에:

```typescript
// 디폴트 PC 조회
const { data: defaultSetting } = await supabase
  .from('app_settings')
  .select('value')
  .eq('key', 'default_device_id')
  .single()
const defaultDeviceId = defaultSetting?.value || null
```

- [ ] **Step 2: 카톡이름 기반 과거 PC 매핑 조회**

구독 생성 대상의 customer_id 목록으로 과거 구독에서 마지막 배정 PC 조회:

```typescript
// 카톡이름 → 과거 배정 PC 매핑
const customerIds = subRows.map(r => r.customer_id).filter(Boolean)
const { data: pastSubs } = await supabase
  .from('subscriptions')
  .select('customer_id, device_id')
  .in('customer_id', customerIds)
  .not('device_id', 'is', null)
  .order('created_at', { ascending: false })

// customer_id → 가장 최근 device_id 매핑 (첫 번째만)
const customerDeviceMap = new Map<string, string>()
pastSubs?.forEach(s => {
  if (!customerDeviceMap.has(s.customer_id)) {
    customerDeviceMap.set(s.customer_id, s.device_id)
  }
})
```

- [ ] **Step 3: 구독 생성 시 device_id 자동 설정**

기존 subRows map에서:

```typescript
return {
  order_item_id: itemNoToSaved.get(item.imweb_item_no)!.id,
  customer_id: phoneToId.get(item.customer_phone),
  product_id: productMap.get(item.product_sku),
  status: 'pending',
  duration_days: item.duration_days,
  start_date: startStr,
  end_date: endStr,
  // PC 자동 배정: 1순위 과거 PC, 2순위 디폴트
  device_id: customerDeviceMap.get(phoneToId.get(item.customer_phone)!) || defaultDeviceId,
}
```

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/orders/confirm/route.ts
git commit -m "feat: auto-assign PC on order confirm — past kakao match + default"
```

---

### Task 6: API — 구독 목록 정렬 파라미터 지원

**Files:**
- Modify: `src/app/api/subscriptions/list/route.ts:19-29`

- [ ] **Step 1: sort, order 파라미터 추가**

```typescript
const sortBy = searchParams.get('sort') || 'created_at'
const sortOrder = searchParams.get('order') || 'desc'
const ascending = sortOrder === 'asc'

// 허용된 정렬 필드
const SORTABLE_FIELDS: Record<string, string> = {
  created_at: 'created_at',
  start_date: 'start_date',
  end_date: 'end_date',
  day: 'day',
  status: 'status',
}
const sortField = SORTABLE_FIELDS[sortBy] || 'created_at'
```

- [ ] **Step 2: 기존 order 대체**

기존: `.order('start_date', { ascending: false, nullsFirst: true })`
변경:

```typescript
.order(sortField, { ascending, nullsFirst: !ascending })
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/subscriptions/list/route.ts
git commit -m "feat: support sort/order params in subscriptions list API"
```

---

### Task 7: UI — 구독 테이블에 주문일 컬럼 + 헤더 정렬

**Files:**
- Modify: `src/components/tabs/SubscriptionsTab.tsx:155-162` (filters state)
- Modify: `src/components/tabs/SubscriptionsTab.tsx:599-623` (table header)
- Modify: `src/components/tabs/SubscriptionsTab.tsx:625-827` (table body)

- [ ] **Step 1: filters state에 sort, order 추가**

```typescript
const [filters, setFilters] = useState({
  status: '',
  device_id: '',
  product_id: '',
  friend_confirmed: '',
  search: '',
  page: 1,
  sort: 'created_at',   // ← 추가
  order: 'desc' as 'asc' | 'desc',  // ← 추가
})
```

- [ ] **Step 2: fetchSubs에 sort/order 파라미터 전달**

```typescript
params.set('sort', filters.sort)
params.set('order', filters.order)
```

- [ ] **Step 3: 정렬 토글 헬퍼 함수 추가**

```typescript
const toggleSort = (field: string) => {
  setFilters((f) => ({
    ...f,
    sort: field,
    order: f.sort === field && f.order === 'desc' ? 'asc' : 'desc',
    page: 1,
  }))
}

const SortIcon = ({ field }: { field: string }) => {
  if (filters.sort !== field) return <span className="text-muted-foreground/30 ml-0.5">↕</span>
  return <span className="ml-0.5">{filters.order === 'asc' ? '↑' : '↓'}</span>
}
```

- [ ] **Step 4: 테이블 헤더에 주문일 컬럼 추가 + 정렬 클릭**

체크박스 다음, 고객명 이전 위치에 주문일 추가:

```tsx
<TableHead className="w-[90px] cursor-pointer select-none" onClick={() => toggleSort('created_at')}>
  주문일 <SortIcon field="created_at" />
</TableHead>
```

다른 정렬 가능 헤더에도 적용:
- 시작일: `toggleSort('start_date')`
- 종료일: `toggleSort('end_date')`
- Day: `toggleSort('day')`

- [ ] **Step 5: 테이블 바디에 주문일 셀 추가**

체크박스 셀 다음에:

```tsx
{/* 주문일 */}
<TableCell className="py-1 text-xs tabular-nums text-muted-foreground">
  {sub.order_item?.order?.ordered_at?.slice(0, 10) || sub.created_at?.slice(0, 10) || '-'}
</TableCell>
```

- [ ] **Step 6: 커밋**

```bash
git add src/components/tabs/SubscriptionsTab.tsx
git commit -m "feat: add order date column + sortable headers in subscriptions table"
```

---

### Task 8: UI — PC 컬러 표시

**Files:**
- Modify: `src/components/tabs/SubscriptionsTab.tsx` (DeviceOption 타입, PC 셀 렌더링, 필터, 벌크 드롭다운)

- [ ] **Step 1: DeviceOption에 color 추가**

```typescript
interface DeviceOption {
  id: string
  phone_number: string
  name: string | null
  color: string | null  // ← 추가
}
```

- [ ] **Step 2: PC 컬러 헬퍼 함수 추가**

```typescript
import { PC_COLORS } from '@/lib/constants'

function getDeviceColor(device: DeviceOption | null, devices: DeviceOption[]): string | undefined {
  if (!device) return undefined
  if (device.color) return device.color
  // fallback: 디바이스 순서 기반
  const idx = devices.findIndex(d => d.id === device.id)
  return idx >= 0 ? PC_COLORS[idx % PC_COLORS.length] : undefined
}
```

- [ ] **Step 3: 테이블 PC 셀에 컬러 배지 적용**

기존 Select 트리거에 배경색 적용:

```tsx
{/* PC */}
<TableCell className="py-1" onClick={(e) => e.stopPropagation()}>
  <Select
    value={sub.device_id || '__none__'}
    onValueChange={(v) => handleDeviceChange(sub.id, v === '__none__' ? '' : v)}
  >
    <SelectTrigger
      className="h-6 w-[140px] text-xs rounded-full"
      style={sub.device ? {
        backgroundColor: getDeviceColor(
          devices.find(d => d.id === sub.device_id) || null,
          devices
        ),
      } : undefined}
    >
      <SelectValue placeholder="미배정" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="__none__">미배정</SelectItem>
      {devices.map((d) => (
        <SelectItem key={d.id} value={d.id}>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: getDeviceColor(d, devices) }}
            />
            {d.phone_number}{d.name ? ` (${d.name})` : ''}
          </span>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</TableCell>
```

- [ ] **Step 4: 필터 PC 드롭다운에도 컬러 닷 적용**

FilterBar 내 PC 필터에 같은 패턴 적용 (컬러 닷 추가).

- [ ] **Step 5: 벌크 PC 배정 드롭다운에도 컬러 닷 적용**

PageHeader 내 벌크 PC Select에도 같은 패턴 적용.

- [ ] **Step 6: 커밋**

```bash
git add src/components/tabs/SubscriptionsTab.tsx
git commit -m "feat: PC color badges in subscriptions table, filter, bulk assign"
```

---

### Task 9: UI — 디폴트 PC 설정 섹션

**Files:**
- Modify: `src/components/tabs/SubscriptionsTab.tsx` (StatGroup 아래에 PC 배정 섹션 추가)

- [ ] **Step 1: 디폴트 PC state 추가**

```typescript
const [defaultDeviceId, setDefaultDeviceId] = useState<string | null>(null)
```

- [ ] **Step 2: 초기 로딩 시 settings에서 default_device_id 조회**

useEffect에 추가:

```typescript
fetch('/api/admin/settings')
  .then(r => r.json())
  .then(d => setDefaultDeviceId(d.default_device_id || null))
  .catch(() => {})
```

- [ ] **Step 3: 디폴트 PC 저장 함수**

```typescript
const handleDefaultDeviceChange = async (deviceId: string) => {
  const value = deviceId === '__none__' ? null : deviceId
  setDefaultDeviceId(value)
  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'default_device_id', value }),
    })
    if (res.ok) showSuccess('기본 PC가 설정되었습니다')
    else showError('기본 PC 설정에 실패했습니다')
  } catch {
    showError('기본 PC 설정에 실패했습니다')
  }
}
```

- [ ] **Step 4: StatGroup과 FilterBar 사이에 PC 배정 섹션 UI**

```tsx
{/* PC 배정 설정 */}
<div className="flex items-center gap-3 px-1">
  <span className="text-xs text-muted-foreground">기본 PC:</span>
  <Select
    value={defaultDeviceId || '__none__'}
    onValueChange={handleDefaultDeviceChange}
  >
    <SelectTrigger className="h-7 w-[200px] text-xs">
      <SelectValue placeholder="미설정" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="__none__">미설정</SelectItem>
      {devices.map((d) => (
        <SelectItem key={d.id} value={d.id}>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: getDeviceColor(d, devices) }}
            />
            {d.phone_number}{d.name ? ` (${d.name})` : ''}
          </span>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
  <span className="text-[10px] text-muted-foreground">
    새 주문 확정 시 과거 카톡이름 매칭이 없으면 이 PC로 자동 배정됩니다
  </span>
</div>
```

- [ ] **Step 5: 커밋**

```bash
git add src/components/tabs/SubscriptionsTab.tsx
git commit -m "feat: default PC setting in subscriptions tab"
```

---

### Task 10: 통합 테스트

- [ ] **Step 1: DB 마이그레이션 확인**

Supabase에서 `SELECT color FROM send_devices LIMIT 1` 실행하여 컬럼 존재 확인.

- [ ] **Step 2: 로컬 테스트 — PC 컬러 표시**

- 구독 관리 탭 → PC 셀에 색상 배경이 보이는지 확인
- PC 필터 드롭다운에 컬러 닷이 보이는지 확인
- 벌크 PC 배정 드롭다운에 컬러 닷이 보이는지 확인

- [ ] **Step 3: 로컬 테스트 — 주문일 컬럼 + 정렬**

- 테이블 맨 좌측(체크박스 다음)에 주문일 컬럼이 있는지 확인
- 주문일 헤더 클릭 → desc/asc 정렬 토글 확인
- 기본 정렬: 최신 주문일 먼저

- [ ] **Step 4: 로컬 테스트 — 디폴트 PC 설정**

- 구독 관리 탭에서 기본 PC 드롭다운 설정 → 새로고침 후 유지 확인

- [ ] **Step 5: 로컬 테스트 — 자동 배정**

- 기존 구독이 있는 고객(같은 카톡이름)의 새 주문 확정 → 과거 PC로 자동 배정 확인
- 신규 고객의 주문 확정 → 디폴트 PC로 배정 확인
- 디폴트 미설정 시 → null(미배정) 확인

- [ ] **Step 6: 최종 커밋**

```bash
git add -A
git commit -m "feat: PC color display, order date column, sortable headers, auto PC assignment"
```
