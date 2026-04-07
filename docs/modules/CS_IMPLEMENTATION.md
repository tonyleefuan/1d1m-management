# CS 시스템 구현 내역

> 최종 업데이트: 2026-04-03

이 문서는 CS 시스템의 구현 상태, 변경 이력, 기술적 결정 사항을 기록합니다.
대화 유실 방지를 위해 모든 중요 변경은 여기에 기록합니다.

---

## 1. 파일 맵

| 영역 | 파일 | 설명 |
|------|------|------|
| **고객 인증** | `src/app/cs/page.tsx` | 로그인 페이지 (주문번호 + 뒷4자리) |
| **고객 인증 API** | `src/app/api/cs/auth/route.ts` | 로그인/로그아웃 API (IP rate limit + lockout) |
| **세션 관리** | `src/lib/cs-auth.ts` | JWT 세션 (1시간, `1d1m-cs-session` 쿠키) |
| **고객 대시보드** | `src/app/cs/dashboard/page.tsx` | 구독 현황 + 문의 목록 + 새 문의 작성 |
| **고객 문의 상세** | `src/app/cs/inquiry/[id]/page.tsx` | 문의 내용 + 답변 목록 + 추가 문의 폼 |
| **문의 API** | `src/app/api/cs/inquiries/route.ts` | GET: 목록 / POST: 새 문의 생성 |
| **문의 상세 API** | `src/app/api/cs/inquiries/[id]/route.ts` | GET: 상세 조회 |
| **답변 API** | `src/app/api/cs/inquiries/[id]/reply/route.ts` | POST: 고객 추가 문의 |
| **구독 API** | `src/app/api/cs/subscriptions/route.ts` | GET: 고객 구독 목록 |
| **AI 엔진** | `src/lib/ai/cs-engine.ts` | AI 자동응답 (Claude tool calling) |
| **Cron** | `src/app/api/cron/cs-reply/route.ts` | 10분 주기 자동 처리 (신규 + 후속) |
| **관리자 CS탭** | `src/components/tabs/CSTab.tsx` | 확인필요 / AI응대 / 환불요청 / 운영정책 |
| **관리자 문의 API** | `src/app/api/admin/cs/inquiries/route.ts` | 관리자용 문의 목록/상세/답변 |
| **관리자 환불 API** | `src/app/api/admin/cs/refunds/[id]/route.ts` | 환불 승인/완료/거절 |
| **관리자 정책 API** | `src/app/api/admin/cs/policies/route.ts` | 운영 정책 CRUD |
| **환불 계산** | `src/lib/refund.ts` | 환불 금액 자동 계산 로직 |

---

## 2. 핵심 설계 결정

### 2-1. 고객에게 AI임을 노출하지 않음
- 고객 UI에서 AI/관리자/시스템 답변 모두 "담당자"로 표시
- `author_type` 구분은 내부 로직용 (에스컬레이션 카운트, 답변 횟수 등)

### 2-2. 문의 제목 필드 제거 (2026-04-03)
- 고객 입력 폼에서 제목 필드 삭제
- DB 컬럼(`title`)은 유지 — `NOT NULL` 제약조건 때문
- API에서 카테고리 라벨로 자동 생성: `${CS_CATEGORY_LABELS[category]} 문의`
- AI 엔진에서도 제목 미사용 (user message에서 제거)
- 관리자 CS탭에서는 기존 title 그대로 표시 (하위 호환)

### 2-3. author_type에 system 추가 (2026-04-03)
- 에스컬레이션 안내 메시지를 `system` 타입으로 저장
- AI 답변 횟수 카운트에서 제외 (2회 초과 시 자동 에스컬레이션 방지)
- DB CHECK 제약조건 변경됨: `('ai','admin','customer','system')`

### 2-4. Cron 통합 처리 (2026-04-03)
- 기존: 섹션1(신규) + 섹션2(후속) 별도 쿼리 → 중복 처리/FIFO 깨짐 위험
- 변경: 단일 `pending` 쿼리 + `hasAiReply`로 신규/후속 구분
- FIFO 순서 보장: `order('created_at', { ascending: true })`
- 낙관적 잠금: `status=pending` + `updated_at` 일치 시에만 `processing`으로 변경

### 2-5. 처리 중 고객 답글 감지 (2026-04-03)
- AI 처리 후 `ai_answered` 상태 저장
- 직후 `cs_replies`에서 `created_at > inquiry.updated_at`인 고객 답글 확인
- 있으면 `pending`으로 되돌림 → 다음 Cron에서 재처리

### 2-6. AI 응답 처리 방식 (Cron + 폴링)
- 문의 등록 → pending 상태로 즉시 반환 → 상세 페이지로 이동
- 상세 페이지에서 10초 자동 폴링 (pending/processing 상태일 때)
- Cron(`/api/cron/cs-reply`)이 주기적으로 처리
- 대기 안내: "답변을 준비하고 있습니다. 평균 1시간 이내로 답변 드립니다."
- 에스컬레이션 시: "관리자 확인이 필요한 사안입니다. 평균 영업일 1일 이내에 답변 드리겠습니다."
- (즉시 동기 응답은 Vercel 타임아웃 리스크로 채택하지 않음)

### 2-7. 쿠키 경로
- `path: '/'` (전체 경로)
- 이전에 `path: '/cs'`로 설정 → `/api/cs/*` 엔드포인트에 쿠키 미전송 문제 발생
- 2026-04-03 수정 완료

### 2-8. 인증 보안
- Rate limit: IP 당 15분에 5회 시도
- Lockout: 5회 초과 시 지수 백오프 (15분 → 30분 → 1시간...)
- 주문번호 + 전화번호 뒷4자리로 인증
- 성공 시 JWT 세션 발급 (1시간 만료)

---

## 3. Cron 처리 흐름 (`/api/cron/cs-reply`)

```
1. stuck 복구 (15분 이상 processing → pending)
2. pending 문의 통합 조회 (FIFO, BATCH_SIZE=10)
3. 각 문의별:
   a. 낙관적 잠금 (pending → processing)
   b. hasAiReply 판단
      - false → handleCsInquiry (신규)
      - true → handleCsReply (후속, 대화 이력 포함)
   c. AI 답변 저장 (author_type: 'ai')
   d. 에스컬레이션 시 system 안내 메시지 추가
   e. 상태 업데이트 (ai_answered 또는 escalated)
   f. 처리 중 고객 답글 감지 → pending 복구
4. Rate limit 레코드 정리 (24시간 이상)
5. 7일 지난 종료 문의 자동 삭제
6. Cron 로그 저장 (cs_cron_logs)
7. 에러 시 Slack 알림
```

---

## 4. AI 도구 목록

| 도구 | 용도 | 에스컬레이션 |
|------|------|-------------|
| `query_subscription` | 구독 현황 조회 | N |
| `query_default_device` | 기본 PC 번호 조회 | N |
| `pause_subscription` | 일시정지 처리 | N |
| `resume_subscription` | 재개 처리 | N |
| `change_product` | 상품 변경 (동일 가격만) | N |
| `search_product` | 상품명 검색 | N |
| `request_refund` | 환불 요청 접수 | Y (자동) |
| `escalate_to_admin` | 수동 에스컬레이션 | Y |

- AI 답변 2회 초과 시 자동 에스컬레이션 (도구 호출 없이)
- `request_refund` 호출 시에도 에스컬레이션 (관리자 승인 필요)

---

## 5. 환불 처리 플로우

```
고객 문의 → AI 정책 안내 → 결제 방법 확인 → (계좌 정보 수집) →
request_refund 도구 호출 → cs_refund_requests 저장 →
관리자 CS탭 > 환불 요청 확인 → 승인 → 환불 완료 (구독 자동 취소)
```

- 전액환불: 결제 후 3일 이내
- 부분환불: 결제금액 - 이용일수금액 - 위약금(30%)
- 계좌 정보 필요: 계좌이체 또는 카드 결제 후 30일 초과

---

## 6. 변경 이력

| 날짜 | 변경 내용 |
|------|----------|
| 2026-04-03 | 문의 제목 필드 제거 (고객 폼에서 삭제, API 자동 생성) |
| 2026-04-03 | 대기 안내 문구 변경: "평균 1시간 이내로 답변 드립니다" |
| 2026-04-03 | Critical Fix A: 처리 중 고객 답글 감지 → pending 복구 |
| 2026-04-03 | Critical Fix B: 에스컬레이션 안내 `system` 타입으로 변경 |
| 2026-04-03 | Critical Fix C: Cron 통합 처리 (중복/FIFO 문제 해결) |
| 2026-04-03 | 쿠키 경로 수정: `/cs` → `/` |
| 2026-04-03 | 에스컬레이션 안내: "평균 영업일 1일 이내에 답변 드리겠습니다" |
| 2026-04-03 | 대기 안내: "평균 1시간 이내로 답변 드립니다" |
| 2026-04-03 | 과거 주문 데이터 CSV 임포트 (CS 로그인용) |

---

## 7. 미해결 / TODO

- [ ] Vercel Cron 설정 (`/api/cron/cs-reply`, 10분 주기)
- [ ] Slack Webhook URL 설정 (`SLACK_WEBHOOK_URL` 환경변수)
- [ ] CS 접속 URL 단축 링크 생성 (bitly 등)
- [ ] 관리자 CS탭에서 title 대신 content 미리보기 표시 검토
- [ ] `cs_replies.author_type` 타입 정의 업데이트 (`types.ts`의 CSReply에 'system' 추가)
