-- ============================================================
-- 013: 앱 설정 (Key-Value 저장소)
-- ============================================================
-- 시스템 전역 설정을 key-value 형태로 저장하는 테이블.
-- 탭 순서(tab_order), 기본 디바이스(default_device_id),
-- 발송 관련 운영 파라미터(SYSTEM_SETTING_KEYS) 등을 관리한다.
--
-- 사용처:
--   UPSERT: src/app/api/admin/settings/route.ts (POST, PATCH)
--   SELECT: src/lib/settings.ts (getSystemSettings, getSetting)
--   SELECT: src/app/api/sending/*.ts, src/app/api/orders/confirm/route.ts 등 20+곳

CREATE TABLE IF NOT EXISTS app_settings (
  -- 설정 키 (예: 'tab_order', 'default_device_id', 'sending_batch_size' 등)
  key TEXT PRIMARY KEY,

  -- 설정 값 (TEXT로 저장, 타입 캐스팅은 애플리케이션 레벨에서 처리)
  value TEXT,

  -- 마지막 수정 시각
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 초기 설정값 예시 (필요 시 주석 해제)
-- INSERT INTO app_settings (key, value) VALUES
--   ('tab_order', '["orders","subscriptions","messages","products","sending","admin"]'),
--   ('default_device_id', NULL)
-- ON CONFLICT (key) DO NOTHING;
