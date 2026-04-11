# ManyFast 기능 명세서 작성 규칙

> 1d1m 프로젝트 기반으로 정립한 ManyFast 명세서 작성 가이드.
> 다른 프로젝트에도 동일하게 적용한다.

---

## 0. 도메인 모델링 먼저 (Requirement 분리의 전제)

명세서를 쓰기 전에 **도메인 모델링**이 선행되어야 한다. Requirement는 도메인 경계에서 나온다.

### 0-1. Aggregate 식별

코드베이스에서 핵심 엔티티를 추출하고, **Aggregate Root** 단위로 묶는다.

**식별 기준 (우선순위 순):**
1. **트랜잭션 일관성**: 같은 트랜잭션에서 함께 수정되어야 하는가? → 같은 Aggregate
2. **불변식 공유**: 공통 비즈니스 규칙이 있는가? (예: "환불액 <= 결제액")
3. **생명주기 일치**: 같이 생성/삭제되는 엔티티 → 같은 Aggregate
4. **FK 참조만**: 읽기 전용 참조 → 다른 Aggregate (Eventual Consistency 허용)
5. **독립 생명주기** → 독립 Aggregate

**크기 원칙:** Aggregate는 가능한 작게 (Root + 1~3개 엔티티 권장)

**1d1m 예시:**
```
[Customer] ──< [Order] ──< [OrderItem]
                              │
                              v
[Product] ──< [ProductPrice]  [Subscription] ──< [SendQueue]
    │                              │
    ├──< [Message]                 └── device_id → [SendDevice]
    ├──< [DailyMessage]
    └──< [NoticeTemplate]

[CSInquiry] ──< [CSReply]
    └──< [CSRefundRequest]

[CSPolicy] (독립)
[SendDevice] (독립)
[User] (독립)
```

### 0-2. Bounded Context 도출

Aggregate들을 비즈니스 맥락으로 그룹핑 → **Bounded Context = Requirement 후보**

**그룹핑 기준 (우선순위 순):**
1. **유비쿼터스 언어**: 같은 용어가 다른 의미로 쓰이면 다른 Context
   - 예: "Day"가 발송에서는 "발송차수", CS에서는 "이용일수"
2. **변경 빈도**: 독립적으로 자주 변경되는 영역
3. **기술 경계**: 독립 DB 테이블 그룹 / API 라우트 그룹

**Context 크기 가이드:**
- 너무 작음: CRUD만 있는 단순 테이블 → 다른 Context에 흡수
- 적절함: 2~5개 Aggregate + 독립 비즈니스 로직
- 너무 큼: 10개+ Aggregate → 분리 검토

**1d1m Bounded Context:**
```
┌─ 주문 ──────────────────────────────┐
│ Customer, Order, OrderItem          │
│ "주문 들어오면 구독 생성"            │
└─────────────────────────────────────┘
┌─ 구독 ──────────────────────────────┐
│ Subscription, ComputedSubscription  │
│ "구독 상태/Day 관리"                │
└─────────────────────────────────────┘
┌─ 메시지 ────────────────────────────┐
│ Product, Message, DailyMessage,     │
│ ProductPrompt, NoticeTemplate       │
│ "콘텐츠 관리 + AI 생성"             │
└─────────────────────────────────────┘
┌─ 발송 ──────────────────────────────┐
│ SendQueue, SendDevice               │
│ "큐 생성 → 구글시트 → 결과 수거"    │
└─────────────────────────────────────┘
┌─ CS ────────────────────────────────┐
│ CSInquiry, CSReply, CSRefundRequest │
│ CSPolicy, CSGeneralInquiry          │
│ "고객 문의 → AI응답 → 에스컬레이션" │
└─────────────────────────────────────┘
┌─ 관리 ──────────────────────────────┐
│ User, AppSettings                   │
│ "인증, 디바이스, 운영 설정"          │
└─────────────────────────────────────┘
```

### 0-3. Context 간 관계 매핑

```
주문 ──(생성)──→ 구독
구독 ──(참조)──→ 상품/메시지
구독 ──(입력)──→ 발송 큐
CS  ──(조회/변경)──→ 구독
CS  ──(참조)──→ 고객
```

**관계 유형:**
| 유형 | 설명 | 명세서 반영 |
|------|------|------------|
| **생성** | A가 B를 만든다 | Feature 간 의존 명시 |
| **참조** | A가 B를 읽기만 | 다른 Requirement, ID로만 참조 |
| **변경** | A가 B 상태를 수정 | description + AC에 명시 |
| **외부 연동** | 외부 시스템 변환 계층 | 별도 Feature: "외부 API 어댑터" |

**금지:** 양방향 의존 (Circular Dependency) → 단방향으로 변환

### 0-4. Requirement 분리 체크리스트

| 질문 | Yes → | No → | 중요도 |
|------|-------|------|--------|
| **독립 Aggregate Root가 있는가?** | 별도 Requirement | 기존에 합침 | 필수 |
| **유비쿼터스 언어가 다른가?** | 별도 Requirement | 같은 Context | 필수 |
| 독립 DB 테이블 그룹이 있는가? | 별도 Requirement | Feature로 분리 | 권장 |
| 독립 API 라우트 그룹이 있는가? | 별도 Requirement | Feature로 분리 | 권장 |
| 별도 UI 탭/페이지가 있는가? | 별도 Requirement 후보 | Feature로 분리 | 참고 |

**판단:** 필수 2개 중 1개 이상 Yes → 반드시 분리

**안티패턴:**
- "주문+구독+발송" 하나의 Requirement → 너무 큼
- "환불 금액 계산" 단독 Requirement → 너무 작음 (CS의 Feature)
- "고객 관리" Requirement → Customer는 여러 컨텍스트에 걸침 (Shared Kernel)

**올바른 분리:**
- Aggregate Root 단위: Subscription이 중심 → "구독 관리"
- 독립 시스템 단위: SendQueue+SendDevice → "발송 모니터링"
- 도메인 이벤트 기준: 문의→AI응답→에스컬레이션 → "CS 시스템"

### 0-5. Shared Kernel 처리 (최소화 원칙)

여러 컨텍스트에서 공유하는 엔티티는 **강결합을 만든다** → 가능하면 ID 참조로 대체.

**불가피한 경우:**
1. **소유 컨텍스트를 하나 정한다** (Customer → 주문, Product → 메시지)
2. **소유 Context만 필드 추가/수정 가능**, 다른 Context는 읽기 전용
3. **명세서에 명시**: `참조: Customer(주문 소유, 읽기전용)`
4. **공유 타입은 types.ts에 정의**

---

## 1. 구조 계층 (3-Tier)

```
PRD → Requirement → Feature → Spec
         ↑
   Bounded Context 단위
```

| 계층 | 도출 기준 | 예시 |
|------|----------|------|
| **PRD** | 제품 전체 (1개) | "1D1M 구독 서비스 운영 대시보드" |
| **Requirement** | Bounded Context | "구독 관리", "발송 모니터링", "CS 시스템" |
| **Feature** | Aggregate 내 독립 기능 | "AI 자동응답", "환불 처리", "구글시트 내보내기" |
| **Spec** | API/UI/로직 상세 | "POST /api/sending/export-sheet" |

---

## 2. PRD 작성 규칙

6개 섹션:

| 섹션 | 패턴 |
|------|------|
| **subject** | `{서비스명} — {핵심 가치 한 줄}` |
| **goal** | `[타겟] + [해결] + [가치]` (1문장) |
| **background** | 비즈니스 맥락 + 기술스택 (2~3문장) |
| **userProblem** | `1) 2) 3)` 번호, 구체적 문제 |
| **solution** | 문제별 해결 방식 (시스템 구조 중심) |
| **differentiation** | `1) 2) 3)` 경쟁 대비 차별점 |
| **targetUser** | 페르소나 수준 (역할, 팀 규모, 성향) |
| **scenario** | `1) 2) 3)` 번호 매긴 사용 흐름 |
| **kpi** | `*` 불릿 + 측정 가능한 수치 (90%+, 2초 이내 등) |
| **risk** | `*` 불릿 + "~시 ~불가" 패턴 |
| **category** | enum 중 택1 |
| **devices** | `[{ id: null, name: "Web (Desktop)" }]` 등 |
| **roles** | `[{ id: null, name: "관리자" }, ...]` |

---

## 3. Requirement 작성 규칙

**= Bounded Context 1개 = 탭/페이지 1개**

| 필드 | 규칙 |
|------|------|
| **name** | 모듈명 (간결한 한글). 예: "발송 모니터링", "CS 시스템" |
| **description** | 3단 구조 (아래 참조) |
| **acceptanceCriteria** | 검증 가능한 조건 5~10개 |
| **importance** | high / medium / low |
| **progress** | todo / in-progress / done / blocked |

### description 3단 구조

```
[한 줄 요약]. [핵심 유스케이스 나열]. [계산식/상태머신/비즈니스 규칙].

DB: [Aggregate 테이블들]
API: /api/[경로들]
참조: [다른 컨텍스트 엔티티] (읽기/변경, 소유 컨텍스트 명시)
```

### acceptanceCriteria 6가지 유형

| 유형 | 패턴 | 예시 |
|------|------|------|
| 정상 동작 | "~하면 ~된다" | "문의 등록하면 pending 상태로 저장된다" |
| 계산 검증 | "~= ~x~ 자동 계산" | "환불액 = 결제액 - 이용액 - 위약금 자동 계산" |
| 보호 규칙 | "~있으면 ~불가" | "발주 기록 있으면 SKU 삭제 불가" |
| 보안 체크 | "~권한 없으면 ~처리" | "고객 API에 customer_id 필터 필수" |
| 상태 전이 | "~상태에서 ~로 전이" | "pending에서 AI 응답 후 ai_answered로 전이" |
| 경계/부정 | "~초과/미만이면 ~처리" | "Rate limit 초과 시 429 반환" |

---

## 4. Feature 작성 규칙

**= Aggregate 내 독립 기능 단위**

| 필드 | 규칙 |
|------|------|
| **parentId** | 상위 Requirement ID (필수) |
| **name** | `{대상} {동작}` 패턴 |
| **description** | 1~3문장. 무엇+어떻게+어디 저장 |
| **roles** | 사용하는 역할 ID 배열 |
| **devices** | 동작하는 디바이스 ID 배열 |

### 분리 기준

| 기능 유형 | 분리 | 예시 |
|----------|------|------|
| CRUD 묶음 | 1 Feature | "운영 정책 CRUD" |
| 외부 연동 | 별도 Feature | "구글시트 내보내기" |
| AI/자동화 | 별도 Feature | "AI 자동응답 처리" |
| 배치/Cron | 별도 Feature | "Cron 자동 처리" |
| 보안/인증 | 별도 Feature | "고객 인증 + Rate limit" |
| 계산 로직 | 별도 Feature | "환불 금액 계산" |
| 상태 워크플로우 | 별도 Feature | "에스컬레이션 처리" |

---

## 5. Spec 작성 규칙 (3유형)

### API Spec

```
name: "POST /api/cs/inquiries"
description:
  Auth: Bearer {CS_AUTH_SECRET}
  Rate Limit: 10 req/min per customer_id

  Body: { category: string (required), content: string (required, 1-2000자) }

  처리:
  1. 세션에서 customer_id 추출
  2. cs_inquiries INSERT (status: 'pending')

  Response 200: { id, status, created_at }

  Error Cases:
  - 401: 세션 만료
  - 429: Rate limit 초과
  - 400: content 누락

  Side Effects:
  - 다음 Cron 사이클에서 AI 자동응답 트리거
```

### UI Spec

```
name: "문의 상세 페이지"
description:
  ┌──────────────────────────┐
  │ ← 목록으로               │
  │ [카테고리] 제목           │
  ├──────────────────────────┤
  │ 고객: 내용               │
  │ 담당자: 답변             │
  │ [추가 문의 입력]         │
  │ [ 답변 등록 ]            │
  └──────────────────────────┘

  컴포넌트: Card, StatusBadge, Textarea, Button
  인터랙션: pending 상태 시 10초 폴링, 답변 도착 시 자동 표시
```

### 로직 Spec

```
name: "큐 정리 정책"
description:
  트리거 → 동작:
  1. last_sent_day 변경 시 → pending+failed 큐 삭제
  2. 3일 연속 실패 시 → 자동 정지 + 큐 삭제
  3. 구독 취소 시 → pending 큐 삭제

  계산식: refund = paid_amount - (daily_rate x used_days) - (paid_amount x 0.3)
  제약: refund < 0이면 0원 처리
```

---

## 6. 도메인 모델링 산출물 → ManyFast 매핑

| 산출물 | ManyFast 위치 |
|--------|-------------|
| Bounded Context | Requirement name |
| Aggregate 목록 | Requirement description의 DB 섹션 |
| Context 간 관계 | Requirement description의 "참조" 섹션 |
| 유비쿼터스 언어 | Requirement/Feature name + description |
| 상태 머신 | acceptanceCriteria (상태 전이 유형) 또는 Spec |
| 도메인 이벤트 | Feature 분리 기준 |
| 비즈니스 규칙/계산식 | Spec (로직 유형) |
| Shared Kernel | PRD의 roles/devices + 참조 명시 |

---

## 7. ManyFast API 제약 기반 작성 전략

### 배치 크기 제한

| API | maxItems | 전략 |
|-----|----------|------|
| write_requirements | 10 | 10개 초과 시 Core → Support 순 분할 |
| write_features | 10 | Requirement별 순회 |
| write_specs | 10 | Feature별 순회 |

### 작성 순서 (ID 의존성 포함)

```
Phase 1: PRD + ID 추출
  1. write_prd (create) → devices/roles 생성
  2. read_project → devices/roles ID 추출 (이 시점에서만 조회)

Phase 2: Requirements
  3. write_requirements (create, 최대 10개씩)
  → 응답에서 Requirement ID 추출

Phase 3: Features
  4. write_features (create, Requirement별로)
  → parentId = 3번에서 받은 Requirement ID
  → roles/devices = 2번에서 추출한 ID
  → 응답에서 Feature ID 추출

Phase 4: Specs
  5. write_specs (create, Feature별로)
  → parentId = 4번에서 받은 Feature ID

Phase 5: 검증
  6. ManyFast UI에서 수동 확인 (read_project는 토큰 초과 가능)
```

### 주의사항

- **read_project**: Phase 1에서만 사용. 프로젝트 커지면 25000 토큰 초과로 실패함
- **ID 참조**: write 응답에서 받은 ID를 다음 단계에서 사용 (재조회 방지)
- **create vs update**: 신규는 id 생략, 수정은 id 필수
- **acceptanceCriteria.isDone**: 개발 완료 추적용

---

## 8. 수량 가이드

| 계층 | 최소 | 권장 | 최대 | 기준 |
|------|------|------|------|------|
| Requirement | 4 | 6~12 | 15 | Bounded Context 수 |
| Feature / Req | 2 | 3~5 | 7 | Aggregate 내 기능 수 |
| Spec / Feature | 1 | 1~3 | 5 | API+UI+로직+배치 |
| AC / Req | 5 | 5~10 | 12 | 6가지 유형 커버 |

---

## 9. 네이밍 컨벤션

| 대상 | 패턴 | 예시 |
|------|------|------|
| Requirement | `{도메인} {관리/시스템}` | "구독 관리", "CS 시스템" |
| Feature | `{대상} {동작}` | "AI 자동응답 처리", "구글시트 내보내기" |
| Spec (API) | `{METHOD} /api/{path}` | "POST /api/cs/inquiries" |
| Spec (UI) | `{페이지/컴포넌트} {용도}` | "문의 상세 페이지" |
| Spec (로직) | `{규칙/정책} {대상}` | "큐 정리 정책", "환불 계산 로직" |

---

## 10. 1d1m에서 발견한 핵심 패턴

### DB+API 명시 필수
Requirement description 끝에 항상 DB 테이블과 API 경로를 명시한다.

### 계산식은 코드 수준으로
```
current_day = computeSubscription(start_date) 기준 경과일
CM1 = (payment_amount + channel_burden) - SUM(qty x cost_price per PG)
```

### 보안 조건은 별도 강조
```
- Cron 인증: Bearer ${envSecret} (undefined 우회 방지)
- 고객 API: .eq('customer_id', session.customerId) 필수
- Rate limit: IP당 15분에 5회
```

### 상태 머신 명시
```
pending → processing → ai_answered / escalated / closed
실패 → 재시도 → 3일 연속 실패 → 자동 정지
```
