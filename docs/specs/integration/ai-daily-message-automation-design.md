# AI 일일 메시지 자동 생성 시스템 설계

## 개요

1D1M 실시간 메시지(daily_messages) 7개 상품의 메시지를 AI가 자동으로 생성하고, 운영자가 확인/수정/승인하는 시스템.

**현재**: 토니가 매일 수동으로 뉴스 리서치 → GPT 프롬프트 → 복붙 → URL 축약 → 대시보드 입력
**목표**: 매일 오후 6시 자동 생성 → 토니는 확인/수정/승인만

## 대상 상품 (7개)

| SKU | 상품명 | 뉴스 소스 | 기사 수 |
|-----|--------|----------|---------|
| SUB-45 | 글로벌 뉴스 영어 학습 | 해외 영문 뉴스 | 5개 |
| SUB-46 | 실전 경제 뉴스 | 한국 경제 뉴스 | 1개 딥다이브 |
| SUB-60 | 사회 이슈 용어 풀이 | 한국 사회/정치 뉴스 | 1개 + 용어 |
| SUB-63 | 두 개의 관점 | 한국 사회 뉴스 (논쟁적) | 1개 양면 분석 |
| SUB-64 | 부동산 Q&A | 한국 부동산/재테크 뉴스 | 1개 Q&A |
| SUB-76 | 글로벌 투자 인사이트 | 해외 경제/금융 뉴스 | 1개 + 종목 |
| SUB-95 | 실시간 검색어 HOT 8 | 네이버/가제트AI 실검 | 8개 키워드 |

## 아키텍처

```
[Vercel Cron 매일 18:00 KST]
        ↓
POST /api/ai/generate-daily?date=내일
        ↓
┌─────────────────────────────────────┐
│  7개 상품 병렬 처리 (Promise.allSettled)  │
│                                     │
│  상품별 파이프라인:                    │
│  1. search_prompt 로드 (DB)          │
│  2. 히스토리 조회 (최근 7일)           │
│  3. Claude API → 뉴스 검색/선정       │
│  4. generation_prompt 로드 (DB)      │
│  5. Claude API → 메시지 생성          │
│  6. URL 축약 (TinyURL, 인라인)        │
│  7. DB 저장 (status='draft')         │
└─────────────────────────────────────┘
        ↓
대시보드에서 토니가 확인 → 수정/승인
```

## DB 변경

### 1. daily_messages 테이블 — status 컬럼 추가

```sql
ALTER TABLE daily_messages ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';
```

- `draft`: AI가 생성한 초안 (발송 대상 아님)
- `approved`: 승인됨 (발송 대상)
- 기존 메시지는 모두 `approved`로 유지

### 2. product_prompts 테이블 — 신규 생성

```sql
CREATE TABLE product_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  search_prompt TEXT NOT NULL,
  generation_prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id)
);
```

- `search_prompt`: 뉴스 검색/선정 지침 (어디서, 어떻게, 어떤 것을 찾을지)
- `generation_prompt`: 메시지 작성 지침 (포맷, 톤, 규칙 등)
- 상품당 1개 (UNIQUE 제약)

### 3. 발송 큐 생성 쿼리 수정

`/api/sending/generate`에서 daily_messages 조회 시:
```sql
WHERE status = 'approved'
```
조건 추가.

## 인증

### Cron 엔드포인트 이중 인증

`/api/ai/generate-daily`는 두 가지 경로로 호출됨:
- **Vercel Cron**: `Authorization: Bearer <CRON_SECRET>` 헤더
- **대시보드 버튼**: `getSession()` 세션 인증

```typescript
// 인증 로직
const cronSecret = request.headers.get('authorization')?.replace('Bearer ', '');
const isValidCron = cronSecret === process.env.CRON_SECRET;
const session = !isValidCron ? await getSession() : null;
if (!isValidCron && !session) return unauthorized();
```

환경변수 `CRON_SECRET` 추가 필요 (Vercel 대시보드에서 설정).

### 기타 API 인증

- `/api/ai/modify-message`: `getSession()` 필수
- `/api/ai/prompts`: `getSession()` 필수
- `/api/daily-messages/status`: `getSession()` 필수

## API 엔드포인트

### POST /api/ai/generate-daily

메시지 자동 생성 트리거.

**인증:** CRON_SECRET 또는 getSession()

**파라미터:**
- `date` (optional): 대상 날짜, 기본값 내일 (KST)
- `sku` (optional): 특정 상품만 생성, 기본값 전체 7개
- `article_url` (optional): 기사 URL 직접 지정 시

**처리 흐름 (상품 1개당):**

1. `product_prompts`에서 해당 상품의 search_prompt, generation_prompt 로드
2. `daily_messages`에서 최근 7일 메시지 조회 (중복 방지용 컨텍스트)
3. Claude API 호출 (Sonnet) — search_prompt로 뉴스 검색/선정 (web_search 도구 사용)
   - article_url이 제공된 경우 검색 건너뛰고 해당 기사 사용
4. Claude API 호출 (Sonnet) — generation_prompt + 선정된 뉴스 + 히스토리로 메시지 생성
5. 메시지 내 URL을 TinyURL API로 인라인 축약 (실패 시 원본 URL 유지)
6. `daily_messages`에 `status='draft'`로 UPSERT
   - conflict key: `(product_id, send_date)`
   - 이미 `approved`인 메시지는 덮어쓰지 않음

**응답:**
```json
{
  "ok": true,
  "results": [
    { "sku": "SUB-45", "status": "success", "message_id": "..." },
    { "sku": "SUB-46", "status": "success", "message_id": "..." },
    { "sku": "SUB-60", "status": "error", "error": "뉴스 검색 실패" }
  ]
}
```

### POST /api/ai/modify-message

AI로 메시지 수정.

**파라미터:**
- `message_id`: 대상 메시지
- `instruction`: 수정 지시 (예: "좀 더 짧게", "3번 뉴스를 다른 걸로 교체")

**처리:** Claude API에 기존 메시지 + 지시를 보내고 수정본 반환.

### PATCH /api/daily-messages/status

메시지 상태 변경.

**파라미터:**
- `id`: 메시지 ID
- `status`: `draft` | `approved`

### GET/PUT /api/ai/prompts

프롬프트 조회/수정.

**GET**: 상품별 search_prompt, generation_prompt 목록 반환
**PUT**: 특정 상품의 프롬프트 업데이트

## Vercel Cron 설정

`vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/ai/generate-daily",
      "schedule": "0 9 * * *"
    }
  ]
}
```
(UTC 09:00 = KST 18:00)

## 대시보드 UI 변경

### 오늘 메시지 탭 (TodayMessagesPanel) 확장

**상단 액션 바:**
- "내일 메시지 자동 생성" 버튼 → POST /api/ai/generate-daily 호출
- 생성 중 스피너, 완료 시 그리드 자동 갱신

**그리드 셀:**
- status 뱃지 추가: draft(노란색 "초안") / approved(초록색 "승인됨")

**메시지 편집 모달 확장:**
- 기존: 텍스트 편집 + 저장
- 추가:
  - "승인" 버튼 (draft → approved)
  - "재생성" 버튼 (같은 상품/날짜로 AI 재생성)
  - "기사 URL로 재생성" — URL 입력 → 해당 기사 기반으로 재생성
  - "AI 수정 요청" — 채팅 입력창에 지시 → Claude API로 수정본 생성

### 관리자 설정 탭 — 프롬프트 관리 추가

- 상품 목록 (좌측 사이드바)
- 선택 시 search_prompt, generation_prompt 편집 가능
- 저장 버튼

## Claude API 사양

### 모델 및 도구

- **모델**: `claude-sonnet-4-20250514` (Sonnet 이상)
- **웹 검색**: Anthropic Messages API의 `web_search` 도구 사용
  ```typescript
  tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }]
  ```
- **max_tokens**: 4096 (메시지 생성용)

### 2단계 호출 구조

1. **검색 호출**: system=search_prompt, tools=[web_search], max_uses=5
   - 응답에서 검색 결과와 선정된 기사 URL/내용 추출
2. **생성 호출**: system=generation_prompt, user=검색결과+히스토리
   - tools 없음 (텍스트 생성만)

### 동시성 관리

7개 상품을 **2~3개씩 배치**로 처리하여 API rate limit 회피:
```typescript
// 3개씩 배치 처리 (총 3라운드)
for (const batch of chunks(products, 3)) {
  await Promise.allSettled(batch.map(p => generateForProduct(p)));
}
```
- 상품당 약 30~60초 소요 (검색+생성+축약)
- 3라운드 × 60초 = 약 180초 (300초 제한 내 충분)

## 외부 의존성

| 서비스 | 용도 | API 키 | 비고 |
|--------|------|--------|------|
| Claude API (Sonnet) | 뉴스 검색 + 메시지 생성 | ANTHROPIC_API_KEY | .env.local 추가 완료 |
| TinyURL API | URL 축약 | 키 불필요 | 실패 시 원본 URL 유지 |

## 환경변수

```
ANTHROPIC_API_KEY=sk-ant-...     # Claude API (추가 완료)
CRON_SECRET=<random-string>      # Vercel Cron 인증용 (추가 필요)
```

Vercel 대시보드에도 동일하게 추가 필요.

## 배포 순서

DB 마이그레이션과 코드 배포의 순서가 중요:

1. **먼저** Supabase에서 `ALTER TABLE daily_messages ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'` 실행
2. **먼저** Supabase에서 `CREATE TABLE product_prompts (...)` 실행 + 시드 데이터 삽입
3. **그 다음** 코드 배포 (Vercel)

발송 쿼리에서 status 조건은 `COALESCE(status, 'approved') = 'approved'`로 안전하게 처리하여 마이그레이션 타이밍 이슈 방지.

## 에러 처리

- 개별 상품 생성 실패 시 나머지 계속 진행 (Promise.allSettled)
- 실패한 상품은 대시보드에서 "생성 실패" 표시 → 수동 재시도 가능
- Claude API 타임아웃: 상품당 90초 제한
- Vercel Cron 전체 타임아웃: 300초 (Pro 플랜), 배치 처리로 약 180초 예상
- TinyURL 실패 시: 원본 URL 유지 (축약 실패가 전체를 막지 않음)
- UPSERT 충돌: approved 상태 메시지는 덮어쓰지 않음 (WHERE status != 'approved')
- Cron 중복 실행: UPSERT + approved 보호로 안전

## 파일 구조 (신규/수정)

```
src/
├── app/api/
│   ├── ai/
│   │   ├── generate-daily/route.ts    # 메시지 자동 생성
│   │   ├── modify-message/route.ts    # AI 수정
│   │   └── prompts/route.ts           # 프롬프트 CRUD
│   ├── daily-messages/
│   │   └── status/route.ts            # 상태 변경 (신규)
│   └── sending/generate/route.ts      # 수정: status='approved' 조건 추가
├── components/tabs/
│   └── MessagesTab.tsx                # 수정: 상단 버튼, 뱃지, 모달 확장
├── lib/
│   ├── ai/
│   │   ├── claude.ts                  # Claude API 클라이언트
│   │   ├── news-search.ts             # 뉴스 검색 파이프라인
│   │   ├── message-generator.ts       # 메시지 생성 파이프라인
│   │   └── url-shortener.ts           # TinyURL 축약
│   └── types.ts                       # 타입 추가
└── vercel.json                        # Cron 설정
```

## 프롬프트 초기 데이터

7개 상품의 search_prompt, generation_prompt는 `docs/guides/prompts/SUB-*.md` 파일에서 추출하여 product_prompts 테이블에 시드.
