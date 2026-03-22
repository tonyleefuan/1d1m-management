# 1D1M 카카오톡 매크로 원클릭 설치 스크립트
# 실행: PowerShell 관리자 권한으로 열고 아래 한 줄 실행
# irm https://raw.githubusercontent.com/tonyleefuan/1d1m-management/main/macro/install.ps1 | iex

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ""
Write-Host "===================================" -ForegroundColor Yellow
Write-Host "  1D1M 카카오톡 매크로 설치" -ForegroundColor Yellow
Write-Host "===================================" -ForegroundColor Yellow
Write-Host ""

# ─── 관리자 권한 확인 ───
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[!] 관리자 권한이 필요합니다." -ForegroundColor Red
    Write-Host "    PowerShell을 우클릭 → '관리자 권한으로 실행' 하세요." -ForegroundColor Red
    pause
    exit 1
}

# ─── 설치 경로 ───
$installDir = "C:\1D1M_Macro"
Write-Host "[1/8] 설치 경로: $installDir"
if (-not (Test-Path $installDir)) { New-Item -ItemType Directory -Path $installDir -Force | Out-Null }
Set-Location $installDir

# ─── Python 설치 확인/설치 ───
Write-Host "[2/8] Python 확인 중..."
$pythonInstalled = $false
try {
    $pyVer = & python --version 2>&1
    if ($pyVer -match "Python 3") {
        Write-Host "       Python 이미 설치됨: $pyVer" -ForegroundColor Green
        $pythonInstalled = $true
    }
} catch {}

if (-not $pythonInstalled) {
    Write-Host "       Python 설치 중... (약 1분 소요)" -ForegroundColor Cyan
    $pyInstaller = "$env:TEMP\python-installer.exe"
    # Python 3.12 다운로드
    Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe" -OutFile $pyInstaller
    # 자동 설치 (PATH 추가, 모든 사용자)
    Start-Process -FilePath $pyInstaller -ArgumentList "/quiet", "InstallAllUsers=1", "PrependPath=1", "Include_pip=1" -Wait
    Remove-Item $pyInstaller -Force
    # PATH 갱신 (현재 세션에 반영)
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    # python.exe 경로 캐싱
    $script:pythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source
    if (-not $script:pythonExe) {
        # 직접 탐색
        $pyPaths = @(
            "$env:ProgramFiles\Python312\python.exe",
            "$env:ProgramFiles\Python311\python.exe",
            "$env:LocalAppData\Programs\Python\Python312\python.exe",
            "$env:LocalAppData\Programs\Python\Python311\python.exe"
        )
        foreach ($p in $pyPaths) {
            if (Test-Path $p) { $script:pythonExe = $p; break }
        }
    }
    Write-Host "       Python 설치 완료!" -ForegroundColor Green
} else {
    $script:pythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source
}

# ─── 매크로 파일 다운로드 ───
Write-Host "[3/8] 매크로 파일 다운로드 중..."
$baseUrl = "https://raw.githubusercontent.com/tonyleefuan/1d1m-management/main/macro"
$files = @("macro.py", "requirements.txt", "config.example.json")

foreach ($file in $files) {
    Invoke-WebRequest -Uri "$baseUrl/$file" -OutFile "$installDir\$file" -UseBasicParsing
    Write-Host "       $file" -ForegroundColor Gray
}

# 폴더 생성
@("images", "logs") | ForEach-Object {
    if (-not (Test-Path "$installDir\$_")) { New-Item -ItemType Directory -Path "$installDir\$_" -Force | Out-Null }
}

# ─── Python 패키지 설치 ───
Write-Host "[4/8] Python 패키지 설치 중..."
# python -m pip 사용 (pip.exe 직접 호출 시 stderr 경고가 에러로 처리되는 문제 방지)
$pyRun = if ($script:pythonExe) { $script:pythonExe } else { "python" }
& $pyRun -m pip install -r requirements.txt --quiet 2>$null
Write-Host "       완료!" -ForegroundColor Green

# ─── config.json 설정 ───
Write-Host ""
if (-not (Test-Path "$installDir\config.json")) {
    Write-Host "[5/8] PC 설정" -ForegroundColor Cyan
    $deviceId = Read-Host "       PC 전화번호 (예: 010-2785-8940)"
    $apiKey = Read-Host "       API 키"

    $config = @{
        device_id = $deviceId
        server_url = "https://1d1m-management.vercel.app"
        api_key = $apiKey
        min_delay = 3
        max_delay = 5
        file_delay = 6
        kakao_path = "C:\Program Files (x86)\Kakao\KakaoTalk\KakaoTalk.exe"
    } | ConvertTo-Json
    [System.IO.File]::WriteAllText("$installDir\config.json", $config, [System.Text.UTF8Encoding]::new($false))
    Write-Host "       config.json 생성 완료!" -ForegroundColor Green
} else {
    Write-Host "[5/8] config.json 이미 존재 — 스킵" -ForegroundColor Green
}

# ─── Windows 업데이트 설정 ───
Write-Host "[6/8] Windows 설정 중..."

# 활성 시간 (00:00~12:00) — 새벽 자동 재시작 방지
Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings" -Name "ActiveHoursStart" -Value 0 -Type DWord -Force 2>$null
Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings" -Name "ActiveHoursEnd" -Value 12 -Type DWord -Force 2>$null
Write-Host "       활성 시간: 00:00~12:00" -ForegroundColor Gray

# 로그인 상태 자동 재시작 차단
$auPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU"
if (-not (Test-Path $auPath)) { New-Item -Path $auPath -Force | Out-Null }
Set-ItemProperty -Path $auPath -Name "NoAutoRebootWithLoggedOnUsers" -Value 1 -Type DWord -Force
Set-ItemProperty -Path $auPath -Name "AUOptions" -Value 3 -Type DWord -Force
Write-Host "       업데이트 자동 재시작 차단" -ForegroundColor Gray

# Windows Update 서비스 수동
Set-Service -Name wuauserv -StartupType Manual 2>$null
Write-Host "       Windows Update 서비스 수동 모드" -ForegroundColor Gray

# 절전 모드 / 화면 꺼짐 비활성화
powercfg -change -standby-timeout-ac 0
powercfg -change -standby-timeout-dc 0
powercfg -change -monitor-timeout-ac 0
Write-Host "       절전 모드 / 화면 꺼짐 비활성화" -ForegroundColor Gray

# 고성능 전원 모드
powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 2>$null
Write-Host "       고성능 전원 모드" -ForegroundColor Gray

# RDP 끊어도 세션 유지 (pyautogui가 동작하려면 데스크톱 세션 필요)
# disconnect.bat: tscon으로 세션 끊기 (잠금 안 됨 → 데스크톱 활성 유지)
$disconnectBat = "$installDir\disconnect.bat"
@"
@echo off
for /f "skip=1 tokens=3" %%s in ('query user %USERNAME%') do (
    tscon %%s /dest:console
    goto :done
)
:done
"@ | Set-Content -Path $disconnectBat -Encoding ASCII
Write-Host "       RDP 세션 유지 스크립트 (disconnect.bat)" -ForegroundColor Gray

# 재부팅 후 자동 로그인 (데스크톱 세션 자동 생성)
$winLogonPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$existingAutoLogon = (Get-ItemProperty -Path $winLogonPath -Name "AutoAdminLogon" -ErrorAction SilentlyContinue).AutoAdminLogon
if ($existingAutoLogon -ne "1") {
    $loginPw = Read-Host "       윈도우 로그인 비밀번호 (자동 로그인용)"
    Set-ItemProperty -Path $winLogonPath -Name "AutoAdminLogon" -Value "1" -Force
    Set-ItemProperty -Path $winLogonPath -Name "DefaultUserName" -Value $currentUser -Force
    Set-ItemProperty -Path $winLogonPath -Name "DefaultPassword" -Value $loginPw -Force
    Write-Host "       자동 로그인 설정 완료" -ForegroundColor Gray
} else {
    Write-Host "       자동 로그인 이미 설정됨" -ForegroundColor Gray
}

# ─── 카카오톡 시작프로그램 ───
$kakaoExe = "C:\Program Files (x86)\Kakao\KakaoTalk\KakaoTalk.exe"
$regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
if (-not (Get-ItemProperty -Path $regPath -Name "KakaoTalk" -ErrorAction SilentlyContinue)) {
    Set-ItemProperty -Path $regPath -Name "KakaoTalk" -Value $kakaoExe -Force
    Write-Host "       카카오톡 시작프로그램 등록" -ForegroundColor Gray
} else {
    Write-Host "       카카오톡 이미 시작프로그램 등록됨" -ForegroundColor Gray
}

# ─── 작업 스케줄러 ───
Write-Host "[7/8] 작업 스케줄러 등록..."

# 매일 22:00 재부팅
schtasks /create /tn "1D1M_Reboot" /tr "shutdown /r /f /t 60" /sc daily /st 22:00 /f 2>$null
Write-Host "       매일 22:00 재부팅" -ForegroundColor Gray

# 매일 04:00 매크로 실행 — bat 파일로 감싸서 경로 공백 문제 회피
$batContent = "@echo off`r`ncd /d `"$installDir`"`r`npython macro.py"
$batContent | Out-File -FilePath "$installDir\run_macro.bat" -Encoding ASCII
schtasks /create /tn "1D1M_Macro" /tr "`"$installDir\run_macro.bat`"" /sc daily /st 04:00 /f 2>$null
Write-Host "       매일 04:00 매크로 실행" -ForegroundColor Gray

# ─── 방화벽 ───
Write-Host "[8/8] 방화벽 설정..."
netsh advfirewall firewall add rule name="1D1M_Python" dir=out action=allow program="python.exe" 2>$null
Write-Host "       Python 방화벽 허용" -ForegroundColor Gray

# ─── 완료 ───
Write-Host ""
Write-Host "===================================" -ForegroundColor Green
Write-Host "  설치 완료!" -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Green
Write-Host ""
Write-Host "  설치 경로: $installDir" -ForegroundColor White
Write-Host ""
Write-Host "  [자동 설정됨]" -ForegroundColor Cyan
Write-Host "  - Python + 패키지"
Write-Host "  - Windows 업데이트 자동 재시작 차단"
Write-Host "  - 절전 / 화면 꺼짐 비활성화"
Write-Host "  - 카카오톡 시작프로그램"
Write-Host "  - 매일 22:00 재부팅 + 04:00 매크로"
Write-Host ""
Write-Host "  자동 테스트를 실행합니다..." -ForegroundColor Cyan
Write-Host ""

# 자동 테스트 실행
Set-Location $installDir
$pyRun = if ($script:pythonExe) { $script:pythonExe } else { "python" }
& $pyRun macro.py --test

Write-Host ""
Write-Host "  위 결과에 ❌ 가 있으면 설정을 확인하세요." -ForegroundColor Yellow
Write-Host "  모두 ✅ 이면 정상입니다!" -ForegroundColor Green
Write-Host ""
pause
