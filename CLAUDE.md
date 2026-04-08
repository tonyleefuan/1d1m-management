# 1D1M Management

> 1Day1Message 구독 서비스 운영 대시보드

## 개요
매일 카카오톡으로 메시지를 발송하는 구독 서비스의 백오피스.
주문 관리, 구독 관리, 메시지 관리, 발송 모니터링을 담당.

## 기술 스택
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **UI**: shadcn/ui (Radix UI) — havehad-management 디자인 시스템 기반
- **Database**: Supabase (PostgreSQL) — 도쿄 리전
- **Deploy**: Vercel
- **Auth**: 아이디/비번 + JWT 세션 (7일)

## 프로젝트 구조
```
src/
├── app/
│   ├── layout.tsx           # 루트 레이아웃
│   ├── page.tsx             # 메인 (대시보드)
│   ├── login/page.tsx       # 로그인
│   └── api/                 # API 라우트
│       ├── auth/            # 로그인/로그아웃
│       ├── orders/          # 주문 관리
│       ├── subscriptions/   # 구독 관리
│       ├── messages/        # 고정 메시지
│       ├── daily-messages/  # 실시간 메시지
│       ├── notices/         # 알림 템플릿
│       ├── products/        # 상품 관리
│       ├── sending/         # 발송 모니터링
│       ├── admin/           # 관리자 설정
│       ├── macro/           # 매크로 프로그램 전용 API
│       └── upload/          # 이미지 업로드
├── components/
│   ├── Dashboard.tsx        # 탭 라우터
│   ├── tabs/                # 탭별 컴포넌트
│   └── ui/                  # 공통 UI 컴포넌트
└── lib/
    ├── supabase.ts          # Supabase 클라이언트
    ├── auth.ts              # 인증 (JWT)
    ├── types.ts             # 타입 정의
    └── constants.ts         # 상수 (색상, 탭, 상태)
```

## 모듈 맵

| 탭 | 파일 | 설명 |
|---|------|------|
| 주문 관리 | `OrdersTab.tsx` | CSV 업로드, 주문 목록 |
| 구독 관리 | `SubscriptionsTab.tsx` | 구독 현황, 상태/PC/친구확인 관리 |
| 메시지 관리 | `MessagesTab.tsx` | 고정/실시간/알림 메시지 |
| 상품 관리 | `ProductsTab.tsx` | SKU, 가격 관리 |
| 발송 모니터링 | `SendingTab.tsx` | PC별 발송 현황 |
| 관리자 설정 | `AdminTab.tsx` | 사용자, PC 장치 관리 |

## 문서 체계
→ `docs/README.md` 참조 (문서 인덱스)

```
docs/
├── modules/      — 모듈별 상세 문서 (구현 내역, API/DB 명세)
├── policies/     — 횡단 비즈니스 정책 (모듈 공통 규칙)
├── registries/   — SSOT 레지스트리 (결정 기록, 마이그레이션 SQL)
├── specs/        — UI/통합 스펙
│   ├── ui/       — UI 스펙
│   └── integration/ — 시스템 통합 스펙
├── guides/       — 개발 가이드 (프롬프트, 스크립트)
│   ├── prompts/  — AI 메시지 생성 프롬프트 (SUB-*.md)
│   └── scripts/  — 유틸리티 스크립트
└── archive/      — 레거시 문서 (초기 설계, 온보딩용 — SSOT 아님)
```

### 코드 → 문서 매핑

| 코드 경로 패턴 | 변경 시 업데이트할 문서 |
|---------------|---------------------|
| `src/app/api/orders/**` | `docs/modules/CS_IMPLEMENTATION.md` (주문 연관 시) |
| `src/app/api/subscriptions/**` | `docs/modules/CS_IMPLEMENTATION.md`, `docs/registries/DECISIONS.md` |
| `src/app/api/sending/**` | `docs/specs/ui/sending-v2.md`, `docs/specs/ui/sending-failure-handling.md` |
| `src/app/api/daily-messages/**` | `docs/specs/integration/ai-daily-message-automation-design.md` |
| `src/app/api/ai/**` | `docs/specs/integration/ai-daily-message-automation-design.md` |
| `src/app/cs/**`, `src/app/api/cs/**` | `docs/modules/CS_IMPLEMENTATION.md`, `docs/specs/ui/cs.md` |
| `src/lib/day.ts` | `docs/registries/DECISIONS.md` |
| `src/lib/types.ts` | 관련 모듈 문서 전체 |
| `src/components/tabs/*Tab.tsx` | `docs/specs/ui/` 내 해당 스펙 |
| `src/components/ui/**` | 디자인 시스템 섹션 (CLAUDE.md) |
| `docs/registries/migrations/*.sql` | `docs/registries/DECISIONS.md` |
| `docs/guides/prompts/SUB-*.md` | `docs/specs/integration/ai-daily-message-automation-design.md` |
| `src/app/api/cron/**` | `docs/policies/CS_POLICY.md` (CS cron), `docs/registries/DECISIONS.md` |

### 주요 문서 바로가기

| 문서 | 경로 | 역할 |
|------|------|------|
| CS 구현 내역 | `docs/modules/CS_IMPLEMENTATION.md` | CS 시스템 전체 구현 상태 |
| CS 정책 | `docs/policies/CS_POLICY.md` | AI 자동응답/에스컬레이션 정책 |
| 비즈니스 결정 | `docs/registries/DECISIONS.md` | 아키텍처 결정 기록 (ADR) |
| 발송 v2 UI | `docs/specs/ui/sending-v2.md` | 구글시트 기반 발송 UI 스펙 |
| CS UI | `docs/specs/ui/cs.md` | 고객/관리자 CS 페이지 스펙 |
| AI 메시지 설계 | `docs/specs/integration/ai-daily-message-automation-design.md` | AI 일일 메시지 시스템 |

## UI 스펙
→ `docs/specs/ui/` 참조

## 디자인 시스템

> **프리뷰**: 관리자 설정 → 디자인 시스템 버튼 또는 `/design-preview`

### 필수 규칙 — 반드시 UI 컴포넌트 사용
| 용도 | 사용할 컴포넌트 | 금지 |
|------|---------------|------|
| 버튼 | `<Button>` | `<button className="...">` |
| 입력 | `<Input>`, `<Textarea>`, `<Select>` | `<input>`, `<textarea>`, `<select>` |
| 테이블 | `<Table>`, `<DataTable>` | `<table>` |
| 카드/패널 | `<Card>` | `<div className="bg-white border rounded">` |
| 뱃지/상태 | `<StatusBadge>`, `<Badge>` | 인라인 span |
| 빈 상태 | `<EmptyState>` | 텍스트만 표시 |
| 로딩 | `<SkeletonTable>`, `<Spinner>` | "로딩 중..." 텍스트 |
| 모달/다이얼로그 | `<FormDialog>`, `<ConfirmDialog>`, `<DetailModal>` | 직접 만든 모달 |
| 페이지 헤더 | `<PageHeader>` | `<h2>` 직접 사용 |
| 알림 | `useToast()` + `<Toast>` | `alert()`, 빈 catch |
| 필터 | `<FilterBar>` | 인라인 필터 UI |
| 통계 | `<MetricCard>`, `<StatGroup>` | 직접 만든 stat div |

### 브랜드 컬러
- **Primary**: `hsl(240 10% 6%)` — 검정 계열, 버튼/강조
- **Secondary**: `hsl(51 100% 50%)` — 1D1M 노랑, 포인트/포커스 링
- **Destructive**: `hsl(5 98% 63%)` — 삭제/에러

### 컬러 토큰 사용
```
✅ text-foreground, text-muted-foreground, bg-muted, border-border
❌ text-gray-500, bg-gray-50, border-gray-300 (하드코딩 금지)
```

### 에러 핸들링 패턴
```tsx
// 모든 fetch에 적용
const res = await fetch('/api/...')
if (!res.ok) throw new Error('실패')
// catch에서 showError() 호출 — 빈 catch {} 금지
```

## 코드 규칙
- havehad-management와 동일한 패턴 사용
- API: `getSession()` 으로 인증 확인 필수
- DB: `supabase` 서비스 클라이언트 사용 (서버 사이드만)
- 컴포넌트: `src/components/ui/`에 공통 컴포넌트 분리 (위 디자인 시스템 규칙 준수)
- 스타일: Tailwind CSS, cn() 유틸, 시맨틱 토큰 사용
- 타입: `src/lib/types.ts`에 정의

## 발송 시스템 (Day 계산)
- `current_day`: start_date 기준 경과일 (computeSubscription in lib/day.ts). 고객 대면용.
- `last_sent_day`: 실제 발송 완료된 마지막 Day. 구글 시트 import-results에서 업데이트.
- `pending_days`: current_day - last_sent_day 사이의 미발송 Day 목록. 대기열 생성 기준.
- 환불 이용일수는 current_day 사용 (last_sent_day 아닌).
- 매크로 연동 폐기 → 구글 시트 기반으로 전환 완료.
- **큐 유니크 제약**: `send_queues(subscription_id, day_number, send_date)` WHERE is_notice=false — 중복 큐 물리적 차단.
- **큐 정리 정책**: last_sent_day 변경, day_adjust, 자동 정지, 취소 시 pending+failed 큐 삭제 → 다음 generate에서 재생성.
- **미해결 실패 조회**: 발송 모니터링 "미해결 실패" 필터 — 재발송 성공/자동 정지/Day 변경으로 해결되지 않은 실패만 표시.

## 보안 필수사항
- Vercel Cron 인증: `!!envSecret && cronSecret === \`Bearer ${envSecret}\`` (Bearer undefined 우회 방지)
- admin API: 반드시 `session.role !== 'admin'` 체크 (getSession만으론 부족)
- CS 고객 API: 모든 데이터 쿼리에 `.eq('customer_id', session.customerId)` 필수
- AI 프롬프트: 고객 입력을 `<customer_message>` 태그로 격리
- IP rate limit: `x-real-ip` 헤더 우선 사용 (x-forwarded-for는 스푸핑 가능)
- CS/admin JWT 시크릿 분리: CS_AUTH_SECRET ≠ AUTH_SECRET
- 미들웨어: x-middleware-subrequest 헤더 차단 (CVE-2025-29927 defense-in-depth)

## 배포 주의
- Vercel Cron은 **GET**으로 호출함. POST만 있으면 405 에러.
- 로컬 dev 서버에서 에러 안 나도 Vercel 빌드(lint 포함)에서 에러 날 수 있음. import 누락 주의.
- package-lock.json도 반드시 커밋해야 Vercel에서 정확한 버전 설치.

## CS 고객 포털 (1d1m.space)
- 인증: 주문번호 + 전화번호 뒷4자리 → JWT 세션 (1시간)
- AI 자동응답: cron/cs-reply가 30분마다 pending 문의 처리 (Claude Sonnet)
- AI 응답 2회 초과 → 자동 에스컬레이션
- 환불 완료/거절 시 고객에게 자동 안내 댓글
- 운영 정책(cs_policies)은 AI 시스템 프롬프트에 매번 로드됨 → 수정 즉시 반영

## 개발 환경
- Homebrew 명령어: `PATH="/opt/homebrew/bin:$PATH"` 필요 (gh, npm, npx 등)
- Supabase 프로젝트 ID: tzrjnznqrwdehqypiorh
- Vercel 프로젝트: prj_mou96gJwBEQokSuakNLiRBAtFSom / team_Bt0o21aWiZXjBK7SQG3yiwbP

## 환경 변수
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase 서비스 키 (서버 전용)
- `AUTH_SECRET` — JWT 서명 시크릿
- `CS_AUTH_SECRET` — CS 포털 JWT 시크릿 (AUTH_SECRET과 분리)
- `CRON_SECRET` — Vercel Cron 인증 시크릿
- `ANTHROPIC_API_KEY` — Claude API 키
