-- ============================================================
-- 008: CS Cron 배치 처리 + 보안 강화
-- ============================================================

-- 1. cs_inquiries status에 processing 추가 (낙관적 잠금용)
ALTER TABLE cs_inquiries DROP CONSTRAINT IF EXISTS cs_inquiries_status_check;
ALTER TABLE cs_inquiries ADD CONSTRAINT cs_inquiries_status_check
  CHECK (status IN (
    'pending','processing','ai_answered','escalated','admin_answered','dismissed','closed'
  ));

-- 2. cs_rate_limits action에 reply 추가 (댓글 Rate Limit)
ALTER TABLE cs_rate_limits DROP CONSTRAINT IF EXISTS cs_rate_limits_action_check;
ALTER TABLE cs_rate_limits ADD CONSTRAINT cs_rate_limits_action_check
  CHECK (action IN ('auth','inquiry','reply'));

-- 3. Cron 실행 로그 테이블
CREATE TABLE IF NOT EXISTS cs_cron_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  pending_count INT DEFAULT 0,
  followup_count INT DEFAULT 0,
  processed_count INT DEFAULT 0,
  error_count INT DEFAULT 0,
  errors JSONB,
  duration_ms INT
);

-- 4. 인증 실패 추적 (주문번호별 백오프)
CREATE TABLE IF NOT EXISTS cs_auth_lockouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_no TEXT NOT NULL,
  fail_count INT DEFAULT 1,
  locked_until TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_auth_lockouts_order ON cs_auth_lockouts(order_no);

-- 5. Rate limit 자동 정리 (24시간 이상 된 레코드 제거)
-- Cron에서 주기적으로 실행
-- DELETE FROM cs_rate_limits WHERE attempted_at < now() - interval '24 hours';

-- 6. stuck processing 복구 인덱스
CREATE INDEX IF NOT EXISTS idx_cs_inquiries_processing ON cs_inquiries(status, updated_at)
  WHERE status = 'processing';
