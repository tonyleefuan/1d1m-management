"""
1D1M KakaoTalk Macro — 카카오톡 자동 발송 프로그램

서버에서 대기열을 받아 카카오톡으로 메시지를 순차 발송합니다.
pyautogui 기반 — 활성 데스크톱 세션 필요 (RDP 끊을 때 disconnect.bat 사용).
"""

import json
import os
import sys
import time
import logging
import random
import requests
import subprocess
import ctypes
from datetime import datetime, date
from pathlib import Path

import win32gui
import win32con
import win32api
import win32clipboard
import pyautogui
import pyperclip

# pyautogui 설정
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.05

# ─── 설정 ───

BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "config.json"
PROGRESS_PATH = BASE_DIR / "progress.json"
LOCK_PATH = BASE_DIR / "macro.lock"
IMAGES_DIR = BASE_DIR / "images"
LOG_DIR = BASE_DIR / "logs"

LOG_DIR.mkdir(exist_ok=True)
IMAGES_DIR.mkdir(exist_ok=True)
log_file = LOG_DIR / f"{date.today().isoformat()}.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(log_file, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("macro")


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        log.error("config.json이 없습니다.")
        sys.exit(1)
    with open(CONFIG_PATH, "r", encoding="utf-8-sig") as f:
        return json.load(f)


# ─── 중복 실행 방지 ───

def acquire_lock() -> bool:
    if LOCK_PATH.exists():
        try:
            pid = int(LOCK_PATH.read_text().strip())
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}"],
                capture_output=True, text=True
            )
            if f"{pid}" in result.stdout and "python" in result.stdout.lower():
                log.error(f"매크로가 이미 실행 중입니다 (PID: {pid})")
                return False
        except Exception:
            pass
    LOCK_PATH.write_text(str(os.getpid()))
    return True


def release_lock():
    if LOCK_PATH.exists():
        LOCK_PATH.unlink()


# ─── 서버 통신 ───

class ServerAPI:
    def __init__(self, config: dict):
        self.base_url = config["server_url"].rstrip("/")
        self.api_key = config["api_key"]
        self.device_id = config["device_id"]
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def get_queue(self) -> dict:
        try:
            res = requests.get(
                f"{self.base_url}/api/macro/queue",
                params={"device_id": self.device_id},
                headers=self.headers, timeout=60,
            )
            res.raise_for_status()
            return res.json()
        except Exception as e:
            log.error(f"대기열 조회 실패: {e}")
            return {"data": [], "settings": {}, "images": []}

    def send_heartbeat(self, pending: int, sent: int, failed: int, total: int):
        try:
            requests.post(
                f"{self.base_url}/api/macro/heartbeat",
                headers=self.headers, timeout=10,
                json={"device_id": self.device_id,
                      "pending": pending, "sent": sent, "failed": failed, "total": total},
            )
        except Exception as e:
            log.warning(f"Heartbeat 실패 (무시): {e}")

    def send_report(self, results: list, report_date: str) -> bool:
        for attempt in range(3):
            try:
                res = requests.post(
                    f"{self.base_url}/api/macro/report",
                    headers=self.headers, timeout=120,
                    json={"device_id": self.device_id, "date": report_date, "results": results},
                )
                res.raise_for_status()
                log.info(f"결과 보고 성공: {len(results)}건")
                return True
            except Exception as e:
                log.error(f"결과 보고 실패 (시도 {attempt + 1}/3): {e}")
                if attempt < 2:
                    time.sleep(5)
        return False


# ─── 이미지 관리 ───

def download_images_from_list(image_urls: list):
    if not image_urls:
        log.info("다운로드할 이미지 없음")
        return

    log.info(f"이미지 {len(image_urls)}개 확인 중...")
    downloaded = 0

    for url in image_urls:
        filename = url.split("/")[-1]
        local_path = IMAGES_DIR / filename

        if local_path.exists():
            try:
                head = requests.head(url, timeout=10)
                server_modified = head.headers.get("last-modified")
                if server_modified:
                    from email.utils import parsedate_to_datetime
                    server_time = parsedate_to_datetime(server_modified).timestamp()
                    if server_time <= local_path.stat().st_mtime:
                        continue
            except Exception:
                continue

        try:
            res = requests.get(url, timeout=30)
            res.raise_for_status()
            local_path.write_bytes(res.content)
            downloaded += 1
            log.info(f"  다운로드: {filename}")
        except Exception as e:
            log.warning(f"  이미지 다운로드 실패: {filename} — {e}")

    log.info(f"이미지 다운로드 완료: {downloaded}개 새로 받음")


# ─── 진행 상황 관리 ───

def load_progress() -> dict:
    if PROGRESS_PATH.exists():
        try:
            with open(PROGRESS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if data.get("date") == date.today().isoformat():
                    return data
        except Exception as e:
            log.warning(f"progress.json 읽기 실패 (초기화): {e}")
    return {"date": date.today().isoformat(), "completed_ids": [], "results": []}


def save_progress(completed_ids, results: list):
    tmp_path = PROGRESS_PATH.with_suffix(".tmp")
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump({
                "date": date.today().isoformat(),
                "completed_ids": list(completed_ids),
                "results": results
            }, f, ensure_ascii=False)
        os.replace(tmp_path, PROGRESS_PATH)
    except Exception as e:
        log.warning(f"progress 저장 실패: {e}")


# ─── Win32 카카오톡 자동화 ───

class KakaoController:
    """pyautogui + Win32 API로 카카오톡을 제어 — 활성 데스크톱 세션 필요

    카카오톡 PC Win32 구조 (Spy++):
    ├── "카카오톡" (메인 창)
    │   └── EVA_ChildWindow
    │       ├── EVA_Window (친구 목록)
    │       └── EVA_Window (검색 영역)
    │           └── Edit (검색 입력창)
    채팅방:
    ├── "친구이름" (채팅 창)
    │   └── RichEdit50W (메시지 입력창)
    """

    def __init__(self):
        self.main_hwnd = None
        self.chat_hwnd = None

    # ─── 윈도우 탐색 ───

    def find_main_window(self) -> bool:
        """카카오톡 메인 창 찾기"""
        self.main_hwnd = win32gui.FindWindow(None, "카카오톡")
        if self.main_hwnd:
            return True
        # 클래스명으로 재시도
        results = []
        def callback(hwnd, _):
            if win32gui.IsWindowVisible(hwnd) and "카카오톡" in win32gui.GetWindowText(hwnd):
                results.append(hwnd)
        win32gui.EnumWindows(callback, None)
        if results:
            self.main_hwnd = results[0]
            return True
        return False

    def find_search_edit(self) -> int:
        """카카오톡 메인 창의 검색 입력창(Edit) 핸들 찾기

        구조: 카카오톡 → EVA_ChildWindow → EVA_Window(2번째) → Edit
        """
        if not self.main_hwnd:
            return 0
        try:
            child = win32gui.FindWindowEx(self.main_hwnd, None, "EVA_ChildWindow", None)
            if not child:
                return 0
            # 첫 번째 EVA_Window (친구 목록)
            eva1 = win32gui.FindWindowEx(child, None, "EVA_Window", None)
            if not eva1:
                return 0
            # 두 번째 EVA_Window (검색 영역)
            eva2 = win32gui.FindWindowEx(child, eva1, "EVA_Window", None)
            if not eva2:
                return 0
            # Edit 컨트롤 (검색 입력창)
            edit = win32gui.FindWindowEx(eva2, None, "Edit", None)
            return edit or 0
        except Exception:
            return 0

    def find_chat_window(self, friend_name: str) -> bool:
        """특정 이름의 채팅방 창 찾기 (정확히 일치하는 제목만)"""
        self.chat_hwnd = None
        def callback(hwnd, _):
            if win32gui.IsWindowVisible(hwnd):
                title = win32gui.GetWindowText(hwnd)
                if title == friend_name:
                    self.chat_hwnd = hwnd
                    return False
            return True
        try:
            win32gui.EnumWindows(callback, None)
        except Exception:
            pass
        return self.chat_hwnd is not None

    def find_chat_edit(self) -> int:
        """현재 채팅방의 메시지 입력창 핸들 찾기 (EnumChildWindows 재귀 탐색)

        카카오톡 버전에 따라 클래스명이 다를 수 있음:
        - "RichEdit50W" (일반적)
        - "RICHEDIT50W" (일부 버전)
        """
        if not self.chat_hwnd:
            return 0
        found = []
        def callback(hwnd, _):
            cls = win32gui.GetClassName(hwnd)
            if cls in ("RichEdit50W", "RICHEDIT50W"):
                found.append(hwnd)
                return False
            return True
        try:
            win32gui.EnumChildWindows(self.chat_hwnd, callback, None)
        except Exception:
            pass
        return found[0] if found else 0

    # ─── 키 입력 ───

    def _is_valid_hwnd(self, hwnd: int) -> bool:
        """윈도우 핸들이 유효한지 확인"""
        try:
            return hwnd and win32gui.IsWindow(hwnd)
        except Exception:
            return False

    def send_return(self, hwnd: int):
        """엔터키 전송 — pyautogui (포그라운드 필요)"""
        self.bring_to_front(hwnd)
        time.sleep(0.1)
        pyautogui.press('enter')
        time.sleep(0.1)

    def send_escape(self):
        """ESC키 전송 — pyautogui"""
        pyautogui.press('escape')
        time.sleep(0.2)

    def set_text(self, hwnd: int, text: str):
        """윈도우 컨트롤에 텍스트 직접 설정 (WM_SETTEXT)"""
        win32api.SendMessage(hwnd, win32con.WM_SETTEXT, 0, text)
        time.sleep(0.1)

    def set_clipboard_text(self, text: str):
        """클립보드에 텍스트 복사 (최대 5회 재시도)"""
        for attempt in range(5):
            try:
                win32clipboard.OpenClipboard()
                try:
                    win32clipboard.EmptyClipboard()
                    win32clipboard.SetClipboardText(text, win32clipboard.CF_UNICODETEXT)
                finally:
                    win32clipboard.CloseClipboard()
                return
            except Exception:
                time.sleep(0.1)
        log.warning("클립보드 접근 실패 (5회 시도)")

    def send_ctrl_key(self, hwnd: int, char: str):
        """Ctrl+문자 전송 — pyautogui 사용"""
        self.bring_to_front(hwnd)
        time.sleep(0.2)
        pyautogui.hotkey('ctrl', char.lower())
        time.sleep(0.3)

    # ─── 카카오톡 동작 ───

    def search_friend(self, name: str) -> bool:
        """친구 검색 → 채팅방 열기 → 창 제목으로 검증

        WM_SETTEXT로 검색 입력창에 직접 텍스트 설정
        """
        if not self.main_hwnd:
            log.error("  카카오톡 메인 창 없음")
            return False

        # 0. 메인 창 포그라운드로 (검색이 동작하려면 필요)
        self.send_ctrl_key(self.main_hwnd, '1')  # 친구 탭
        time.sleep(0.5)

        # 1. 검색 입력창 핸들 찾기
        search_edit = self.find_search_edit()
        if not search_edit:
            log.warning("  검색 입력창을 찾을 수 없음 — Ctrl+F로 시도")
            self.send_ctrl_key(self.main_hwnd, 'F')
            time.sleep(1.0)
            search_edit = self.find_search_edit()

        if not search_edit:
            log.error("  검색 입력창을 찾을 수 없습니다")
            return False

        # 2. 기존 검색어 초기화
        self.set_text(search_edit, "")
        time.sleep(0.3)

        # 3. 새 검색어 설정
        self.set_text(search_edit, name)
        time.sleep(random.uniform(2.0, 2.5))  # 검색 결과 로딩 충분히 대기

        # 4. 엔터로 첫 번째 결과 열기 (pyautogui)
        self.send_return(self.main_hwnd)
        time.sleep(random.uniform(1.5, 2.0))  # 채팅방 열리는 시간 충분히 대기

        # ⭐ 5. 검증: 채팅방 창이 열렸는지 확인
        if self.find_chat_window(name):
            log.info(f"  채팅방 확인 ✅: {name}")
            return True

        # 한번 더 대기
        time.sleep(1.5)
        if self.find_chat_window(name):
            log.info(f"  채팅방 확인 ✅ (2차): {name}")
            return True

        log.warning(f"  채팅방 확인 ❌: {name} — 친구 못 찾음")
        # 검색어 초기화
        self.set_text(search_edit, "")
        return False

    def verify_chat_still_open(self, name: str) -> bool:
        """채팅방이 아직 열려있는지 확인"""
        return self.find_chat_window(name)

    def send_text_message(self, text: str):
        """현재 열린 채팅방에 텍스트 전송 — pyautogui 방식"""
        if not self.chat_hwnd:
            raise Exception("채팅방 창이 없습니다")

        # 1. 채팅방을 포그라운드로
        self.bring_to_front(self.chat_hwnd)
        time.sleep(0.3)

        # 2. 클립보드 → Ctrl+V → Enter
        pyperclip.copy(text)
        time.sleep(0.1)
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(0.3)
        pyautogui.press('enter')
        time.sleep(0.3)

    def bring_to_front(self, hwnd: int):
        """창을 포그라운드로 — Alt 키 없이 안전하게"""
        try:
            _user32 = ctypes.windll.user32
            # 최소화 상태면 복원
            if _user32.IsIconic(hwnd):
                _user32.ShowWindow(hwnd, win32con.SW_RESTORE)
                time.sleep(0.3)
            # WM_ACTIVATE로 활성화 (시스템 메뉴 안 뜸)
            win32gui.SendMessage(hwnd, win32con.WM_ACTIVATE, win32con.WA_ACTIVE, 0)
            _user32.SetForegroundWindow(hwnd)
            time.sleep(0.1)
        except Exception:
            pass

    def send_image_file(self, image_path: str, file_delay: int = 6):
        """이미지를 클립보드에 복사(CF_DIB) → Ctrl+V로 붙여넣기 → Enter 확인

        kakaotalk-mcp 패턴 참고: Ctrl+T 파일 대화상자 대신
        클립보드 이미지 붙여넣기 방식 사용
        """
        if not self.chat_hwnd:
            raise Exception("채팅방 창이 없습니다")

        filename = image_path.split("/")[-1]
        local_path = IMAGES_DIR / filename

        if not local_path.exists():
            raise FileNotFoundError(f"이미지 파일 없음: {local_path}")

        # 1. PowerShell로 이미지를 BMP 변환 → 클립보드에 CF_DIB 설정
        abs_path = str(local_path.resolve())
        ps_path = abs_path.replace("'", "''")
        ps_script = (
            "Add-Type -AssemblyName System.Drawing;"
            f"$img = [System.Drawing.Image]::FromFile('{ps_path}');"
            "$ms = New-Object System.IO.MemoryStream;"
            "$img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Bmp);"
            "$img.Dispose();"
            "$bytes = $ms.ToArray();"
            "$ms.Dispose();"
            "[Console]::OpenStandardOutput().Write($bytes, 0, $bytes.Length)"
        )
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_script],
            capture_output=True, timeout=15,
        )
        if result.returncode != 0:
            raise OSError(f"이미지 변환 실패: {result.stderr.decode().strip()}")

        bmp_data = result.stdout
        if len(bmp_data) < 54:
            raise OSError("이미지 변환 결과가 유효하지 않습니다")

        # CF_DIB = BMP에서 14바이트 파일 헤더 제거
        dib_data = bmp_data[14:]

        for attempt in range(3):
            try:
                win32clipboard.OpenClipboard()
                try:
                    win32clipboard.EmptyClipboard()
                    win32clipboard.SetClipboardData(win32con.CF_DIB, dib_data)
                finally:
                    win32clipboard.CloseClipboard()
                break
            except Exception:
                if attempt == 2:
                    raise Exception("이미지 클립보드 설정 실패 (3회 시도)")
                time.sleep(0.1)

        # 2. 채팅방 포그라운드 → Ctrl+V → Enter
        self.bring_to_front(self.chat_hwnd)
        time.sleep(0.3)
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(1.5)
        pyautogui.press('enter')
        time.sleep(file_delay)

    def go_to_friend_tab(self):
        """카카오톡 메인 창에서 친구 탭(Ctrl+1)으로 전환"""
        if self.main_hwnd:
            self.send_ctrl_key(self.main_hwnd, '1')
            time.sleep(0.5)

    def close_chat(self, friend_name: str = ""):
        """채팅방 닫기 — WM_CLOSE → ESC 폴백 → 검증"""
        if not self.chat_hwnd:
            return

        # 1차: WM_CLOSE로 직접 닫기 (가장 확실)
        try:
            win32gui.PostMessage(self.chat_hwnd, win32con.WM_CLOSE, 0, 0)
            time.sleep(1.0)
        except Exception:
            pass

        if friend_name and not self.find_chat_window(friend_name):
            self.chat_hwnd = None
            return

        # 2차: ESC (pyautogui)
        self.bring_to_front(self.chat_hwnd)
        time.sleep(0.2)
        self.send_escape()
        self.send_escape()
        time.sleep(0.5)

        if friend_name and not self.find_chat_window(friend_name):
            self.chat_hwnd = None
            return

        # 3차: ESC + WM_CLOSE 재시도
        log.warning(f"  채팅방 닫기 재시도: {friend_name}")
        self.send_escape()
        time.sleep(0.3)
        try:
            win32gui.PostMessage(self.chat_hwnd, win32con.WM_CLOSE, 0, 0)
            time.sleep(0.5)
        except Exception:
            pass
        self.chat_hwnd = None

        # 채팅방 닫은 후 메인 창 복원 (다음 검색을 위해)
        time.sleep(0.5)
        self.go_to_friend_tab()
        time.sleep(1.0)


# ─── 카카오톡 프로세스 관리 ───

def is_kakao_running() -> bool:
    result = subprocess.run(
        ["tasklist", "/FI", "IMAGENAME eq KakaoTalk.exe"],
        capture_output=True, text=True
    )
    return "KakaoTalk.exe" in result.stdout


def ensure_kakao_running(config: dict) -> bool:
    if is_kakao_running():
        log.info("카카오톡 실행 중 확인 ✅")
        return True

    log.warning("카카오톡이 꺼져있습니다. 실행합니다...")
    kakao_path = config.get("kakao_path", r"C:\Program Files (x86)\Kakao\KakaoTalk\KakaoTalk.exe")
    try:
        subprocess.Popen([kakao_path])
        log.info("카카오톡 실행됨, 90초 대기...")
        time.sleep(90)
        return is_kakao_running()
    except Exception as e:
        log.error(f"카카오톡 실행 실패: {e}")
        return False


def restart_kakao(config: dict) -> bool:
    log.info("카카오톡 재시작 중...")
    subprocess.run(["taskkill", "/F", "/IM", "KakaoTalk.exe"], capture_output=True)
    time.sleep(30)
    kakao_path = config.get("kakao_path", r"C:\Program Files (x86)\Kakao\KakaoTalk\KakaoTalk.exe")
    try:
        subprocess.Popen([kakao_path])
        log.info("카카오톡 실행됨, 60초 대기...")
        time.sleep(60)
        return is_kakao_running()
    except Exception as e:
        log.error(f"카카오톡 실행 실패: {e}")
        return False


# ─── 메인 발송 루프 ───

def run_macro():
    config = load_config()
    api = ServerAPI(config)

    log.info(f"=== 매크로 시작 — {config['device_id']} ===")

    if not acquire_lock():
        return

    try:
        _run_macro_inner(config, api)
    except Exception as e:
        log.error(f"예상치 못한 오류: {e}")
    finally:
        release_lock()
        log.info("=== 매크로 종료 ===")


def _run_macro_inner(config: dict, api: ServerAPI):
    # 0. 카카오톡 실행 확인
    if not ensure_kakao_running(config):
        log.error("카카오톡을 실행할 수 없습니다.")
        api.send_heartbeat(0, 0, 0, 0)
        return

    # 카카오톡 컨트롤러 초기화
    kakao = KakaoController()
    if not kakao.find_main_window():
        log.error("카카오톡 메인 창을 찾을 수 없습니다.")
        api.send_heartbeat(0, 0, 0, 0)
        return
    log.info(f"카카오톡 창 발견 (hwnd: {kakao.main_hwnd})")

    # 1. 대기열 + 설정 + 이미지 수신
    response = api.get_queue()
    queue = response.get("data", [])
    server_settings = response.get("settings", {})
    image_list = response.get("images", [])

    if not queue:
        log.info("오늘 발송 대기열이 없습니다.")
        return

    total = len(queue)
    log.info(f"대기열 수신: {total}건")

    # 서버 설정 적용
    if server_settings.get("send_message_delay"):
        msg_delay = int(server_settings["send_message_delay"])
        config["min_delay"] = msg_delay
        config["max_delay"] = msg_delay + 2
    if server_settings.get("send_file_delay"):
        config["file_delay"] = int(server_settings["send_file_delay"])
    config.setdefault("min_delay", 3)
    config.setdefault("max_delay", 5)
    config.setdefault("file_delay", 6)
    log.info(f"발송 설정: 메시지 {config['min_delay']}~{config['max_delay']}초, 파일 {config['file_delay']}초")

    # 2. 이미지 다운로드
    download_images_from_list(image_list)

    # 3. 진행 상황 복원
    progress = load_progress()
    completed_ids = set(progress.get("completed_ids", []))
    results = progress["results"]

    if completed_ids:
        log.info(f"이전 진행 복원: {len(completed_ids)}건 완료됨")

    sent_count = sum(1 for r in results if r["status"] == "sent")
    failed_count = sum(1 for r in results if r["status"] == "failed")

    # 4. heartbeat
    last_heartbeat = time.time()

    def maybe_heartbeat():
        nonlocal last_heartbeat
        if time.time() - last_heartbeat >= 60:
            pending = total - sent_count - failed_count
            api.send_heartbeat(pending, sent_count, failed_count, total)
            last_heartbeat = time.time()

    # 5. 사람 단위 그룹화
    person_groups = []
    current_person = None
    current_items = []

    for item in queue:
        name = item["kakao_friend_name"]
        if name != current_person:
            if current_items:
                person_groups.append((current_person, current_items))
            current_person = name
            current_items = [item]
        else:
            current_items.append(item)
    if current_items:
        person_groups.append((current_person, current_items))

    # 6. 발송
    kakao_restart_attempted = False

    for person_name, items in person_groups:
        # 이미 처리한 사람 스킵 (모든 항목이 완료된 경우)
        if all(item["id"] in completed_ids for item in items):
            continue

        log.info(f"발송: {person_name} ({len(items)}건)")

        # 카카오톡 메인 창 재확인
        if not kakao.find_main_window():
            log.error("카카오톡 메인 창이 사라졌습니다.")
            break

        # ⭐ 친구 검색 + 채팅방 열림 검증
        friend_found = kakao.search_friend(person_name)
        if not friend_found:
            log.warning(f"친구 못 찾음: {person_name}")
            for item in items:
                if item["id"] in completed_ids:
                    continue
                completed_ids.add(item["id"])
                results.append({
                    "queue_id": item["id"],
                    "status": "failed",
                    "error_type": "friend_not_found",
                })
                failed_count += 1
                save_progress(completed_ids, results)
            maybe_heartbeat()
            continue

        # 메시지 발송
        person_failed = False
        for item in items:
            if item["id"] in completed_ids:
                continue  # 이전 실행에서 이미 처리됨

            try:
                # ⭐ 매 메시지 전 채팅방 열림 확인
                if not kakao.verify_chat_still_open(person_name):
                    log.warning(f"  채팅방 닫힘 — 나머지 실패: {person_name}")
                    completed_ids.add(item["id"])
                    results.append({
                        "queue_id": item["id"],
                        "status": "failed",
                        "error_type": "device_error",
                    })
                    failed_count += 1
                    person_failed = True
                    save_progress(completed_ids, results)
                    break

                if item.get("image_path") and (not item.get("message_content") or item["message_content"] == "파일"):
                    kakao.send_image_file(item["image_path"], int(config.get("file_delay", 6)))
                elif item.get("image_path"):
                    kakao.send_text_message(item["message_content"])
                    time.sleep(float(config.get("min_delay", 3)))
                    kakao.send_image_file(item["image_path"], int(config.get("file_delay", 6)))
                else:
                    kakao.send_text_message(item["message_content"])

                completed_ids.add(item["id"])
                results.append({"queue_id": item["id"], "status": "sent"})
                sent_count += 1

                delay = random.uniform(
                    float(config.get("min_delay", 3)),
                    float(config.get("max_delay", 5)),
                )
                time.sleep(delay)

            except Exception as e:
                log.error(f"발송 오류: {e}")
                person_failed = True

                completed_ids.add(item["id"])
                results.append({
                    "queue_id": item["id"],
                    "status": "failed",
                    "error_type": "device_error",
                })
                failed_count += 1
                save_progress(completed_ids, results)

                if not kakao_restart_attempted:
                    log.info("카카오톡 재시작 시도...")
                    kakao_restart_attempted = True
                    kakao.close_chat(person_name)

                    if restart_kakao(config):
                        kakao.find_main_window()
                        kakao.go_to_friend_tab()
                        break
                    else:
                        log.error("카카오톡 재시작 실패. 중단합니다.")
                        # 남은 메시지 실패 처리
                        for remaining in items:
                            if remaining["id"] not in completed_ids:
                                completed_ids.add(remaining["id"])
                                results.append({"queue_id": remaining["id"], "status": "failed", "error_type": "device_error"})
                                failed_count += 1
                        save_progress(completed_ids, results)
                        api.send_report(results, date.today().isoformat())
                        return
                else:
                    log.error("카카오톡 이미 재시작 시도함. 중단합니다.")
                    # 남은 메시지 실패 처리
                    for remaining in items:
                        if remaining["id"] not in completed_ids:
                            completed_ids.add(remaining["id"])
                            results.append({"queue_id": remaining["id"], "status": "failed", "error_type": "device_error"})
                            failed_count += 1
                    save_progress(completed_ids, results)
                    api.send_report(results, date.today().isoformat())
                    return

            save_progress(completed_ids, results)
            maybe_heartbeat()

        # 실패 시 남은 메시지도 실패 처리 (서버에 빈 건이 없도록)
        if person_failed:
            for remaining in items:
                if remaining["id"] not in completed_ids:
                    completed_ids.add(remaining["id"])
                    results.append({
                        "queue_id": remaining["id"],
                        "status": "failed",
                        "error_type": "device_error",
                    })
                    failed_count += 1
            save_progress(completed_ids, results)

        # ⭐ 채팅방 닫기 + 검증
        if not person_failed:
            kakao.close_chat(person_name)

    # 7. 최종 보고
    log.info(f"발송 완료: 성공 {sent_count}, 실패 {failed_count}, 총 {total}")
    api.send_report(results, date.today().isoformat())

    if PROGRESS_PATH.exists():
        PROGRESS_PATH.unlink()


def run_test():
    """설치 후 자동 테스트 — 서버 연결 + 카카오톡 조작까지 전체 검증"""
    config = load_config()
    print("")
    print("=" * 50)
    print("  1D1M 매크로 설치 테스트")
    print("=" * 50)
    print("")

    all_ok = True

    # 1. 서버 연결 + 이미지 다운로드
    print("[1/7] 서버 연결 테스트...")
    api = ServerAPI(config)
    test_images = []
    try:
        response = api.get_queue()
        queue_data = response.get("data", [])
        test_images = response.get("images", [])
        print(f"  ✅ 서버 연결 성공 (대기열 {len(queue_data)}건, 이미지 {len(test_images)}개)")

        # 이미지 다운로드 (실제 매크로와 동일)
        if test_images:
            print("  이미지 다운로드 중...")
            download_images_from_list(test_images)
        else:
            print("  이미지 없음 (대기열에 이미지 메시지가 없음)")
    except Exception as e:
        print(f"  ❌ 서버 연결 실패: {e}")
        all_ok = False

    # 2. 카카오톡 실행 확인
    print("[2/7] 카카오톡 실행 확인...")
    if is_kakao_running():
        print("  ✅ 카카오톡 실행 중")
    else:
        print("  ❌ 카카오톡이 꺼져있습니다. 먼저 카카오톡을 실행하세요.")
        all_ok = False
        print("")
        print("  카카오톡을 실행한 후 다시 테스트하세요:")
        print("  python macro.py --test")
        return False

    # 3. 카카오톡 메인 창 찾기
    print("[3/7] 카카오톡 메인 창 탐색...")
    kakao = KakaoController()
    if kakao.find_main_window():
        print(f"  ✅ 카카오톡 메인 창 발견 (hwnd: {kakao.main_hwnd})")
    else:
        print("  ❌ 카카오톡 메인 창을 찾을 수 없습니다")
        all_ok = False
        return False

    # 4. 검색 입력창 찾기 (EVA 구조 탐색)
    print("[4/7] 검색 입력창 탐색 (EVA 구조)...")
    search_edit = kakao.find_search_edit()
    if search_edit:
        print(f"  ✅ 검색 입력창 발견 (hwnd: {search_edit})")
    else:
        print("  ⚠️ EVA 구조로 못 찾음 — Ctrl+F 폴백 테스트...")
        kakao.send_ctrl_key(kakao.main_hwnd, 'F')
        time.sleep(0.5)
        search_edit = kakao.find_search_edit()
        if search_edit:
            print(f"  ✅ Ctrl+F 후 검색 입력창 발견 (hwnd: {search_edit})")
        else:
            print("  ❌ 검색 입력창을 찾을 수 없습니다")
            all_ok = False

    # 5. 친구 검색 + 메시지 전송 + 채팅방 닫기 테스트
    print("[5/7] 카카오톡 발송 테스트...")
    print("")
    test_name = input("  테스트할 카카오톡 친구 이름을 입력하세요: ").strip()

    if not test_name:
        print("  ❌ 이름을 입력해주세요")
        return False

    # === 1차: 검색 → 3건 전송 → 닫기 ===
    print("")
    print(f"  ── 1차 테스트: '{test_name}' 검색 + 메시지 3건 ──")
    print(f"  친구 검색 중...")
    found = kakao.search_friend(test_name)
    if not found:
        print(f"  ❌ 친구 '{test_name}'을 찾을 수 없습니다")
        print("     카카오톡 친구 목록에 이 이름이 정확히 있는지 확인하세요.")
        return False

    print(f"  ✅ 채팅방 열림 확인")

    # 메시지 입력창 찾기
    chat_edit = kakao.find_chat_edit()
    if not chat_edit:
        print("  ❌ 메시지 입력창(RichEdit50W)을 찾을 수 없습니다")
        kakao.close_chat(test_name)
        return False
    print(f"  ✅ 메시지 입력창 발견")

    # 메시지 3건 전송
    test_messages_1 = [
        "[1D1M 테스트 1/3] 매크로 설치 테스트입니다.",
        "[1D1M 테스트 2/3] 메시지가 순서대로 도착하면 정상입니다.",
        "[1D1M 테스트 3/3] 1차 테스트 완료!",
    ]
    for i, msg in enumerate(test_messages_1):
        try:
            kakao.send_text_message(msg)
            print(f"  ✅ 메시지 {i+1}/3 전송 완료")
            time.sleep(2)
        except Exception as e:
            print(f"  ❌ 메시지 {i+1}/3 전송 실패: {e}")
            all_ok = False
            break

    # 채팅방 닫기
    print("  채팅방 닫는 중...")
    kakao.close_chat(test_name)
    time.sleep(1)
    if not kakao.find_chat_window(test_name):
        print("  ✅ 채팅방 닫힘 확인")
    else:
        print("  ❌ 채팅방이 안 닫혔습니다")
        all_ok = False

    # === 2차: 다시 검색 → 텍스트 1건 + 이미지 1건 + 텍스트 1건 → 닫기 ===
    print("")
    print(f"  ── 2차 테스트: 재검색 + 텍스트 + 이미지 + 텍스트 ──")
    time.sleep(2)
    print(f"  친구 재검색 중...")
    found2 = kakao.search_friend(test_name)
    if not found2:
        print(f"  ❌ 2차 검색 실패: '{test_name}'")
        all_ok = False
    else:
        print(f"  ✅ 채팅방 다시 열림 확인")

        chat_edit2 = kakao.find_chat_edit()
        if not chat_edit2:
            print("  ❌ 2차 메시지 입력창을 찾을 수 없습니다")
            all_ok = False
        else:
            # 텍스트 1건
            try:
                kakao.send_text_message("[1D1M 테스트 4/6] 2차 테스트 시작 — 다음은 이미지입니다")
                print("  ✅ 메시지 4/6 전송 완료 (텍스트)")
                time.sleep(2)
            except Exception as e:
                print(f"  ❌ 메시지 4/6 전송 실패: {e}")
                all_ok = False

            # 이미지 1건 — 이미 다운로드된 이미지 사용
            try:
                # images/ 폴더에서 첫 번째 이미지 파일 찾기
                image_files = list(IMAGES_DIR.glob("*.jpg")) + list(IMAGES_DIR.glob("*.png")) + list(IMAGES_DIR.glob("*.bmp"))
                if image_files:
                    test_img = image_files[0]
                    print(f"  로컬 이미지 사용: {test_img.name} ({test_img.stat().st_size // 1024}KB)")
                    kakao.send_image_file(str(test_img), file_delay=3)
                    print("  ✅ 메시지 5/6 전송 완료 (이미지)")
                else:
                    print("  ⏭️ 이미지 파일 없음 — 이미지 테스트 스킵")
                    print("     (대기열에 이미지 메시지가 없으면 정상입니다)")
                time.sleep(2)
            except Exception as e:
                print(f"  ❌ 메시지 5/6 이미지 전송 실패: {e}")
                all_ok = False

            # 텍스트 1건
            try:
                kakao.send_text_message("[1D1M 테스트 6/6] 모든 테스트 완료! 텍스트+이미지 정상 ✅")
                print("  ✅ 메시지 6/6 전송 완료 (텍스트)")
                time.sleep(2)
            except Exception as e:
                print(f"  ❌ 메시지 6/6 전송 실패: {e}")
                all_ok = False

        # 채팅방 닫기
        print("  채팅방 닫는 중...")
        kakao.close_chat(test_name)
        time.sleep(1)
        if not kakao.find_chat_window(test_name):
            print("  ✅ 채팅방 닫힘 확인")
        else:
            print("  ❌ 채팅방이 안 닫혔습니다")
            all_ok = False

    # 결과
    print("")
    print("=" * 50)
    if all_ok:
        print("  ✅ 모든 테스트 통과! 매크로 사용 준비 완료")
    else:
        print("  ⚠️ 일부 테스트 실패 — 위 ❌ 항목을 확인하세요")
    print("=" * 50)
    print("")
    print("  실제 발송: 대시보드에서 대기열 생성 후")
    print("  python macro.py")
    print("")
    return all_ok


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        run_test()
    else:
        run_macro()
