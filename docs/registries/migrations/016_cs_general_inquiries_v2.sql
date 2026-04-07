-- 기존 테이블 삭제 (데이터 없음)
DROP TABLE IF EXISTS cs_general_inquiries;

-- 기타 문의 테이블 v2 (이메일+비번 인증, 게시판 형태)
CREATE TABLE cs_general_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','answered','closed')),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 기타 문의 답글 테이블
CREATE TABLE cs_general_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES cs_general_inquiries(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('customer','admin')),
  author_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cs_general_inquiries_email ON cs_general_inquiries(email);
CREATE INDEX idx_cs_general_inquiries_created ON cs_general_inquiries(created_at DESC);
CREATE INDEX idx_cs_general_inquiries_unread ON cs_general_inquiries(is_read) WHERE is_read = false;
CREATE INDEX idx_cs_general_replies_inquiry ON cs_general_replies(inquiry_id);
