-- ============================================================
-- 1D1M Management — DB 초기화 스크립트
-- ============================================================
--
-- 경고: 이 스크립트는 모든 데이터를 삭제합니다!
-- 실행 전 반드시 백업하세요.
--
-- 실행 방법: Supabase SQL Editor에서 복사 & 붙여넣기
-- ============================================================

-- 1. 기존 데이터 삭제 (외래키 역순)
-- ────────────────────────────────────────────────────────

-- 발송 관련
TRUNCATE TABLE send_logs CASCADE;
TRUNCATE TABLE send_queues CASCADE;

-- 구독 관련
TRUNCATE TABLE subscriptions CASCADE;

-- 주문 관련
TRUNCATE TABLE order_items CASCADE;
TRUNCATE TABLE orders CASCADE;

-- 고객 관련
TRUNCATE TABLE customers CASCADE;

-- 메시지 관련
TRUNCATE TABLE daily_messages CASCADE;
TRUNCATE TABLE messages CASCADE;
TRUNCATE TABLE notice_templates CASCADE;
TRUNCATE TABLE product_prompts CASCADE;

-- 상품 관련 (가격 먼저 삭제)
TRUNCATE TABLE product_prices CASCADE;
-- products는 유지하거나, 필요시 주석 해제
-- TRUNCATE TABLE products CASCADE;

-- 디바이스 관련 (유지 권장)
-- TRUNCATE TABLE send_devices CASCADE;

-- 사용자 관련 (유지 권장)
-- TRUNCATE TABLE users CASCADE;

-- 2. 시퀀스 초기화 (필요시)
-- ────────────────────────────────────────────────────────
-- UUID를 사용하므로 대부분 불필요하지만,
-- 특정 INT 시퀀스가 있다면 여기에 추가

-- 3. 확인
-- ────────────────────────────────────────────────────────

SELECT
  'customers' as table_name, COUNT(*) as count FROM customers
UNION ALL
SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'order_items', COUNT(*) FROM order_items
UNION ALL
SELECT 'subscriptions', COUNT(*) FROM subscriptions
UNION ALL
SELECT 'messages', COUNT(*) FROM messages
UNION ALL
SELECT 'daily_messages', COUNT(*) FROM daily_messages
UNION ALL
SELECT 'send_queues', COUNT(*) FROM send_queues
UNION ALL
SELECT 'send_logs', COUNT(*) FROM send_logs
ORDER BY table_name;

-- 완료!
-- 이제 import-subscriptions.ts 스크립트를 실행하세요.
