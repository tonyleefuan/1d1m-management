# Day 시스템 재설계 + 매크로 프로그램 설계

> 2026-03-22 — 1D1M 발송 시스템 전면 재설계

## 1. 개요

구글 시트 기반 매크로 발송 체계를 서버 API 기반으로 전환하고,
Day 계산 방식을 크론 기반 증감에서 날짜 기반 자동 계산으로 변경한다.

### 변경 범위
- Day 계산 로직 재설계
- 매크로 프로그램 신규 개발 (Python)
- 매크로 ↔ 서버 API 신규 개발
- 구독 관리 UI 변경 (상태 표시, 발송상태, 실패 해제)
- 발송 모니터링 UI 변경 (대기열 관리, 실시간 진행률)
- 메시지 관리 UI 개선 (이미지 미리보기)
- 슬랙 알림 연동

---

## 2. 하루 타임라인

```
22:00  PC 자동 재부팅 (Windows 작업 스케줄러)
       → 카카오톡 자동 로그인 (시작프로그램)

02:00  서버 크론 — 대기열 생성 (PC별 순차)
       → 생성 완료 후 슬랙 요약 알림

04:00  매크로 실행 (Windows 작업 스케줄러)
       → 서버에서 대기열 수신
       → 이미지 다운로드 (신규/변경분만)
       → 카카오톡 발송 시작
       → 1분마다 heartbeat (진행 숫자)
       → ~10:00 발송 완료
       → 상세 결과 한번에 보고
       → 슬랙 완료 요약 알림
```

---

## 3. Day 계산 시스템

### 3.1 핵심 공식

```
current_day = (오늘 - start_date + 1) - paused_days
```

- Day는 DB에 저장하지 않고 매번 계산한다
- `start_date` = 주문일 + 1 (주문 다음날 시작)
- `paused_days` = 총 정지 일수

### 3.2 DB 칼럼 (subscriptions 테이블)

| 칼럼 | 타입 | 설명 |
|------|------|------|
| `start_date` | date | 시작일 (주문일 + 1) |
| `duration_days` | int | 구독 기간 (365 등) |
| `last_sent_day` | int | 마지막 성공 발송 Day (초기값 0) |
| `paused_days` | int | 총 정지 일수 (초기값 0) |
| `paused_at` | timestamp | 정지 시작일 (null이면 정지 아님) |
| `resume_date` | date | 재개 예정일 (null이면 무기한) |
| `is_cancelled` | boolean | 취소 여부 |
| `failure_type` | text | null / friend_not_found / device_error / not_sent / other |
| `failure_date` | date | 실패 발생일 |
| `recovery_mode` | text | null / bulk / sequential |

### 3.3 기존 칼럼 제거/변경

- `day` → 제거 (계산값으로 대체)
- `status` → 제거 (계산값으로 대체)
- `last_send_failure` → `failure_type`으로 대체

### 3.4 상태 판단 (계산값, 수정 불가)

```
if is_cancelled                          → 취소
if paused_at != null                     → 정지
if current_day < 1                       → 대기
if last_sent_day >= duration_days        → 완료
else                                     → 활성
```

### 3.5 end_date 계산 (저장하지 않음)

```
밀린일수 = max(0, current_day - last_sent_day - 1)
end_date = start_date + duration_days - 1 + paused_days + 밀린일수
```

### 3.6 대기열 생성 시 보낼 Day 결정

```
pending_days = last_sent_day + 1 ~ current_day
pending_count = len(pending_days)

recovery_mode = null:
  pending_count = 1   → 정상 발송
  pending_count = 2   → 1일 자동재시도: 밀린 것 + 오늘 같이 발송
  pending_count >= 3  → 2일 이상 연속 미발송: 대기열 생성 안 함, 관리자 확인 필요로 전환

recovery_mode = 'bulk':
  pending_days 전부 발송 (밀린 것 + 오늘 전부)

recovery_mode = 'sequential':
  last_sent_day + 1 만 발송 (하루씩)
```

### 3.7 recovery_mode 초기화

```
bulk       → 발송 성공 후 null로 초기화
sequential → last_sent_day >= current_day - 1 이면 null로 초기화 (따라잡음)
```

---

## 4. 실패 처리

### 4.1 실패 유형

| 유형 | 원인 | 판단 주체 | 처리 |
|------|------|----------|------|
| `friend_not_found` | 친구 못 찾음 | 매크로 | 관리자 해제까지 대기 |
| `device_error` | 카톡 먹통/PC 문제 | 매크로 | 다음 날 자동 재시도 |
| `not_sent` | 매크로 미실행 | 서버 | 다음 날 자동 재시도 |
| `other` | 기타 오류 | 매크로 | 관리자 해제까지 대기 |

### 4.2 자동 재시도 규칙

- `device_error`, `not_sent`: 다음 날 자동 재시도
- 1일 미발송: Day 진행 + 밀린 메시지 같이 발송 (pending_count = 2)
- 2일 연속 미발송: 관리자 확인 필요로 전환 (pending_count >= 3)

### 4.2.1 2일 연속 실패 전환 로직

대기열 생성 크론(02:00)이 판단:
```
pending_count >= 3 이고 failure_type이 device_error 또는 not_sent
→ failure_type을 'not_sent'로 유지하되
→ 대기열에서 제외 (관리자 확인 필요로 표시)
```

### 4.2.2 `not_sent` 감지 로직

대기열 생성 크론(02:00)이 판단:
```
어제 send_queues에 해당 구독의 항목이 있는데
status가 여전히 'pending' (보고 안 옴)
→ failure_type = 'not_sent' 설정
→ 해당 send_queues 항목 status = 'failed' 처리
```

### 4.3 실패 단위

- **구독 단위**: 한 구독의 메시지 중 1건이라도 실패하면 해당 구독 전체 실패
- **사람 단위 실패 전파**: 친구 못 찾으면 그 사람의 해당 PC 모든 구독 실패 처리
  - 저장은 구독별, 해제도 구독별

### 4.4 실패 해제 팝업

```
┌───────────────────────────────────┐
│  조종희 — SUB-65 (Day 37~38)      │
│  사유: 친구 못 찾음                │
│                                   │
│  ✅ 직접 보냈어요                  │
│     Day 39부터 정상 진행           │
│                                   │
│  🔄 밀린 것 몰아서 보내기          │
│     내일 Day37+38+39 한번에 발송   │
│                                   │
│  ▶️ 밀린 것부터 하루씩 보내기       │
│     내일 Day37, 모레 Day38, ...    │
│     종료일 연장                    │
└───────────────────────────────────┘
```

| 선택 | last_sent_day | recovery_mode | end_date |
|------|--------------|---------------|----------|
| 직접 보냈어요 | current_day - 1 | null | 변동 없음 |
| 몰아서 보내기 | 유지 | bulk | 변동 없음 |
| 하루씩 순서대로 | 유지 | sequential | 밀린 만큼 연장 |

---

## 5. 정지/취소

### 5.1 정지 (pause)

- `paused_at`에 시작일 저장
- `resume_date`에 재개 예정일 (null이면 무기한)
- 정지 중: 대기열에서 제외, Day 멈춤
- 정지 해제: `paused_days += (오늘 - paused_at)`, `paused_at = null`
- end_date 자동 재계산 (paused_days 반영)

### 5.2 취소 (cancel)

- `is_cancelled = true`
- 대기열에서 제외
- 되돌리기: `is_cancelled = false`

---

## 6. Day 오버라이드

### 6.1 개별 오버라이드

구독 상세에서 last_sent_day 직접 입력

### 6.2 대량 오버라이드 (CSV 업로드)

구독 관리 탭 상단에 "Day 오버라이드" 버튼

```
CSV 형식:
카톡이름,상품코드,Day,시작일
조종희,SUB-43,37,2026-02-14

서버 처리:
→ 카톡이름 + 상품코드로 구독 매칭
→ last_sent_day = Day - 1
→ start_date = 시작일
→ end_date 자동 재계산
```

결과: 성공 N건, 실패 N건 + 실패 목록 CSV 다운로드

---

## 7. 매크로 프로그램 (Python)

### 7.1 구조

```
KakaoMacro/
├── macro.exe          (또는 macro.py)
├── config.json        ← PC마다 device_id만 다름
├── images/            ← 이미지 캐시
├── logs/              ← 로컬 로그
├── progress.json      ← 발송 진행 상황
└── install.bat        ← 설치 (config 생성 + 작업 스케줄러 등록)
```

### 7.2 config.json

```json
{
  "device_id": "010-2785-8940",
  "server_url": "https://1d1m-management.vercel.app",
  "api_key": "1d1m-macro-secret-key",
  "min_delay": 3,
  "max_delay": 5,
  "file_delay": 6
}
```

### 7.3 install.bat

1. PC 전화번호 입력 → config.json 생성
2. Windows 작업 스케줄러 등록:
   - 22:00 — `shutdown /r /f /t 0` (재부팅)
   - 04:00 — `macro.exe` 실행

### 7.4 발송 흐름

```
1. 서버에서 대기열 수신 (GET /api/macro/queue)
   → 없으면 서버가 생성 후 반환 (백업)
2. 이미지 다운로드 (어제 이후 업로드된 것만)
3. 사람 단위로 발송:
   a. 친구 탭 → 이름 검색 → 채팅방 열기
   b. 해당 사람의 메시지 전부 순서대로 발송
   c. 채팅방 닫기 (ESC)
   d. 결과 로컬 저장 (progress.json 업데이트)
   e. 다음 사람으로
4. 1분마다 heartbeat (진행 숫자만)
5. 전체 완료 후 상세 결과 보고
6. 프로그램 종료
```

### 7.5 실패 처리

| 상황 | 매크로 동작 |
|------|-----------|
| 친구 못 찾음 | 해당 사람 스킵, friend_not_found 기록, 다음 사람 |
| 카톡 먹통 | 강제 종료 → 90초 대기 → 재실행 → 이어서 |
| 재시작 후 또 먹통 | 중단, 서버에 device_error 보고, 슬랙 알림 |

### 7.6 중간 재시작

```
progress.json:
{
  "date": "2026-03-22",
  "last_index": 3000,
  "results": [
    { "queue_id": "uuid", "status": "sent" },
    { "queue_id": "uuid", "status": "failed", "error_type": "friend_not_found" },
    ...
  ]
}

재시작 시:
→ 오늘 날짜 확인 → 3001번부터 이어서
→ results에 이미 저장된 결과는 최종 report에 포함
→ 다른 날짜면 처음부터
```

주의: progress.json에 결과도 함께 저장하므로 중간 크래시 시에도
이미 보낸 건의 결과가 유실되지 않는다.

---

## 8. 매크로 API

### 8.1 인증

모든 요청에 `Authorization: Bearer {api_key}` 헤더 필요.
공용 키 하나 사용.

### 8.2 엔드포인트

#### GET /api/macro/queue

오늘 발송 대기열 조회. 없으면 서버가 생성 후 반환.

```
Query: device_id=010-2785-8940

Response: {
  data: [
    {
      queue_id: "uuid",
      subscription_id: "uuid",
      day_number: 37,
      kakao_friend_name: "조종희",
      message_content: "DAY1. 📖제 1 화...",
      image_path: "https://xxx.supabase.co/SUB-70_D1_1.jpg",
      sort_order: 1
    }, ...
  ],
  total: 5200,
  date: "2026-03-22"
}
```

정렬: 사람 단위 묶음 → 사람별 발송순서(send_priority) → 구독별 메시지 sort_order

#### POST /api/macro/heartbeat

1분마다 진행 상황 보고.

```
Body: {
  device_id: "010-2785-8940",
  pending: 2100,
  sent: 3050,
  failed: 50,
  total: 5200
}
```

#### POST /api/macro/report

발송 완료 후 상세 결과 보고.

```
Body: {
  device_id: "010-2785-8940",
  date: "2026-03-22",
  results: [
    { queue_id: "uuid", status: "sent" },
    { queue_id: "uuid", status: "failed", error_type: "friend_not_found" },
    ...
  ]
}
```

서버 처리:
1. send_queues 상태 업데이트
2. 구독별 성공/실패 집계
3. 전체 성공 구독 → last_sent_day 업데이트
4. 실패 구독 → failure_type 설정
5. 사람 단위 실패 전파 (friend_not_found 시)

---

## 9. 대기열 생성 (크론 02:00)

### 9.0 크론 사전 처리 (02:00 시작 시)

대기열 생성 전에 먼저 실행:
1. **not_sent 감지**: 어제 send_queues에서 status='pending'(보고 안 온) 건 → failure_type='not_sent' 설정
2. **2일 연속 실패 전환**: pending_count >= 3인 구독 → 관리자 확인 필요로 표시
3. **자동 정지 해제**: resume_date <= 오늘인 구독 → paused_days 계산, paused_at = null

### 9.1 생성 대상

상태가 "활성"인 구독만:
- is_cancelled = false
- paused_at IS NULL
- current_day >= 1
- last_sent_day < duration_days
- failure_type이 관리자 확인 필요(friend_not_found, other)가 아님
- pending_count < 3 (2일 이상 연속 미발송 아님)

### 9.2 보낼 Day 결정

```
pending_days = last_sent_day + 1 ~ current_day

recovery_mode = null         → pending_days 1개만 (정상)
recovery_mode = 'bulk'       → pending_days 전부
recovery_mode = 'sequential' → last_sent_day + 1 만
```

### 9.3 정렬 순서

```
1차: PC(device_id)별
2차: 사람별 발송순서(send_priority)
3차: 같은 사람 내 구독 묶음
4차: 같은 구독 내 메시지 sort_order
```

### 9.4 실시간(realtime) 메시지 처리

message_type = 'realtime'인 상품은 Day 기반이 아니라 날짜 기반:
```
고정(fixed): messages 테이블에서 day_number로 조회
실시간(realtime): daily_messages 테이블에서 send_date = 오늘로 조회
```
실시간 상품도 동일한 대기열/보고 구조를 사용.
last_sent_day는 동일하게 증가 (발송 성공 시 +1).

### 9.5 send_queues 스키마 변경

대기열에 day_number 칼럼 추가:
```
send_queues:
  + day_number INT  — 이 항목이 어떤 Day의 메시지인지
  + subscription_id — 어떤 구독의 메시지인지
```
report 처리 시 day_number로 last_sent_day 업데이트.

### 9.6 PC별 순차 생성

한 크론 안에서 PC를 하나씩 순서대로 처리. 동시 생성 없음.

### 9.7 생성 완료 후

슬랙 요약 알림:
```
02:03 대기열 생성 완료
PC 10대 / 총 48,520건
PC별: 010-2785 (5,200) | 010-2295 (4,900) | ...
```

---

## 10. 구독 관리 UI 변경

### 10.1 칼럼 변경

| 기존 | 변경 |
|------|------|
| Day (DB 저장값) | Day (계산값) |
| 상태 (수정 가능) | 상태 (계산값, 읽기 전용) |
| 정상/실패 칼럼 | 발송상태 칼럼 (통합) |
| - | 정지/재개 칼럼 |

### 10.2 발송상태 칼럼

| 뱃지 | 의미 | 마우스 오버 |
|------|------|-----------|
| ✅ 정상 | 정상 진행 중 | - |
| 🔄 자동재시도 | 내일 자동 재발송 | "3/22 PC오류(010-2785)" |
| ⚠️ 친구없음 | 관리자 확인 필요 | "3/22 친구 못 찾음" |
| 🔴 미발송 | 2일 연속 미발송 | "2일 연속 미발송" |
| ⚠️ 기타 | 관리자 확인 필요 | 에러 메시지 |

뱃지 클릭 → 실패 해제 팝업

### 10.3 정지/재개 칼럼

| 상태 | 표시 |
|------|------|
| 활성 | 클릭 → 정지 팝업 (재개일 선택 또는 무기한) |
| 정지 | ~4/15 재개 또는 무기한 표시. 클릭 → 해제/변경 |

### 10.4 상단 버튼

- Day 오버라이드 — CSV 업로드 모달

---

## 11. 발송 모니터링 UI 변경

### 11.1 대기열 상태

```
대기열 상태: ✅ 생성 완료 (02:03)    [재생성]
다음 생성: 내일 02:00 예정

재생성: 발송 전에만 활성화, 발송 중 비활성화
```

### 11.2 PC별 실시간 진행률

Supabase Realtime으로 자동 업데이트 (새로고침 불필요)

```
| PC | 대기 | 성공 (%) | 실패 (%) | 총 | 진행률 |
|----|------|---------|---------|-----|-------|
| 010-2785 | 2,100 | 3,050 (58.7%) | 50 (1.0%) | 5,200 | ████░░ |
```

---

## 12. 메시지 관리 UI 개선

### 12.1 이미지 미리보기

"파일"로 표시되던 행 → 이미지 썸네일로 표시

```
기존: D2  1  파일
개선: D2  1  [🖼️ 썸네일 이미지]
```

### 12.2 이미지 재업로드

썸네일 클릭 → 이미지 크게 보기 + 재업로드 버튼

---

## 13. 슬랙 알림

수신: tony.lee, sunny.choi

### 13.1 알림 종류

| 시점 | 내용 |
|------|------|
| 대기열 생성 완료 | PC 10대 / 총 48,520건 / PC별 건수 |
| 매크로 중단 | 🔴 PC 010-2785 발송 중단 — 3000/5200건 처리 후 카톡 먹통 |
| 발송 완료 | 📊 총 48,520건 / 성공 47,800 / 실패 435 / 미발송 285 / PC별 요약 |
| 결과 보고 실패 | ⚠️ PC 010-2785 결과 보고 실패 — 수동 확인 필요 |

---

## 14. 이미지 관리

### 14.1 매크로 이미지 캐싱

```
최초 실행: 이미지 전부 다운로드
이후 매일: 서버에서 어제 이후 업로드된 이미지만 조회
  → 있으면 해당 파일만 다운로드
  → 없으면 스킵
```

### 14.2 Supabase 스토리지

파일명 규칙: `SUB-70_D1_1.jpg` (상품코드_Day_순서)
업로드 시 `updated_at` 기록 → 매크로가 날짜 비교용으로 사용

---

## 15. API 보안

- `/api/macro/*` 경로: 공용 api_key 인증
- 미들웨어에서 `Authorization: Bearer {api_key}` 검증
- api_key는 환경 변수로 관리 (`MACRO_API_KEY`)

---

## 16. 데이터 마이그레이션

### 16.1 기존 구독 데이터

- `day` → 제거 (계산으로 대체)
- `status` → `is_cancelled`, `paused_at` 등으로 분리
  - status = 'pause' → paused_at 설정
  - status = 'cancel' → is_cancelled = true
  - status = 'pending', 'live', 'archive' → 제거 (계산값)
- `last_send_failure` → `failure_type`으로 변환
- 새 칼럼 초기값: last_sent_day = 0, paused_days = 0, recovery_mode = null

### 16.2 기존 고객 Day 설정

CSV 대량 오버라이드로 처리:
- 구글 시트에서 현재 Day 정보 추출
- CSV 형식: 카톡이름, 상품코드, Day, 시작일
- 업로드 → last_sent_day, start_date 설정 → end_date 자동 계산
