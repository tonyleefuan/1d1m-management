-- 기타 문의 테이블 (비인증 사용자용)
CREATE TABLE IF NOT EXISTS cs_general_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 최신순 조회용 인덱스
CREATE INDEX idx_cs_general_inquiries_created ON cs_general_inquiries(created_at DESC);
-- 미읽음 필터용 인덱스
CREATE INDEX idx_cs_general_inquiries_unread ON cs_general_inquiries(is_read) WHERE is_read = false;
