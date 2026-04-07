-- 009: CS 환불 요청 테이블
-- AI가 고객에게 결제 방법/계좌 정보를 수집하여 저장
-- 관리자가 확인 후 처리

CREATE TABLE cs_refund_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inquiry_id UUID NOT NULL REFERENCES cs_inquiries(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  customer_id UUID NOT NULL REFERENCES customers(id),

  -- 결제 정보 (order_items에서 자동 조회)
  paid_amount INT NOT NULL DEFAULT 0,         -- 결제 금액 (allocated_amount)
  paid_at TIMESTAMPTZ,                         -- 결제일 (orders.ordered_at)

  -- 환불 계산 (자동)
  used_days INT NOT NULL DEFAULT 0,           -- 이용일수 (last_sent_day)
  total_days INT NOT NULL DEFAULT 0,          -- 전체 기간 (duration_days)
  daily_rate INT NOT NULL DEFAULT 0,          -- 일일 단가 (paid_amount / total_days)
  used_amount INT NOT NULL DEFAULT 0,         -- 이용 금액 (daily_rate * used_days)
  penalty_amount INT NOT NULL DEFAULT 0,      -- 위약금 (paid_amount * 0.3, 3일 이내면 0)
  refund_amount INT NOT NULL DEFAULT 0,       -- 환불 금액 (paid_amount - used_amount - penalty_amount, 최소 0)
  is_full_refund BOOLEAN NOT NULL DEFAULT false, -- 전액 환불 여부

  -- 고객 입력 정보 (AI가 수집)
  payment_method TEXT NOT NULL CHECK (payment_method IN ('card', 'bank_transfer')),
  bank_name TEXT,                              -- 은행명 (계좌 환불 시)
  account_number TEXT,                         -- 계좌번호 (계좌 환불 시)
  account_holder TEXT,                         -- 예금주 (계좌 환불 시)
  needs_account_info BOOLEAN NOT NULL DEFAULT false, -- 계좌 정보 필요 여부

  -- 처리 상태
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',       -- 접수됨 (관리자 확인 대기)
    'approved',      -- 승인됨 (환불 진행 중)
    'completed',     -- 환불 완료
    'rejected'       -- 거절됨
  )),
  admin_note TEXT,                             -- 관리자 메모
  reject_reason TEXT,                          -- 거절 사유
  processed_by UUID REFERENCES users(id),     -- 처리한 관리자
  processed_at TIMESTAMPTZ,                    -- 처리 시각

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_cs_refund_requests_status ON cs_refund_requests(status);
CREATE INDEX idx_cs_refund_requests_customer ON cs_refund_requests(customer_id);
CREATE INDEX idx_cs_refund_requests_inquiry ON cs_refund_requests(inquiry_id);
CREATE INDEX idx_cs_refund_requests_created ON cs_refund_requests(created_at);
