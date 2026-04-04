-- ============================================================
-- 011: CS 카테고리 분리 — message_not_received → message_never_received + message_stopped
-- ============================================================

-- ── 1. 기존 CHECK 제약조건 먼저 제거 (새 카테고리 값이 이미 존재할 수 있음) ──
ALTER TABLE cs_inquiries
  DROP CONSTRAINT IF EXISTS cs_inquiries_category_check;

-- ── 2. 기존 데이터 마이그레이션 (message_not_received → message_never_received) ──
UPDATE cs_inquiries
SET category = 'message_never_received'
WHERE category = 'message_not_received';

-- ── 3. 새 CHECK 제약조건 추가 ──
ALTER TABLE cs_inquiries
  ADD CONSTRAINT cs_inquiries_category_check
  CHECK (category IN (
    'message_never_received','message_stopped',
    'pause_resume','product_change',
    'cancel_refund','delivery_time','payment_info','other'
  ));

-- ── 3. cs_policies에 신규 카테고리 시드 (기존 message_not_received → message_never_received) ──
UPDATE cs_policies
SET category = 'message_never_received'
WHERE category = 'message_not_received';

-- message_stopped 정책 추가
INSERT INTO cs_policies (category, title, content, ai_instruction, sort_order, ai_max_replies)
VALUES (
  'message_stopped',
  '메시지가 오다가 안 와요',
  '구독이 정상(live) 상태인데 메시지가 중단된 경우입니다. 마지막 수신 날짜를 확인하여 발송 로그를 점검합니다.',
  '먼저 query_subscription으로 구독 상태를 확인하세요. 만료/일시정지/취소 상태라면 안내하고, 정상(live) 상태인데 메시지가 안 오는 경우 에스컬레이션하세요.',
  2,
  2
)
ON CONFLICT (category) DO NOTHING;

-- ── 4. cs_cron_logs 오래된 로그 정리용 인덱스 ──
CREATE INDEX IF NOT EXISTS idx_cs_cron_logs_finished_at ON cs_cron_logs(finished_at);
