-- Day 시스템 재설계 마이그레이션
-- 실행: Supabase SQL Editor
-- 날짜: 2026-03-22

-- 1. subscriptions 새 칼럼 추가 (기존 칼럼 유지, 하위호환)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS last_sent_day INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_days INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS failure_type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS failure_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recovery_mode TEXT DEFAULT NULL;

-- 2. send_queues에 day_number 추가
ALTER TABLE send_queues
  ADD COLUMN IF NOT EXISTS day_number INT DEFAULT NULL;

-- 2.1. subscription_id 존재 확인 (없으면 추가)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'send_queues' AND column_name = 'subscription_id'
  ) THEN
    ALTER TABLE send_queues ADD COLUMN subscription_id UUID REFERENCES subscriptions(id);
  END IF;
END $$;

-- 2.2. send_devices에 sending_progress 칼럼 추가
ALTER TABLE send_devices
  ADD COLUMN IF NOT EXISTS sending_progress JSONB DEFAULT NULL;

-- 2.3. paused_days 증감용 RPC 함수 생성
CREATE OR REPLACE FUNCTION increment_paused_days(sub_id UUID, days INT)
RETURNS void AS $$
BEGIN
  UPDATE subscriptions
  SET paused_days = paused_days + days,
      paused_at = NULL,
      resume_date = NULL,
      updated_at = NOW()
  WHERE id = sub_id;
END;
$$ LANGUAGE plpgsql;

-- 3. 기존 데이터 마이그레이션
-- status = 'cancel' → is_cancelled = true
UPDATE subscriptions SET is_cancelled = true WHERE status = 'cancel';

-- last_send_failure → failure_type
UPDATE subscriptions SET failure_type = 'other', failure_date = CURRENT_DATE
  WHERE last_send_failure IS NOT NULL;

-- day → last_sent_day (day가 0보다 크면)
UPDATE subscriptions SET last_sent_day = GREATEST(day - 1, 0)
  WHERE day > 0;

-- 4. 인덱스
CREATE INDEX IF NOT EXISTS idx_subs_last_sent_day ON subscriptions(last_sent_day);
CREATE INDEX IF NOT EXISTS idx_subs_failure_type ON subscriptions(failure_type);
CREATE INDEX IF NOT EXISTS idx_subs_is_cancelled ON subscriptions(is_cancelled);
CREATE INDEX IF NOT EXISTS idx_send_queues_day_number ON send_queues(day_number);
