# 1D1M 카카오톡 매크로

## 설치

1. 이 폴더를 PC에 복사
2. `install.bat` 실행
3. `images_ui/` 폴더에 카카오톡 UI 캡처 이미지 추가:
   - `search.png` — 검색 아이콘
   - `close.png` — 닫기/X 아이콘
4. 카카오톡을 시작프로그램에 등록

## 동작

- 매일 22:00 — PC 자동 재부팅
- 매일 04:00 — 매크로 자동 실행
  1. 서버에서 대기열 수신
  2. 이미지 다운로드 (변경분만)
  3. 카카오톡으로 순서대로 발송
  4. 1분마다 진행 상황 서버 보고
  5. 완료 후 결과 보고

## 파일 구조

```
macro/
├── macro.py           — 메인 프로그램
├── config.json        — 설정 (PC별)
├── config.example.json
├── requirements.txt
├── install.bat
├── images/            — 발송용 이미지 캐시
├── images_ui/         — 카카오톡 UI 이미지
├── logs/              — 실행 로그
└── progress.json      — 발송 진행 상황 (자동)
```
