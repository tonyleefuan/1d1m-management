-- ============================================================
-- 012: channel 컬럼 제거
-- product_prices, order_items 테이블에서 미사용 channel 컬럼 삭제
-- 모든 값이 'kakaotalk' 단일값이므로 의미 없음
-- ============================================================

-- 1. product_prices — channel 컬럼 제거
-- 기존 unique 제약이 있다면 먼저 삭제 (product_id, duration_days, channel)
DO $$
BEGIN
  -- Drop any unique constraint that includes channel
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'product_prices'
      AND tc.constraint_type = 'UNIQUE'
      AND ccu.column_name = 'channel'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE product_prices DROP CONSTRAINT ' || tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_name = 'product_prices'
        AND tc.constraint_type = 'UNIQUE'
        AND ccu.column_name = 'channel'
      LIMIT 1
    );
  END IF;
END $$;

-- Drop index if exists
DROP INDEX IF EXISTS idx_product_prices_channel;

-- Drop column
ALTER TABLE product_prices DROP COLUMN IF EXISTS channel;

-- Re-create unique constraint without channel (product_id + duration_days)
ALTER TABLE product_prices
  ADD CONSTRAINT uq_product_prices_product_duration
  UNIQUE (product_id, duration_days);


-- 2. order_items — channel 컬럼 제거
DROP INDEX IF EXISTS idx_order_items_channel;
ALTER TABLE order_items DROP COLUMN IF EXISTS channel;


-- 3. cs_policies — 정책 텍스트에서 channel 참조 업데이트
UPDATE cs_policies
SET ai_instruction = REPLACE(
  ai_instruction,
  '동일 가격(같은 duration_days, channel 기준)',
  '동일 가격(같은 duration_days 기준)'
)
WHERE category = 'product_change'
  AND ai_instruction LIKE '%channel%';
