-- ============================================================
-- 014: 상품별 AI 메시지 생성 프롬프트
-- ============================================================
-- 실시간(daily) 메시지 자동 생성 파이프라인에서 사용하는 상품별 프롬프트.
-- 각 상품(product)에 1:1로 매핑되며, 뉴스 검색 프롬프트와
-- 메시지 생성 프롬프트를 별도로 관리한다.
--
-- 사용처:
--   UPSERT: src/app/api/ai/prompts/route.ts (PUT, onConflict: product_id)
--   SELECT: src/app/api/ai/generate-daily/route.ts
--   SELECT: src/lib/ai/message-generator.ts
--   SELECT: src/app/api/ai/modify-message/route.ts
--   SELECT: src/app/api/ai/generate-with-source/route.ts

CREATE TABLE IF NOT EXISTS product_prompts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 대상 상품 (1:1 관계, UNIQUE 제약)
  product_id UUID NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,

  -- 뉴스/소스 검색용 프롬프트 (Claude search tool에 전달)
  search_prompt TEXT NOT NULL DEFAULT '',

  -- 메시지 본문 생성용 프롬프트 (Claude generation에 전달)
  generation_prompt TEXT NOT NULL DEFAULT '',

  -- 추가 지시 (generation_prompt에 "## 추가 지시" 섹션으로 합쳐짐)
  additional_prompt TEXT NOT NULL DEFAULT '',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 상품 ID로 빠른 조회 (UNIQUE 제약이 암시적 인덱스를 생성하지만 명시적으로도 선언)
-- product_id UNIQUE 제약이 자동으로 인덱스를 생성하므로 별도 인덱스 불필요
