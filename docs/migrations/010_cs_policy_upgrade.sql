-- ============================================================
-- 010: CS 정책 고도화 — 카테고리 확장 + 정책 시드 + AI 피드백
-- ============================================================

-- ── 1. cs_inquiries 카테고리 확장 ──
-- 기존: message_not_received, pause_resume, product_change, cancel_refund, other
-- 추가: delivery_time, payment_info
ALTER TABLE cs_inquiries
  DROP CONSTRAINT IF EXISTS cs_inquiries_category_check;

ALTER TABLE cs_inquiries
  ADD CONSTRAINT cs_inquiries_category_check
  CHECK (category IN (
    'message_not_received','pause_resume','product_change',
    'cancel_refund','delivery_time','payment_info','other'
  ));

-- ── 2. cs_inquiries 상태에 processing 추가 (이미 코드에서 사용 중이나 CHECK 누락) ──
ALTER TABLE cs_inquiries
  DROP CONSTRAINT IF EXISTS cs_inquiries_status_check;

ALTER TABLE cs_inquiries
  ADD CONSTRAINT cs_inquiries_status_check
  CHECK (status IN (
    'pending','processing','ai_answered','escalated',
    'admin_answered','dismissed','closed'
  ));

-- ── 3. cs_replies author_type에 system 추가 (이미 코드에서 사용 중이나 CHECK 누락) ──
ALTER TABLE cs_replies
  DROP CONSTRAINT IF EXISTS cs_replies_author_type_check;

ALTER TABLE cs_replies
  ADD CONSTRAINT cs_replies_author_type_check
  CHECK (author_type IN ('ai','admin','customer','system'));

-- ── 4. 신규 정책 시드 데이터 ──
INSERT INTO cs_policies (category, title, content, ai_instruction, sort_order) VALUES
(
  'payment_info',
  '결제 및 서비스 종료',
  '## 결제 방식
- 1회 결제 상품입니다. 정기 결제가 아니므로 자동 갱신이 없습니다.
- 결제 완료 후 다음 날부터 발송이 시작됩니다.

## 서비스 종료
- 이용 기간이 종료되면 서비스가 자동으로 중지됩니다.
- 연장을 원하시면 추가 결제가 필요합니다.

## 유의사항
- 구성 내용은 사전 고지 없이 변경될 수 있습니다.
- 이벤트/프로모션으로 인해 가격이 변동될 수 있으며, 이로 인한 환불이나 가격 보상은 불가능합니다.
- 천재지변이나 외부 사유로 서비스가 중단될 경우, 별도 공지를 통해 서비스 종료 절차가 안내됩니다.
- 카카오톡 오류/정책 변경으로 메시지 수신이 불가능할 경우, 문자 메시지로 대체 발송될 수 있습니다.',
  '정기 결제 아닌 1회 결제임을 명확히 안내하세요. 자동 갱신/자동 결제 걱정은 불필요하다고 안심시켜 주세요. 이벤트/프로모션 가격 변동에 따른 환불/보상 요구는 불가능하므로 정중히 안내하세요.',
  6
),
(
  'general_notice',
  '일반 안내사항',
  '## 서비스 일반 안내

- 미수신 날짜는 자동으로 연장 처리됩니다.
- 미등록 연락처로 발송 시 스팸으로 분류될 수 있으므로, 반드시 연락처 저장 후 수신해 주세요.
- 카카오톡 장애 시 문자 메시지로 대체 발송될 수 있습니다.
- 특정 시간 선택/변경은 불가능합니다.',
  '자주 묻는 일반 질문에 대한 안내입니다. 다른 카테고리에 명확히 해당하지 않는 질문을 받았을 때 참고하세요.',
  7
)
ON CONFLICT (category) DO NOTHING;

-- ── 5. 기존 cancel_refund 정책 업데이트 ──
-- 007 시드에 남아있던 Google Form 링크 + 구 환불 정책을 현행 코드 기반으로 교정
UPDATE cs_policies
SET
  content = '## 환불 정책

| 구분 | 기준 |
|------|------|
| 결제 후 3일 이내 | 전액 환불 |
| 결제 후 3일 초과 | 결제 금액 - 이용일수 금액 - 위약금(결제 금액의 30%) |

### 환불 금액 계산
- 일일 단가 = 결제 금액 / 전체 기간 (내림)
- 이용 금액 = 일일 단가 x 이용일수
- 위약금 = 결제 금액 x 30% (결제 후 3일 이내면 0원)
- 환불 금액 = 결제 금액 - 이용 금액 - 위약금 (최소 0원)

### 법적 근거
- 비실물 디지털 콘텐츠 상품으로, 결제 후 즉시 효력이 발생합니다.
- 전자상거래법 제17조 제2항 제5호에 따라 디지털 콘텐츠 제공이 시작된 후에는 청약철회가 제한됩니다.
- 이용자 편의를 위해 서비스를 받지 않은 잔여 일수는 일할 계산하여 환불합니다.
- 위약금(30%)은 메시지 발송 등록 비용, 인프라 유지 관리 비용, 결제 수수료 등 실제 발생 비용을 근거로 산정됩니다.

### 환불 계좌
- 카드 결제: 카드 취소 처리 (결제 후 30일 초과 시 계좌 환불)
- 계좌이체/무통장: 환불 계좌 정보(은행명, 계좌번호, 예금주) 필요

### 환불 처리
- 환불 요청 접수 후 영업일 1일 이내에 처리합니다.',
  ai_instruction = '환불 처리 플로우:
1. 환불 정책(전액 환불 기한, 위약금 등)을 먼저 안내합니다.
2. 구독이 2개 이상이면 어떤 구독을 취소할지 확인합니다.
3. 고객이 환불을 원하면 결제 방법을 질문합니다: "카드 결제" 또는 "계좌이체/무통장입금"
4. 계좌이체/무통장: 은행명, 계좌번호, 예금주를 수집합니다.
5. 카드 결제: 바로 request_refund 도구를 호출합니다. NEEDS_ACCOUNT_INFO 에러 시 계좌 정보를 추가 수집합니다.
6. 정보 수집 완료 후 request_refund 도구를 호출하여 환불 요청을 접수합니다.
7. 접수 완료 후 환불 금액과 함께 "담당자가 확인 후 처리해 드리겠습니다"라고 안내합니다.

주의: 법적 근거를 묻는 고객에게는 전자상거래법 제17조 제2항 제5호를 인용하여 안내하세요. 위약금 30%의 근거(발송 등록비, 인프라 유지비, 수수료)도 안내 가능합니다.'
WHERE category = 'cancel_refund';

-- ── 6. AI 응답 품질 피드백 테이블 ──
CREATE TABLE IF NOT EXISTS cs_ai_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inquiry_id UUID NOT NULL REFERENCES cs_inquiries(id) ON DELETE CASCADE,
  reply_id UUID NOT NULL REFERENCES cs_replies(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('good', 'bad')),
  note TEXT,
  rated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_ai_feedback_inquiry ON cs_ai_feedback(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_cs_ai_feedback_reply ON cs_ai_feedback(reply_id);

-- ── 7. AI 응답 한도 설정 컬럼 (카테고리별 차등) ──
ALTER TABLE cs_policies
  ADD COLUMN IF NOT EXISTS ai_max_replies INT DEFAULT 2;

-- 카테고리별 AI 응답 한도 설정
UPDATE cs_policies SET ai_max_replies = 3 WHERE category = 'message_not_received';  -- 미수신: 3단계 안내
UPDATE cs_policies SET ai_max_replies = 2 WHERE category = 'pause_resume';           -- 일시정지: 2회면 충분
UPDATE cs_policies SET ai_max_replies = 2 WHERE category = 'product_change';         -- 상품 변경: 2회
UPDATE cs_policies SET ai_max_replies = 4 WHERE category = 'cancel_refund';          -- 환불: 정보 수집 필요
UPDATE cs_policies SET ai_max_replies = 1 WHERE category = 'delivery_time';          -- 발송 시간: 1회 안내
UPDATE cs_policies SET ai_max_replies = 2 WHERE category = 'payment_info';           -- 결제 정보: 2회
UPDATE cs_policies SET ai_max_replies = 1 WHERE category = 'general_notice';         -- 일반: 1회 후 에스컬레이션
UPDATE cs_policies SET ai_max_replies = 1 WHERE category = 'onboarding';             -- 온보딩: 1회 안내 (미수신에서 처리)
