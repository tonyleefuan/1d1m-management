@echo off
chcp 65001 >/dev/null
echo ===================================
echo  1D1M 카카오톡 매크로 설치
echo ===================================
echo.

:: config.json 생성
if not exist config.json (
    set /p DEVICE_ID="PC 전화번호를 입력하세요 (예: 010-2785-8940): "
    set /p SERVER_URL="서버 URL (기본: https://1d1m-management.vercel.app): "
    set /p API_KEY="API 키를 입력하세요: "

    if "%SERVER_URL%"=="" set SERVER_URL=https://1d1m-management.vercel.app

    echo { > config.json
    echo   "device_id": "%DEVICE_ID%", >> config.json
    echo   "server_url": "%SERVER_URL%", >> config.json
    echo   "api_key": "%API_KEY%", >> config.json
    echo   "min_delay": 3, >> config.json
    echo   "max_delay": 5, >> config.json
    echo   "file_delay": 6, >> config.json
    echo   "kakao_path": "C:\\Program Files (x86)\\Kakao\\KakaoTalk\\KakaoTalk.exe" >> config.json
    echo } >> config.json
    echo config.json 생성 완료
) else (
    echo config.json이 이미 존재합니다
)

:: 폴더 생성
if not exist images mkdir images
if not exist images_ui mkdir images_ui
if not exist logs mkdir logs

:: Python 의존성 설치
echo.
echo Python 패키지 설치 중...
pip install -r requirements.txt

:: Windows 작업 스케줄러 등록
echo.
echo 작업 스케줄러 등록 중...

:: 매일 22:00 재부팅
schtasks /create /tn "1D1M_Reboot" /tr "shutdown /r /f /t 60" /sc daily /st 22:00 /f
echo [OK] 매일 22:00 재부팅 등록

:: 매일 04:00 매크로 실행
set MACRO_PATH=%CD%\macro.py
schtasks /create /tn "1D1M_Macro" /tr "python \"%MACRO_PATH%\"" /sc daily /st 04:00 /f
echo [OK] 매일 04:00 매크로 실행 등록

echo.
echo ===================================
echo  설치 완료!
echo  images_ui/ 폴더에 카카오톡 UI 이미지를 넣어주세요:
echo  - search.png (검색 아이콘)
echo  - close.png (닫기 아이콘)
echo ===================================
pause
