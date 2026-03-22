@echo off
chcp 65001 >nul
echo ===================================
echo  1D1M 카카오톡 매크로 설치
echo ===================================
echo.

:: 관리자 권한 확인
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] 관리자 권한이 필요합니다. 우클릭 → 관리자 권한으로 실행
    pause
    exit /b 1
)

:: ─── 1. config.json 생성 ───
if not exist config.json (
    set /p DEVICE_ID="PC 전화번호를 입력하세요 (예: 010-2785-8940): "
    set /p API_KEY="API 키를 입력하세요: "

    echo { > config.json
    echo   "device_id": "%DEVICE_ID%", >> config.json
    echo   "server_url": "https://1d1m-management.vercel.app", >> config.json
    echo   "api_key": "%API_KEY%", >> config.json
    echo   "min_delay": 3, >> config.json
    echo   "max_delay": 5, >> config.json
    echo   "file_delay": 6, >> config.json
    echo   "kakao_path": "C:\\Program Files (x86)\\Kakao\\KakaoTalk\\KakaoTalk.exe" >> config.json
    echo } >> config.json
    echo [OK] config.json 생성 완료
) else (
    echo [OK] config.json 이미 존재
)
echo.

:: ─── 2. 폴더 생성 ───
if not exist images mkdir images
if not exist images_ui mkdir images_ui
if not exist logs mkdir logs

:: ─── 3. Python 의존성 설치 ───
echo Python 패키지 설치 중...
pip install -r requirements.txt >nul 2>&1
echo [OK] Python 패키지 설치 완료
echo.

:: ─── 4. Windows 자동 업데이트 비활성화 ───
echo Windows 업데이트 설정 중...

:: 활성 시간 설정 (00:00 ~ 12:00) — 새벽 시간에 자동 재시작 방지
reg add "HKLM\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings" /v ActiveHoursStart /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings" /v ActiveHoursEnd /t REG_DWORD /d 12 /f >nul 2>&1
echo [OK] 활성 시간: 00:00~12:00 (새벽 자동 재시작 방지)

:: 자동 업데이트 재시작 비활성화
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" /v NoAutoRebootWithLoggedOnUsers /t REG_DWORD /d 1 /f >nul 2>&1
echo [OK] 로그인 상태 자동 재시작 차단

:: 업데이트 다운로드만, 자동 설치 안 함 (3 = 다운로드만)
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" /v AUOptions /t REG_DWORD /d 3 /f >nul 2>&1
echo [OK] 업데이트 자동 설치 비활성화 (다운로드만)

:: 업데이트 서비스 수동으로 변경 (선택적)
sc config wuauserv start= demand >nul 2>&1
echo [OK] Windows Update 서비스 수동 모드
echo.

:: ─── 5. 전원 관리 (절전 모드 방지) ───
echo 전원 설정 중...

:: 절전 모드 비활성화
powercfg -change -standby-timeout-ac 0
powercfg -change -standby-timeout-dc 0
echo [OK] 절전 모드 비활성화

:: 화면 꺼짐 방지 (pyautogui 이미지 매칭에 필요)
powercfg -change -monitor-timeout-ac 0
echo [OK] 모니터 꺼짐 방지

:: 고성능 전원 계획 활성화
powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c >nul 2>&1
echo [OK] 고성능 전원 모드
echo.

:: ─── 6. 카카오톡 시작프로그램 등록 ───
echo 카카오톡 시작프로그램 확인 중...
set KAKAO_EXE="C:\Program Files (x86)\Kakao\KakaoTalk\KakaoTalk.exe"
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "KakaoTalk" >nul 2>&1
if %errorlevel% neq 0 (
    reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "KakaoTalk" /t REG_SZ /d %KAKAO_EXE% /f >nul 2>&1
    echo [OK] 카카오톡 시작프로그램 등록
) else (
    echo [OK] 카카오톡 이미 시작프로그램에 등록됨
)
echo.

:: ─── 7. Windows 작업 스케줄러 등록 ───
echo 작업 스케줄러 등록 중...

:: 매일 22:00 재부팅
schtasks /create /tn "1D1M_Reboot" /tr "shutdown /r /f /t 60" /sc daily /st 22:00 /f >nul 2>&1
echo [OK] 매일 22:00 재부팅 등록

:: 매일 04:00 매크로 실행
set MACRO_PATH=%CD%\macro.py
schtasks /create /tn "1D1M_Macro" /tr "python \"%MACRO_PATH%\"" /sc daily /st 04:00 /f >nul 2>&1
echo [OK] 매일 04:00 매크로 실행 등록
echo.

:: ─── 8. 방화벽 규칙 (서버 통신) ───
netsh advfirewall firewall add rule name="1D1M_Macro_Out" dir=out action=allow program="python.exe" >nul 2>&1
echo [OK] Python 방화벽 허용
echo.

:: ─── 완료 ───
echo ===================================
echo  설치 완료!
echo ===================================
echo.
echo  [자동 설정됨]
echo  - Windows 업데이트 자동 재시작 차단
echo  - 절전 모드 / 화면 꺼짐 비활성화
echo  - 카카오톡 시작프로그램 등록
echo  - 매일 22:00 재부팅
echo  - 매일 04:00 매크로 실행
echo.
echo  [직접 해야 할 것]
echo  - images_ui/ 폴더에 카카오톡 UI 이미지 넣기:
echo    search.png (검색 아이콘)
echo    close.png  (닫기 아이콘)
echo  - 카카오톡 로그인 상태 확인
echo.
echo  API Key: config.json 에서 확인
echo ===================================
pause
