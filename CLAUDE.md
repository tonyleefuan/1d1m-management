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

## DB 스키마
→ `docs/SCHEMA_REGISTRY.md` 참조 (SSOT)

## UI 스펙
→ `docs/ui-specs/dashboard.md` 참조

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
