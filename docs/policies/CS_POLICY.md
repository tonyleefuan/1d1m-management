# CS 정책 문서

> 1D1M 고객 문의 대응 정책 — AI 자동응답 및 관리자 에스컬레이션 기준

---

## 1. 서비스 기본 정보

| 항목 | 내용 |
|------|------|
| 서비스명 | 1Day1Message (1D1M) |
| 발송 시간 | 오전 4시 ~ 13시 (특정 시간 선택 불가) |
| 발송 채널 | 카카오톡 |
| 기본 PC 번호 | `app_settings.default_device_id` → `send_devices.phone_number`로 동적 조회 |

---

## 2. 온보딩 (신규 고객 안내)

고객이 주문 완료 후 받는 안내 메시지:

```
안녕하세요, {고객명}님!

1Day1Message 구독을 시작해 주셔서 감사합니다.

메시지 수신을 위해 아래 절차를 꼭 완료해 주세요:

1. 아래 번호를 휴대폰 연락처에 저장
   → {기본PC 번호}

2. 카카오톡에서 위 번호로 친구 추가

3. 친구 추가 후 카카오톡으로 아래 메시지 전송
   → 성함/전화번호 뒷 4자리
   (예: 홍길동/1234)

위 절차 완료 후 다음 날부터 매일 메시지가 발송됩니다.
```

### 핵심 포인트
- 연락처 저장 + 카카오톡 친구 추가 + **성함/뒷4자리 전송** — 3단계 모두 완료 필수
- 미등록 연락처로 발송 시 스팸으로 분류될 위험
- 미수신 날짜는 자동 연장 처리됨

---

## 3. 문의 카테고리별 AI 처리 정책

### 3-1. 메시지 미수신

**AI가 시스템으로 확인할 수 없는 것**: 고객이 연락처 등록 + 친구 추가 + 성함/뒷4자리 전송을 완료했는지 여부

**따라서 반드시 물어봐야 함**

#### 1차 응답 (항상)
```
{고객명}님, 문의 주셔서 감사합니다.

현재 {상품명} 구독 {N}일차이십니다.

메시지 수신을 위해 아래 절차가 모두 완료되어야 합니다:

1. 아래 번호를 휴대폰 연락처에 저장
   → {기본PC 번호}

2. 카카오톡에서 위 번호로 친구 추가

3. 친구 추가 후 카카오톡으로 아래 메시지 전송
   → 성함/전화번호 뒷 4자리
   (예: 홍길동/1234)

위 3단계 모두 완료하셨는지 확인 부탁드립니다.
아직 완료 전이시라면, 위 절차 진행 후 다음 날부터
정상 수신되실 겁니다.

이미 모두 완료하셨는데도 수신이 안 되시는 경우
다시 문의 남겨주세요.
```

#### 2차 응답 (고객이 "다 했는데 안 온다" 재문의 시)
```
확인 감사합니다.

카카오톡 설정에서 '전화번호로 친구 추가 허용'이
꺼져 있을 수 있습니다.

[카카오톡 → 설정 → 친구 → 친구 추가 허용]에서
활성화 후 확인 부탁드립니다.

그래도 해결이 안 되시면, 고객님의 카카오톡 ID를
알려주시면 담당자가 직접 친구 추가 도와드리겠습니다.
```

#### 3차 (카카오톡 ID 제공 시)
- **에스컬레이션** → 관리자가 백오피스에서 카카오톡 ID로 직접 친구 추가
- 상태: `escalated` → 관리자 처리 후 `admin_answered`

---

### 3-2. 일시정지 / 재개

**AI 즉시 처리 가능**

#### 상태 체크 (처리 전 필수)
- `pause` 상태 → 이미 정지 중이라고 안내, 재개 안내
- `completed`/`cancelled` → 정지 불가 안내
- `pending` (미시작) → 정지 불가 안내 ("아직 시작 전입니다")
- `live`/`active` → 정지 가능

#### 일시정지 요청
```
{고객명}님의 {상품명} 구독을 일시정지 처리해 드렸습니다.

- 정지일: {오늘 날짜}
- 현재 진행일: {N}일차

재개를 원하시면 언제든 문의 남겨주세요.
남은 기간은 그대로 보존됩니다.
```
- **액션**: `subscriptions.status = 'pause'`, `paused_at = today`

#### 재개 요청
```
{고객명}님의 {상품명} 구독을 재개 처리해 드렸습니다.

- 재개일: {내일 날짜}
- 이어서 {N}일차부터 발송됩니다.
```
- **액션**: `subscriptions.status = 'live'`, `paused_at = null`, `resume_date = today`, `paused_days += (today - paused_at) 일수`
- **방어**: `paused_at`이 null인 경우 paused_days 변경 없이 상태만 변경

#### 복수 구독 시
- 구독이 1개 → 바로 처리
- 구독이 2개 이상 → 목록 보여주고 어떤 구독인지 확인 후 처리

---

### 3-3. 상품 변경

**동일 가격 상품만 AI 처리 가능**

#### 가격 비교 기준
- `product_prices`에서 동일 `duration_days`의 `price` 비교

#### 가격 동일 → 즉시 처리
```
{고객명}님의 구독 상품을 변경해 드렸습니다.

- 변경 전: {기존 상품명}
- 변경 후: {새 상품명}
- 진행일: {N}일차 (유지)

내일부터 변경된 상품의 메시지가 발송됩니다.
```
- **액션**: `subscriptions.product_id` 변경, `last_sent_day` 유지

#### 가격 다름 → 거부 + 에스컬레이션
```
요청하신 상품은 현재 구독 상품과 가격이 다르기 때문에
온라인으로 바로 변경이 어렵습니다.

담당자에게 전달하여 영업일 1일 이내에 안내 드리겠습니다.
```
- **액션**: `escalate_to_admin`

#### 상품명 매칭
- 고객이 텍스트로 상품명 입력 → AI가 `products` 테이블에서 유사 매칭
- 모호하면 후보 목록 제시 후 재확인

---

### 3-4. 취소 / 환불

**AI가 정책 안내 + 정보 수집 + 환불 요청 접수**

#### 환불 정책 요약

| 구분 | 환불 기준 |
|------|----------|
| 결제 후 3일 이내 | **전액 환불** |
| 결제 후 3일 초과 | 결제 금액 - 이용일수 금액 - 위약금(결제 금액의 30%) |
| 회사 귀책 시 | 잔여 일수에 비례하여 환불 |

#### 법적 근거
- 비실물 디지털 콘텐츠 상품 — 결제 후 즉시 효력 발생
- 전자상거래법 제17조 제2항 제5호에 따라 디지털 콘텐츠 제공 시작 후 청약철회 제한
- 이용자 편의를 위해 서비스를 받지 않은 잔여 일수는 일할 계산하여 환불

#### 위약금 상세
- 금액: 결제 금액의 30%
- 명목: 메시지 발송 등록 비용, 유지 관리 비용, 수수료 등

#### AI 환불 처리 플로우

1. 환불 정책 안내 (전액 환불 기한, 위약금 등)
2. 구독이 2개 이상이면 어떤 구독을 취소할지 확인
3. 고객이 환불 의사를 밝히면 결제 방법을 질문: "카드 결제" 또는 "계좌이체/무통장입금"
4. **계좌이체/무통장**: 은행명, 계좌번호, 예금주 수집
5. **카드 결제**: 바로 `request_refund` 도구 호출
   - 도구가 `NEEDS_ACCOUNT_INFO` 에러 반환 시 (결제 후 30일 초과 → PG 카드 취소 불가) 계좌 정보 추가 수집
6. 정보 수집 완료 → `request_refund` 도구 호출 → 환불 요청 자동 접수
7. 접수 완료 후 환불 금액과 함께 "담당자가 확인 후 처리해 드리겠습니다" 안내

#### 환불 금액 자동 계산 (`src/lib/refund.ts`)
- 결제 금액: `order_items.allocated_amount`
- 이용일수: `subscriptions.last_sent_day`
- 전체 기간: `subscriptions.duration_days`
- 결제일: `orders.ordered_at`
- 일일 단가: `paid_amount / total_days` (내림)
- 이용 금액: `daily_rate * used_days`
- 위약금: 결제 후 3일 이내면 0, 초과하면 `paid_amount * 0.3`
- 환불 금액: `paid_amount - used_amount - penalty_amount` (최소 0)

#### 계좌 정보 필요 조건
- 결제 방법이 계좌이체/무통장인 경우
- 카드 결제이나 결제 후 30일 초과 (PG 카드 취소 불가)

#### AI 처리 규칙
- 환불 요청 접수 후 자동으로 **에스컬레이션** (관리자 확인 필요)
- 관리자가 CS 탭 > 환불 요청 섹션에서 승인/완료/거절 처리
- 환불 완료 시 구독 자동 취소 처리

---

### 3-5. 기타

**에스컬레이션 → 관리자 답변**

```
문의 접수되었습니다.
영업일 1일 이내에 답변 드리겠습니다.
```
- 상태: `escalated`
- 관리자가 백오피스 CS 탭에서 확인 후 답변

---

### 3-6. 발송 시간 안내

**AI 즉시 응답 — 정보 안내만**

```
메시지는 매일 오전 자동으로 발송됩니다.
시간을 따로 설정할 수는 없지만, 매일 오전에 하루를
시작하며 도움이 되는 메시지를 받아보실 수 있습니다.

(발송 시간은 조금씩 달라질 수 있어요.)
```

#### AI 참고사항
- 발송 시간대: 오전 4시 ~ 13시
- 특정 시간 선택/변경 불가
- PC별로 순차 발송하므로 수신 시간이 매일 조금씩 다를 수 있음

---

### 3-7. 결제 및 서비스 종료

**AI 즉시 응답 — 정보 안내만**

```
이용 기간이 종료되면 서비스가 자동으로 중지됩니다.
연장을 원하시면 추가 결제가 필요합니다.

정기 결제가 아니기 때문에, 추가로 결제하실 필요는
없습니다. 한 번 결제하시면 선택하신 기간 동안 매일
메시지를 받아보실 수 있습니다.
```

#### AI 참고사항
- 1회 결제 → 선택 기간 동안 매일 발송
- 정기 결제 아님 — 자동 갱신 없음
- 결제 완료 후 다음 날부터 발송 시작

---

### 3-8. 서비스 유의사항 (AI 공통 참조)

아래 내용은 별도 카테고리가 아닌, AI가 관련 문의 시 참고하는 일반 정책입니다.

- 구성 내용은 사전 고지 없이 변경될 수 있습니다.
- 상황에 따라 사전 공지 없이 할인이나 조기 마감, 연장될 수 있습니다.
- 이벤트 및 프로모션으로 인해 가격이 변동될 수 있으며, 이로 인한 환불이나 가격 보상은 불가능합니다.
- 천재지변이나 외부 사유로 인해 서비스가 중단될 경우, 별도의 공지를 통해 서비스 종료 절차가 안내됩니다.
- 카카오톡의 오류 또는 정책 변경으로 인해 메시지 수신 혹은 발신이 불가능할 경우, 문자 메시지로 발송될 수 있습니다.

---

### 3-9. 전화 상담 요청

**전화 상담은 운영하지 않음 — 정중히 안내**

```
전화 상담은 운영하지 않고 있으며, 이 채널을 통해 답변드리고 있습니다.
담당자가 확인 후 영업일 1일 이내에 답변 드리겠습니다.
```

#### AI 참고사항
- 전화 연락, 전화 문의, 콜백 요청 등 모두 동일 안내
- 고객이 반복 요청해도 동일 안내 유지 — 전화 상담 약속 절대 금지
- 실질적 불만이 있으면 해당 문제를 먼저 해결하는 방향으로 안내

---

### 3-10. 소비자원 신고·법적 조치 위협

**위협 자체에 반응하지 않고 해결책으로 전환**

```
불편을 드려 죄송합니다.
고객님께서 원하시는 부분을 해결해 드리겠습니다.
환불 및 이용기간 연장이 가능하니, 어떤 방향으로 도움 드릴지 말씀해 주세요.
```

#### AI 참고사항
- "소비자원", "신고", "고소", "법적 조치" 등 위협성 키워드에 반응하지 말 것
- 과도한 사과 금지 (1문장 사과 후 바로 해결책 제시)
- 고객이 구체적 해결 요청 없이 감정적 발언만 반복하면 에스컬레이션
- 실질적 해결 옵션: 환불 (정책대로), 기간 연장 (미수신 일수만큼)

---

## 4. AI 응답 톤 가이드

### 기본 원칙
- **직원 말투 + 존댓말** (Option B)
- 정중하되 자연스럽게
- 전형적 AI 느낌 배제 ("안녕하세요! 무엇을 도와드릴까요?" 금지)
- 이모지 사용 금지
- 간결하고 핵심 위주

### 예시

| 상황 | 좋은 예 | 나쁜 예 |
|------|---------|---------|
| 인사 | "문의 주셔서 감사합니다." | "안녕하세요! 어떤 도움이 필요하신가요?" |
| 처리 완료 | "일시정지 처리해 드렸습니다." | "네! 처리 완료되었습니다~ 다른 문의가 있으시면 언제든 말씀해 주세요!" |
| 불가 안내 | "온라인으로 바로 처리가 어렵습니다." | "죄송합니다만, 해당 요청은 현재 시스템에서 자동으로 처리할 수 없는 사항입니다." |
| 에스컬레이션 | "담당자가 확인 후 영업일 1일 이내에 답변 드리겠습니다." | "담당자에게 전달하여 빠른 시일 내에 회신 드리도록 하겠습니다! 감사합니다!" |

---

## 5. 시스템 규칙

### 인증
- 주문번호 + 전화번호 뒷4자리로 인증
- 유효한 주문번호면 해당 고객의 **모든 구독** 조회 가능

### 보안
- 별도 JWT (`1d1m-cs-session`), 별도 시크릿 (`CS_AUTH_SECRET`)
- 세션 만료: 1시간
- Rate limit: 인증 5회/15분, 문의 20건/시간

### 데이터 보존
- `closed`, `ai_answered`, `admin_answered`, `dismissed` → 7일 후 자동 삭제
- `escalated` → 관리자가 답변하거나 스킵할 때까지 **삭제 안 함**
- 고객 재방문 시 이전 문의 + 관리자 답변 확인 가능 (삭제 전까지)

### 문의 상태 전이

```
pending       → ai_answered      (AI 답변 완료)
pending       → escalated        (AI가 에스컬레이션)
ai_answered   → closed           (7일 후 자동)
ai_answered   → escalated        (고객 재문의 → 에스컬레이션)
escalated     → admin_answered   (관리자 답변)
escalated     → dismissed        (관리자 스킵/무시)
admin_answered → escalated       (고객 추가 문의)
admin_answered → closed          (7일 후 자동)
dismissed     → closed           (7일 후 자동)
```

### AI 도구 (Tool Calling)

| 도구 | 용도 | 즉시 실행 |
|------|------|----------|
| `query_subscription` | 구독 현황 조회 | O |
| `query_default_device` | 기본 PC 번호 조회 | O |
| `pause_subscription` | 일시정지 처리 | O |
| `resume_subscription` | 재개 처리 | O |
| `change_product` | 상품 변경 (동일 가격) | O |
| `search_product` | 상품명 검색 | O |
| `request_refund` | 환불 요청 접수 (정보 수집 후) | O |
| `escalate_to_admin` | 관리자 에스컬레이션 | O |

---

## 6. 관리자 백오피스 (CS 탭)

### 4개 섹션

#### 섹션 1: 확인 필요
- `status = 'escalated'` 문의 목록
- 관리자 액션: **답변** 또는 **스킵(무시)**
- 답변 → `admin_answered`, 스킵 → `dismissed`
- 스킵된 문의는 고객에게 별도 알림 없음

#### 섹션 2: AI 응대
- `status = 'ai_answered'` 문의 목록
- 모니터링 용도 — AI 응답 품질 확인
- 관리자가 추가 답변 가능

#### 섹션 3: 환불 요청
- AI가 접수한 환불 요청 목록 (`cs_refund_requests` 테이블)
- 환불 금액 자동 계산 결과 표시 (결제 금액, 이용 금액, 위약금, 환불 금액)
- 결제 방법 및 계좌 정보 표시
- 관리자 액션: **승인** → **환불 완료** 또는 **거절**
  - 승인: 환불 진행 표시
  - 환불 완료: 환불 처리 완료 + 구독 자동 취소
  - 거절: 거절 사유 필수 입력
- pending 상태에서 뱃지 카운트 표시

#### 섹션 4: 운영 정책
- 카테고리별 정책 텍스트 관리
- 웹에서 직접 편집 가능
- 수정 내용은 AI 응답에 자동 반영
- `cs_policies` 테이블에 저장

---

## 7. DB 스키마

### 신규 테이블

```sql
-- CS 문의 (게시판 글)
CREATE TABLE cs_inquiries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  category TEXT NOT NULL CHECK (category IN (
    'message_not_received','pause_resume','product_change','cancel_refund','other'
  )),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','ai_answered','escalated','admin_answered','dismissed','closed'
  )),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- CS 답변 (게시판 댓글 — 고객/AI/관리자 모두 reply로)
CREATE TABLE cs_replies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inquiry_id UUID NOT NULL REFERENCES cs_inquiries(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('ai','admin','customer')),
  author_name TEXT,
  content TEXT NOT NULL,
  action_taken JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 운영 정책 (AI 응답 참조 + 관리자 편집)
CREATE TABLE cs_policies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  ai_instruction TEXT,
  sort_order INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES users(id)
);

-- 환불 요청
CREATE TABLE cs_refund_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inquiry_id UUID NOT NULL REFERENCES cs_inquiries(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  paid_amount INT NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  used_days INT NOT NULL DEFAULT 0,
  total_days INT NOT NULL DEFAULT 0,
  daily_rate INT NOT NULL DEFAULT 0,
  used_amount INT NOT NULL DEFAULT 0,
  penalty_amount INT NOT NULL DEFAULT 0,
  refund_amount INT NOT NULL DEFAULT 0,
  is_full_refund BOOLEAN NOT NULL DEFAULT false,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('card', 'bank_transfer')),
  bank_name TEXT,
  account_number TEXT,
  account_holder TEXT,
  needs_account_info BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','approved','completed','rejected'
  )),
  admin_note TEXT,
  reject_reason TEXT,
  processed_by UUID REFERENCES users(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Rate limiting
CREATE TABLE cs_rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL,
  action TEXT NOT NULL,
  attempted_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_cs_inquiries_customer ON cs_inquiries(customer_id);
CREATE INDEX idx_cs_inquiries_status ON cs_inquiries(status);
CREATE INDEX idx_cs_inquiries_created ON cs_inquiries(created_at);
CREATE INDEX idx_cs_replies_inquiry ON cs_replies(inquiry_id);
CREATE INDEX idx_cs_refund_requests_status ON cs_refund_requests(status);
CREATE INDEX idx_cs_refund_requests_customer ON cs_refund_requests(customer_id);
CREATE INDEX idx_cs_refund_requests_inquiry ON cs_refund_requests(inquiry_id);
CREATE INDEX idx_cs_refund_requests_created ON cs_refund_requests(created_at);
CREATE INDEX idx_cs_rate_limits_cleanup ON cs_rate_limits(attempted_at);
```

### 정책 초기 데이터

| category | title |
|----------|-------|
| `message_not_received` | 메시지 미수신 |
| `pause_resume` | 일시정지/재개 |
| `product_change` | 상품 변경 |
| `cancel_refund` | 취소/환불 |
| `delivery_time` | 발송 시간 안내 |
| `onboarding` | 온보딩 절차 |
