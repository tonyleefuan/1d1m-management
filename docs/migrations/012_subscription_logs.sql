-- ============================================================
-- 012: 구독 변경 이력 로그
-- ============================================================
-- 구독(subscriptions) 필드 변경 시 자동으로 기록되는 감사 로그 테이블.
-- 상태 변경, 디바이스 배정, 메모 수정, 시작일 변경, 카카오 친구명 변경,
-- 상품 변경, Day 조정, 실패 해제 등 모든 변경 이력을 추적한다.
--
-- 사용처:
--   INSERT: src/app/api/subscriptions/update/route.ts (logChange 헬퍼)
--   SELECT: src/app/api/subscriptions/logs/route.ts (JOIN users)

CREATE TABLE IF NOT EXISTS subscription_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 대상 구독
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,

  -- 변경 종류 (status_change, device_change, memo_update, start_date_change,
  --           kakao_name_change, product_change, day_adjust, resolve_failure)
  action TEXT NOT NULL,

  -- 변경된 필드명 (status, device_id, memo, start_date, kakao_friend_name,
  --               product_id, day, failure_type 등)
  field_name TEXT,

  -- 변경 전/후 값 (사람이 읽을 수 있는 레이블로 저장)
  old_value TEXT,
  new_value TEXT,

  -- 변경을 수행한 관리자 (users 테이블 FK, Supabase PostgREST 조인: user:users(name))
  created_by UUID REFERENCES users(id),

  -- 비고 (취소 사유 등 추가 맥락)
  memo TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- 특정 구독의 변경 이력 조회 (최신순)
CREATE INDEX IF NOT EXISTS idx_subscription_logs_sub_id
  ON subscription_logs (subscription_id, created_at DESC);

-- 특정 관리자의 변경 이력 조회
CREATE INDEX IF NOT EXISTS idx_subscription_logs_created_by
  ON subscription_logs (created_by);
