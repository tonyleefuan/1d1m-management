# docs/ 문서 인덱스

> 1D1M Management 프로젝트 문서 체계

## 폴더 구조

| 폴더 | 역할 | SSOT 여부 |
|------|------|-----------|
| `modules/` | 모듈별 상세 문서 (구현 내역, API/DB 명세) | O |
| `policies/` | 횡단 비즈니스 정책 (모듈 공통 규칙) | O |
| `registries/` | SSOT 레지스트리 (결정 기록, 마이그레이션) | O |
| `specs/` | UI/통합 스펙 | O |
| `guides/` | 개발 가이드, 프롬프트, 스크립트 | O |
| `archive/` | 레거시 문서 (초기 설계, 온보딩용) | X |

---

## modules/ -- 모듈별 상세 문서

| 파일 | 설명 | 상태 |
|------|------|------|
| [CS_IMPLEMENTATION.md](modules/CS_IMPLEMENTATION.md) | CS 시스템 구현 내역 -- API, AI 엔진, 변경 이력 | 활성 |

## policies/ -- 횡단 비즈니스 정책

| 파일 | 설명 | 상태 |
|------|------|------|
| [CS_POLICY.md](policies/CS_POLICY.md) | CS 정책 -- AI 자동응답, 에스컬레이션, 환불 계산 | 활성 |

## registries/ -- SSOT 레지스트리

| 파일 | 설명 | 상태 |
|------|------|------|
| [DECISIONS.md](registries/DECISIONS.md) | 비즈니스/아키텍처 결정 기록 (ADR) | 활성 |
| `migrations/*.sql` | DB 마이그레이션 SQL 이력 (007~016) | 활성 |

## specs/ -- UI/통합 스펙

### specs/ui/ -- UI 스펙

| 파일 | 설명 | 상태 |
|------|------|------|
| [cs.md](specs/ui/cs.md) | CS 페이지 UI 스펙 -- 고객/관리자 | 활성 |
| [sending-v2.md](specs/ui/sending-v2.md) | 발송 모니터링 v2 UI -- 구글시트 기반 | 활성 |
| [sending-failure-handling.md](specs/ui/sending-failure-handling.md) | 발송 실패 처리 UX 개선 | 활성 |

### specs/integration/ -- 시스템 통합 스펙

| 파일 | 설명 | 상태 |
|------|------|------|
| [ai-daily-message-automation-design.md](specs/integration/ai-daily-message-automation-design.md) | AI 일일 메시지 자동 생성 시스템 설계 | 활성 |

## guides/ -- 개발 가이드

### guides/prompts/ -- AI 메시지 프롬프트

| 파일 | 설명 |
|------|------|
| SUB-45-global-english-news.md | 글로벌 뉴스 영어 학습 프롬프트 |
| SUB-46-economy-news.md | 실전 경제 뉴스 프롬프트 |
| SUB-60-social-issues-terms.md | 사회 이슈 용어 풀이 프롬프트 |
| SUB-63-two-perspectives.md | 두 개의 관점 프롬프트 |
| SUB-64-realestate-qa.md | 부동산 Q&A 프롬프트 |
| SUB-76-global-investment-news.md | 글로벌 투자 인사이트 프롬프트 |
| SUB-95-realtime-search-hot8.md | 실시간 검색어 HOT 8 프롬프트 |

### guides/scripts/ -- 유틸리티 스크립트

| 파일 | 설명 |
|------|------|
| sync-contacts.gs | Google Apps Script -- 연락처 동기화 |

## archive/ -- 레거시 문서

> 이 폴더의 문서는 SSOT가 아닙니다. 과거 설계 기록 및 온보딩 참고용입니다.

| 파일 | 설명 | 시기 |
|------|------|------|
| [macro-integration-v1.md](archive/macro-integration-v1.md) | 매크로 연동 시스템 v1 아카이브 | 2026-03 ~ 04 |
| [day-system-macro-design.md](archive/day-system-macro-design.md) | Day 시스템 + 매크로 설계 (폐기) | 2026-03-22 |
| [plan-ai-daily-message-automation.md](archive/plan-ai-daily-message-automation.md) | AI 메시지 자동화 구현 계획 | 2026-03-22 |
| [plan-day-system-server-core.md](archive/plan-day-system-server-core.md) | Day 시스템 서버 구현 계획 | 2026-03-22 |
| [plan-pc-color-auto-assign.md](archive/plan-pc-color-auto-assign.md) | PC 컬러 + 자동 배정 구현 계획 | 2026-03-22 |

---

## 문서 관리 규칙

1. **SSOT 원칙**: `archive/` 외의 문서는 현재 시스템의 진실된 소스(Single Source of Truth)입니다.
2. **코드 변경 시 문서 업데이트**: `CLAUDE.md`의 "코드 -> 문서 매핑" 테이블을 참조하여 관련 문서를 함께 업데이트합니다.
3. **새 문서 생성 시**:
   - 이 README.md 인덱스에 추가
   - 적절한 폴더에 배치
   - CLAUDE.md 매핑 테이블에 관련 코드 경로 추가
4. **문서 폐기 시**: `archive/`로 이동하고 상단에 폐기 사유와 날짜를 명시합니다.
5. **마이그레이션 SQL**: `registries/migrations/`에 순번 파일명으로 보관합니다.
