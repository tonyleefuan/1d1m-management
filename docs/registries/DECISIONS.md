# 비즈니스 결정 기록

## 발송 모니터링 v2 — 구글시트 연동 (2026-04-02)

### 아키텍처
1. DB가 원본(SSOT), 구글시트는 작업용 복사본
2. Google Sheets API + 서비스 계정 인증 (OAuth 불필요)
3. 스프레드시트 하나 고정 사용 (ID: 1n3izrz9w6PaXotYo3bueLy2gwg0TAbAmmc4Tu7nK7-k)
4. 매크로 프로그램 연동 제거 → 문서 보존 (docs/archive/macro-integration-v1.md)

### 내보내기 규칙
5. "구글시트 내보내기" 버튼으로 수동 내보내기
6. PC번호별 시트 초기화 후 덮어쓰기, Today 시트 무시
7. A~F열 기존 구조 유지, G열에 queue_id 추가
8. D열 예약시간 형식: `260402 04:00` (YYMMDD HH:MM)
9. 내보내기 전 이전 미수거 결과 자동 가져오기 선행
10. 중복 내보내기 시 확인 다이얼로그
11. PC 시트 탭 없으면 자동 생성

### 발송 날짜 선택
12. 날짜 picker UI 추가, 디폴트 로직:
    - send_start_time 이전 → 오늘(KST)
    - send_start_time 이후 → 내일(KST)

### 결과 가져오기 규칙
13. "결과 가져오기" 버튼으로 수동 동기화
14. E열 "성공" → 성공, "실패" → 실패, 비어있음 → 미처리(무시)
15. F열 처리일시 → DB sent_at에 저장
16. queue_id(G열)로 시트 행 ↔ DB 레코드 정확 매칭

### 구독 상태 업데이트
17. 같은 구독+Day의 모든 메시지 성공 시만 Day 성공 (last_sent_day +1)
18. 하나라도 실패 → Day 실패
19. 미처리 있으면 판단 보류
20. 실패 → 다음 날 재시도 (밀린 것 + 오늘 것, 디폴트 최대 2일치)
21. 3일 연속 실패 → 자동 발송 중지, 복구 모드(bulk/sequential) 선택
22. 성공/실패만 구분, 실패 사유 없음 (failure_type = 'failed')
23. 친구아님 전파 없음, 개별 구독 관리
24. 대량 처리 대비 배치 처리 (DB 500건씩)

### 2차 기능 (이번에 미구현)
- 특정 구독자만 선택해서 내보내기
- ~~Day 수동 지정 (last_sent_day 직접 수정)~~ → 구현 완료 (2026-04-08)

## 발송 파이프라인 안전장치 강화 (2026-04-09)

### DB 레벨 안전장치
25. `send_queues(subscription_id, day_number, send_date)` 유니크 인덱스 추가 (WHERE is_notice = false)
    — 코드 버그와 무관하게 중복 큐 물리적 차단
26. generate API에서 유니크 제약 위반(23505) 시 graceful skip 처리

### 큐 정리 정책 (SSOT)
모든 경로에서 일관된 큐 정리:
27. `last_sent_day` 직접 변경 시 → pending+failed 큐 전부 삭제
28. `day_adjust` 상대 조정 시 → pending+failed 큐 전부 삭제 + duration_days 상한 체크
29. 3일 연속 실패 자동 정지 시 → pending+failed 큐 전부 삭제 (정지됨 = 처리 완료)
30. 구독 취소 시 → pending 큐 삭제

### 메시지 조회 단순화
31. 기존: 20개 상품 배치 + 글로벌 minDay/maxDay + 페이지네이션 → cross-product 오염 + 불안정 페이지네이션 발생
32. 변경: 상품별 개별 조회 (product_id + day_number[] 단위) — 정확성 보장

### chain advancement 안전장치
33. futureDays 배열 중복 day 제거 후 chain walk — 중복 큐 잔존 시에도 chain이 조기 중단되지 않음

### 미해결 실패 모니터링
34. 발송 모니터링 탭 "미해결 실패" 필터: 날짜 무관, sent 큐가 없는 failed 큐만 조회
35. 실패 큐 생애주기: 재발송 성공 시 목록에서 제외, 자동 정지 시 큐 삭제로 제외, Day 수동 변경 시 큐 삭제로 제외

### generate race condition 방어
36. pending→live 전환 시 body.date가 아닌 todayKST() 기준 — 미래 날짜 활성화 방지
37. pause→live 전환 시 paused_days를 메인 update에 포함 (atomic) — 2단계 race 제거
