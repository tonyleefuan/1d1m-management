# 발송 모니터링 v2 UI 스펙

## 개요
매크로 프로그램 연동을 제거하고, 구글시트 기반 수동 발송 워크플로우로 전환.

## 화면 구성

### 1. 발송 설정 (Card)
- 발송 날짜: DatePicker (디폴트: send_start_time 기준 오늘/내일 자동)
- 시작 시각: TimeInput (기존 유지)
- 메시지 간격(초): NumberInput (기존 유지)
- 파일 간격(초): NumberInput (기존 유지)
- 버튼: [저장] [전체 대기열 삭제] [대기열 생성]

### 2. 구글시트 연동 (Card)
- 버튼: [📤 구글시트 내보내기] [📥 결과 가져오기]
- 정보: 마지막 내보내기 시각, 마지막 결과 수거 시각
- 내보내기 시 로딩 표시 (LoadingButton)

### 3. 대기열 상태 Banner
- "대기열: 생성 완료 (N건)" 또는 "대기열: 없음"
- [재생성] 버튼

### 4. PC별 요약 카드 Grid (5열)
- PC 전화번호
- 대기 N건
- 성공 N건 (N%)
- 실패 N건 (N%)
- 미처리 N건
- 진행률 바

### 5. PC별 탭 Navigation
- 전체 (N) + PC별 탭
- 탭 클릭 → 테이블 필터

### 6. 필터 바
- 상태 필터: 전체 / 대기 / 성공 / 미해결 실패
  - "미해결 실패" 선택 시: 날짜 무관, 아직 재발송 성공하지 않은 failed 큐만 조회
  - 해결 조건: 같은 subscription_id+day_number에 sent 큐 존재, 또는 자동 정지/Day 변경으로 큐 삭제
- 요약 뱃지: 전체 N, 대기 N, 성공 N, 실패 N

### 7. 대기열 테이블
| 열 | 데이터 | 비고 |
|----|--------|------|
| 예약시간 | 서버 계산 (HH:MM:SS) | |
| PC | device phone_number | PC 선택 시 숨김 |
| 카톡이름 | kakao_friend_name | |
| 상품 | product sku_code | |
| Day | day_number | |
| 순서 | message_seq (X/Y) | |
| 타입 | 텍스트/파일 | image_path 유무 |
| 내용 | 60자 미리보기 | |
| 상태 | StatusBadge | 대기/성공/실패/미처리 |
| 처리시간 | sent_at (HH:MM:SS) | 없으면 "-" |

## 데이터 매핑

| UI 요소 | DB 테이블 | 필드 |
|---------|----------|------|
| 발송 설정 | app_settings | send_start_time, send_message_delay, send_file_delay |
| 대기열 | send_queues | 전체 필드, UNIQUE(subscription_id, day_number, send_date) WHERE is_notice=false |
| PC 목록 | send_devices | id, phone_number, color, is_active |
| 구독 정보 | subscriptions | last_sent_day, failure_type, recovery_mode |

## API 라우트

| 메서드 | 경로 | 용도 |
|--------|------|------|
| GET | /api/sending/settings | 설정 조회 (기존) |
| PATCH | /api/sending/settings | 설정 저장 (기존) |
| POST | /api/sending/generate | 대기열 생성 (기존) |
| POST | /api/sending/clear | 대기열 삭제 (기존) |
| GET | /api/sending/queue | 대기열 조회 (기존) |
| POST | /api/sending/export-sheet | 구글시트 내보내기 (신규) |
| POST | /api/sending/import-results | 결과 가져오기 (신규) |

## 컴포넌트 매핑

| UI 요소 | 컴포넌트 |
|---------|---------|
| 페이지 제목 | PageHeader |
| 설정/연동 영역 | Card |
| 날짜 선택 | Input type="date" |
| 액션 버튼 | Button + LoadingButton |
| 확인 다이얼로그 | ConfirmDialog |
| PC 요약 카드 | 기존 커스텀 카드 |
| 대기열 테이블 | DataTable |
| 상태 표시 | StatusBadge |
| 빈 상태 | EmptyState |
| 알림 | useToast() |

## 삭제 대상
- /api/macro/queue, /api/macro/heartbeat, /api/macro/report
- SendingTab의 30초 자동 새로고침 로직
- 매크로 heartbeat 관련 UI (sending_progress 읽기)

## 변경 없음 (기존 유지)
- 대기열 생성 로직 (queue-generator.ts)
- 발송 설정 API
- PC별 요약 카드 레이아웃 (미처리 상태만 추가)
- 대기열 테이블 구조 (상태값만 추가)
