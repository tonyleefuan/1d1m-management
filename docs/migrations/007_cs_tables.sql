-- ============================================================
-- 007: CS 문의 시스템 테이블
-- ============================================================

-- CS 문의 (게시판 글)
CREATE TABLE IF NOT EXISTS cs_inquiries (
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
  -- 문의 작성 시 선택한 구독 (AI 참조용)
  subscription_id UUID REFERENCES subscriptions(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- CS 답변 (게시판 댓글)
CREATE TABLE IF NOT EXISTS cs_replies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inquiry_id UUID NOT NULL REFERENCES cs_inquiries(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('ai','admin','customer')),
  author_name TEXT,
  content TEXT NOT NULL,
  action_taken JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 운영 정책 (AI 응답 참조 + 관리자 편집)
CREATE TABLE IF NOT EXISTS cs_policies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  ai_instruction TEXT,
  sort_order INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES users(id)
);

-- Rate limiting
CREATE TABLE IF NOT EXISTS cs_rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('auth','inquiry')),
  attempted_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_cs_inquiries_customer ON cs_inquiries(customer_id);
CREATE INDEX IF NOT EXISTS idx_cs_inquiries_status ON cs_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_cs_inquiries_created ON cs_inquiries(created_at);
CREATE INDEX IF NOT EXISTS idx_cs_replies_inquiry ON cs_replies(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_cs_rate_limits_identifier ON cs_rate_limits(identifier, action, attempted_at);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_cs_inquiries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cs_inquiries_updated_at ON cs_inquiries;
CREATE TRIGGER trg_cs_inquiries_updated_at
  BEFORE UPDATE ON cs_inquiries
  FOR EACH ROW EXECUTE FUNCTION update_cs_inquiries_updated_at();

-- 정책 초기 데이터
INSERT INTO cs_policies (category, title, content, ai_instruction, sort_order) VALUES
(
  'onboarding',
  '온보딩 절차',
  '## 메시지 수신을 위한 필수 절차

1. 아래 번호를 휴대폰 연락처에 저장
2. 카카오톡에서 위 번호로 친구 추가
3. 친구 추가 후 카카오톡으로 **성함/전화번호 뒷 4자리** 전송 (예: 홍길동/1234)

위 절차 완료 후 다음 날부터 매일 메시지가 발송됩니다.',
  '온보딩 3단계를 반드시 모두 안내해야 합니다. 특히 3번째 단계(성함/뒷4자리 전송)를 빠뜨리지 마세요. 기본 PC 번호는 query_default_device로 조회하세요.',
  0
),
(
  'message_not_received',
  '메시지 미수신',
  '## 메시지가 안 올 때

연락처 등록 + 카카오톡 친구 추가 + 성함/뒷4자리 전송이 모두 완료되어야 메시지를 받을 수 있습니다.

미수신 날짜는 자동으로 연장 처리됩니다.',
  '1차: 온보딩 3단계 완료 여부를 반드시 질문하세요 (시스템으로 확인 불가). 2차: 카카오톡 설정 > 친구 > 친구 추가 허용 확인 안내. 3차: 카카오톡 ID 요청 후 에스컬레이션.',
  1
),
(
  'pause_resume',
  '일시정지/재개',
  '## 일시정지 및 재개

구독을 일시정지하면 남은 기간이 보존됩니다.
재개 요청 시 다음 날부터 발송이 재개됩니다.',
  '처리 전 구독 상태를 반드시 확인하세요. pause → 이미 정지 중 안내. completed/cancelled → 불가 안내. pending → 아직 시작 전 안내. 복수 구독 시 어떤 구독인지 확인 필수.',
  2
),
(
  'product_change',
  '상품 변경',
  '## 상품 변경

동일 가격 상품 간 변경이 가능합니다.
변경 시 진행일(Day)은 유지되며, 다음 날부터 새 상품 메시지가 발송됩니다.',
  '동일 가격(같은 duration_days, channel 기준) 상품만 즉시 변경 가능. 가격이 다르면 에스컬레이션. 고객이 상품명을 부정확하게 입력할 수 있으므로 products 테이블에서 유사 매칭 시도.',
  3
),
(
  'cancel_refund',
  '취소/환불',
  '## 환불 정책

- 결제 후 7일 이내, 메시지 발송 전: 전액 환불
- 메시지 발송 시작 후: 잔여 기간 일할 계산하여 환불 (이미 발송된 기간은 정가 기준 차감)
- 구독 시작 후 30일 초과: 환불 불가

## 환불 신청
아래 양식을 작성해 주시면 영업일 1일 이내에 처리해 드립니다.

→ https://docs.google.com/forms/d/e/1FAIpQLSdF9JO_aMXTakmDep3aTGs7bQPJMpwkfKUI4IG08E5WM24NOA/viewform',
  'AI가 직접 취소/환불을 처리하지 마세요. 정책 안내와 Google Form 링크만 제공하세요.',
  4
),
(
  'delivery_time',
  '발송 시간 안내',
  '## 발송 시간

매일 오전 4시 ~ 13시 사이에 발송됩니다.
특정 시간을 선택하실 수는 없습니다.',
  '발송 시간 문의 시 이 정책을 안내하세요.',
  5
)
ON CONFLICT (category) DO NOTHING;
