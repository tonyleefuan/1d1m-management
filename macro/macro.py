"""
1D1M KakaoTalk Macro — 카카오톡 자동 발송 프로그램
서버에서 대기열을 받아 카카오톡으로 메시지를 순차 발송합니다.
"""

import json
import os
import sys
import time
import logging
import random
import requests
import pyautogui
import pyperclip
import subprocess
import tempfile
from datetime import datetime, date
from pathlib import Path
from typing import Optional

# ─── 설정 ───

BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "config.json"
PROGRESS_PATH = BASE_DIR / "progress.json"
LOCK_PATH = BASE_DIR / "macro.lock"
IMAGES_DIR = BASE_DIR / "images"
LOG_DIR = BASE_DIR / "logs"

# 로깅 설정
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

# pyautogui 안전 설정
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.5


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        log.error("config.json이 없습니다. config.example.json을 복사하세요.")
        sys.exit(1)
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


# ─── 중복 실행 방지 ───

def acquire_lock() -> bool:
    """매크로 중복 실행 방지 — 락 파일 생성"""
    if LOCK_PATH.exists():
        # 락 파일이 있으면 PID 확인
        try:
            pid = int(LOCK_PATH.read_text().strip())
            # 해당 PID가 아직 실행 중인지 확인
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}"],
                capture_output=True, text=True
            )
            if f"{pid}" in result.stdout and "python" in result.stdout.lower():
                log.error(f"매크로가 이미 실행 중입니다 (PID: {pid}). 종료합니다.")
                return False
        except (ValueError, Exception):
            pass  # 락 파일 깨졌으면 무시하고 새로 만듦

    LOCK_PATH.write_text(str(os.getpid()))
    return True


def release_lock():
    """락 파일 제거"""
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
        """오늘 발송 대기열 + 발송 설정 + 이미지 목록 조회"""
        try:
            res = requests.get(
                f"{self.base_url}/api/macro/queue",
                params={"device_id": self.device_id},
                headers=self.headers,
                timeout=60,
            )
            res.raise_for_status()
            return res.json()
        except Exception as e:
            log.error(f"대기열 조회 실패: {e}")
            return {"data": [], "settings": {}, "images": []}

    def send_heartbeat(self, pending: int, sent: int, failed: int, total: int):
        """진행 상황 보고 (1분마다)"""
        try:
            requests.post(
                f"{self.base_url}/api/macro/heartbeat",
                headers=self.headers,
                json={
                    "device_id": self.device_id,
                    "pending": pending,
                    "sent": sent,
                    "failed": failed,
                    "total": total,
                },
                timeout=10,
            )
        except Exception as e:
            log.warning(f"Heartbeat 실패 (무시): {e}")

    def send_report(self, results: list, report_date: str) -> bool:
        """발송 결과 보고"""
        for attempt in range(3):
            try:
                res = requests.post(
                    f"{self.base_url}/api/macro/report",
                    headers=self.headers,
                    json={
                        "device_id": self.device_id,
                        "date": report_date,
                        "results": results,
                    },
                    timeout=120,
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
    """서버에서 받은 이미지 URL 목록을 로컬에 다운로드 (캐싱)"""
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
                    local_time = local_path.stat().st_mtime
                    if server_time <= local_time:
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

    log.info(f"이미지 다운로드 완료: {downloaded}개 새로 받음, {len(image_urls) - downloaded}개 캐시 사용")


# ─── 진행 상황 관리 ───

def load_progress() -> dict:
    if PROGRESS_PATH.exists():
        try:
            with open(PROGRESS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if data.get("date") == date.today().isoformat():
                    return data
        except (json.JSONDecodeError, Exception) as e:
            log.warning(f"progress.json 읽기 실패 (초기화): {e}")
    return {"date": date.today().isoformat(), "last_index": -1, "results": []}


def save_progress(last_index: int, results: list):
    """진행 상황 안전하게 저장 (임시 파일 → 이름 변경)"""
    tmp_path = PROGRESS_PATH.with_suffix(".tmp")
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(
                {"date": date.today().isoformat(), "last_index": last_index, "results": results},
                f,
                ensure_ascii=False,
            )
        # 원자적 교체 (Windows에서는 먼저 삭제 필요)
        if PROGRESS_PATH.exists():
            PROGRESS_PATH.unlink()
        tmp_path.rename(PROGRESS_PATH)
    except Exception as e:
        log.warning(f"progress 저장 실패: {e}")


# ─── 카카오톡 자동화 ───

SEARCH_ICON = BASE_DIR / "images_ui" / "search.png"
FRIEND_TAB_ICON = BASE_DIR / "images_ui" / "friend_tab.png"


def find_and_click_image(image_path: str, confidence: float = 0.8, timeout: int = 10) -> bool:
    """화면에서 이미지를 찾아 클릭"""
    start = time.time()
    while time.time() - start < timeout:
        try:
            location = pyautogui.locateOnScreen(image_path, confidence=confidence)
            if location:
                center = pyautogui.center(location)
                pyautogui.click(center)
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def focus_kakao():
    """카카오톡 창을 최상단으로 가져오기"""
    try:
        import ctypes
        import win32gui
        import win32con

        def find_kakao(hwnd, _):
            if "카카오톡" in win32gui.GetWindowText(hwnd):
                win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                win32gui.SetForegroundWindow(hwnd)
                return False  # 찾았으면 중단
            return True

        try:
            win32gui.EnumWindows(find_kakao, None)
        except Exception:
            pass
        time.sleep(0.5)
    except ImportError:
        # win32gui 없으면 Alt+Tab으로 시도
        log.warning("pywin32 없음 — Alt+Tab으로 카카오톡 전환 시도")
        pyautogui.hotkey("alt", "tab")
        time.sleep(1)


def get_kakao_main_window():
    """카카오톡 메인 창의 위치와 크기 반환"""
    try:
        import win32gui
        result = {"hwnd": None, "rect": None}

        def find_main(hwnd, _):
            title = win32gui.GetWindowText(hwnd)
            if title == "카카오톡" and win32gui.IsWindowVisible(hwnd):
                result["hwnd"] = hwnd
                result["rect"] = win32gui.GetWindowRect(hwnd)
                return False
            return True

        try:
            win32gui.EnumWindows(find_main, None)
        except Exception:
            pass
        return result
    except ImportError:
        return {"hwnd": None, "rect": None}


def go_to_friend_tab():
    """카카오톡 친구 탭으로 이동 — 3단계 시도"""
    # 방법 1: Ctrl+1 단축키
    pyautogui.hotkey("ctrl", "1")
    time.sleep(0.5)

    # 방법 2: 이미지 매칭
    if FRIEND_TAB_ICON.exists():
        try:
            location = pyautogui.locateOnScreen(str(FRIEND_TAB_ICON), confidence=0.8)
            if location:
                pyautogui.click(pyautogui.center(location))
                time.sleep(0.5)
                return
        except Exception:
            pass

    # 방법 3: 카카오톡 창 좌표 기반 클릭
    # 친구 탭은 왼쪽 세로 사이드바 최상단 아이콘
    kakao = get_kakao_main_window()
    if kakao["rect"]:
        left, top, right, bottom = kakao["rect"]
        tab_x = left + 40  # 사이드바 중앙 (약 40px)
        tab_y = top + 60   # 상단에서 약 60px (첫 번째 아이콘)
        pyautogui.click(tab_x, tab_y)
        time.sleep(0.5)


def open_search() -> bool:
    """카카오톡 검색창 열기 — 3단계 시도"""
    # 방법 1: Ctrl+F 단축키
    pyautogui.hotkey("ctrl", "f")
    time.sleep(0.5)

    # 방법 2: 이미지 매칭
    if SEARCH_ICON.exists():
        try:
            location = pyautogui.locateOnScreen(str(SEARCH_ICON), confidence=0.8)
            if location:
                pyautogui.click(pyautogui.center(location))
                time.sleep(0.5)
                return True
        except Exception:
            pass

    # 방법 3: 카카오톡 창 좌표 기반 클릭
    # 검색 아이콘은 "친구" 타이틀 오른쪽의 🔍 아이콘
    kakao = get_kakao_main_window()
    if kakao["rect"]:
        left, top, right, bottom = kakao["rect"]
        search_x = right - 70  # 오른쪽에서 약 70px 안쪽 (🔍 위치)
        search_y = top + 45    # 상단에서 약 45px (타이틀바 아래)
        pyautogui.click(search_x, search_y)
        time.sleep(0.5)

    return True


def get_all_window_titles() -> list:
    """현재 열려있는 모든 윈도우 창 제목 목록"""
    titles = []
    try:
        import win32gui
        def callback(hwnd, _):
            title = win32gui.GetWindowText(hwnd)
            if title:
                titles.append(title)
        win32gui.EnumWindows(callback, None)
    except ImportError:
        pass
    return titles


def verify_chat_opened(expected_name: str) -> bool:
    """채팅방이 열렸는지 창 제목으로 확인

    카카오톡은 채팅방을 열면 별도 창이 생기고,
    그 창의 제목이 상대방 이름임.
    """
    titles = get_all_window_titles()
    for title in titles:
        # 채팅방 제목에 이름이 포함되어 있는지 확인
        if expected_name in title:
            return True
    return False


def verify_chat_closed(expected_name: str) -> bool:
    """채팅방이 닫혔는지 창 제목으로 확인"""
    titles = get_all_window_titles()
    for title in titles:
        if expected_name in title:
            return False  # 아직 열려있음
    return True


def search_friend(name: str) -> bool:
    """카카오톡 친구 목록에서 이름 검색 → 1:1 채팅방 열기

    중요: 반드시 친구 탭에서 검색해야 함 (채팅 탭 아님)
    3단계 검증:
      1. 친구 탭 → 검색 → 이름 입력 → 선택
      2. 창 제목으로 채팅방 열림 확인
      3. 실패 시 ESC로 복구 후 False 반환
    """
    # 1. 친구 탭으로 이동
    go_to_friend_tab()

    # 2. 검색창 열기
    if not open_search():
        log.warning("검색창을 열 수 없습니다")
        return False

    time.sleep(random.uniform(0.3, 0.5))

    # 3. 기존 검색어 지우기
    pyautogui.hotkey("ctrl", "a")
    pyautogui.press("delete")
    time.sleep(0.3)

    # 4. 이름 입력 (pyperclip으로 한글 지원)
    pyperclip.copy(name)
    pyautogui.hotkey("ctrl", "v")
    time.sleep(random.uniform(1.5, 2.0))  # 검색 결과 로딩 대기

    # 5. 첫 번째 결과 선택 (down → enter)
    pyautogui.press("down")
    time.sleep(0.3)
    pyautogui.press("enter")
    time.sleep(random.uniform(1.0, 1.5))

    # ⭐ 6. 검증: 채팅방이 열렸는지 창 제목으로 확인
    if verify_chat_opened(name):
        log.info(f"  채팅방 확인 ✅: {name}")
        return True

    # 한번 더 시도 (약간 대기 후)
    time.sleep(1.0)
    if verify_chat_opened(name):
        log.info(f"  채팅방 확인 ✅ (2차): {name}")
        return True

    # 실패 — 검색 결과가 없거나 엉뚱한 곳이 열림
    log.warning(f"  채팅방 확인 ❌: {name} — 친구 못 찾음")
    # ESC로 혹시 열린 엉뚱한 창 닫기
    pyautogui.press("escape")
    time.sleep(0.3)
    pyautogui.press("escape")
    time.sleep(0.3)
    return False


def send_text_message(text: str):
    """현재 열린 채팅방에 텍스트 메시지 전송"""
    pyperclip.copy(text)
    pyautogui.hotkey("ctrl", "v")
    time.sleep(0.3)
    pyautogui.press("enter")


def send_image_file(image_path: str, config: dict):
    """현재 열린 채팅방에 이미지 파일 전송"""
    filename = image_path.split("/")[-1]
    local_path = IMAGES_DIR / filename

    if not local_path.exists():
        log.warning(f"이미지 파일 없음: {local_path}")
        raise FileNotFoundError(f"이미지 파일 없음: {local_path}")

    # Ctrl+T로 파일 전송 대화상자 열기
    pyautogui.hotkey("ctrl", "t")
    time.sleep(1.5)

    # 파일 경로 입력
    pyperclip.copy(str(local_path))
    pyautogui.hotkey("ctrl", "v")
    time.sleep(0.5)
    pyautogui.press("enter")
    time.sleep(1.5)
    pyautogui.press("enter")  # 전송 확인
    time.sleep(float(config.get("file_delay", 6)))


def force_close_chat_window(friend_name: str):
    """ESC가 안 먹힐 때 pywin32로 채팅방 창을 직접 닫기"""
    try:
        import win32gui
        import win32con

        def close_matching(hwnd, _):
            title = win32gui.GetWindowText(hwnd)
            if friend_name in title and title != "카카오톡":
                win32gui.PostMessage(hwnd, win32con.WM_CLOSE, 0, 0)
            return True

        win32gui.EnumWindows(close_matching, None)
        time.sleep(0.5)
    except Exception as e:
        log.warning(f"  강제 닫기 실패: {e}")


def close_chat(friend_name: str = ""):
    """채팅방 닫기 — ESC → 검증 → 안 되면 강제 닫기"""
    # 1차: ESC
    pyautogui.press("escape")
    time.sleep(0.3)
    pyautogui.press("escape")
    time.sleep(0.5)

    if not friend_name:
        return

    # 2차: 확인
    if verify_chat_closed(friend_name):
        return

    # 3차: ESC 재시도
    log.warning(f"  채팅방 안 닫힘, ESC 재시도: {friend_name}")
    pyautogui.press("escape")
    time.sleep(0.5)
    pyautogui.press("escape")
    time.sleep(0.5)

    if verify_chat_closed(friend_name):
        return

    # 4차: pywin32로 강제 닫기
    log.warning(f"  ESC 실패, 창 강제 닫기: {friend_name}")
    force_close_chat_window(friend_name)

    if not verify_chat_closed(friend_name):
        log.error(f"  채팅방 닫기 완전 실패: {friend_name}")


def is_kakao_running() -> bool:
    """카카오톡이 실행 중인지 확인"""
    result = subprocess.run(
        ["tasklist", "/FI", "IMAGENAME eq KakaoTalk.exe"],
        capture_output=True, text=True
    )
    return "KakaoTalk.exe" in result.stdout


def ensure_kakao_running(config: dict) -> bool:
    """카카오톡이 꺼져있으면 실행, 이미 실행 중이면 스킵"""
    if is_kakao_running():
        log.info("카카오톡 실행 중 확인 ✅")
        return True

    log.warning("카카오톡이 꺼져있습니다. 실행합니다...")
    kakao_path = config.get("kakao_path", r"C:\Program Files (x86)\Kakao\KakaoTalk\KakaoTalk.exe")

    try:
        subprocess.Popen([kakao_path])
        log.info("카카오톡 실행됨, 90초 대기 (로그인 + 로딩)...")
        time.sleep(90)

        if is_kakao_running():
            log.info("카카오톡 실행 확인 ✅")
            return True
        else:
            log.error("카카오톡 실행 실패")
            return False
    except Exception as e:
        log.error(f"카카오톡 실행 실패: {e}")
        return False


def restart_kakao(config: dict) -> bool:
    """카카오톡 재시작 (먹통 시 사용)"""
    log.info("카카오톡 재시작 중...")

    subprocess.run(["taskkill", "/F", "/IM", "KakaoTalk.exe"], capture_output=True)
    time.sleep(30)

    kakao_path = config.get("kakao_path", r"C:\Program Files (x86)\Kakao\KakaoTalk\KakaoTalk.exe")
    try:
        subprocess.Popen([kakao_path])
        log.info("카카오톡 실행됨, 60초 대기...")
        time.sleep(60)
        return True
    except Exception as e:
        log.error(f"카카오톡 실행 실패: {e}")
        return False


# ─── 메인 발송 루프 ───

def run_macro():
    config = load_config()
    api = ServerAPI(config)

    log.info(f"=== 매크로 시작 — {config['device_id']} ===")

    # 0-a. 중복 실행 방지
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
    # 0-b. 카카오톡 실행 확인 (꺼져있으면 자동 실행)
    if not ensure_kakao_running(config):
        log.error("카카오톡을 실행할 수 없습니다. 매크로를 종료합니다.")
        api.send_heartbeat(0, 0, 0, 0)
        return

    # 0-c. 카카오톡 창 포커스
    focus_kakao()

    # 1. 대기열 + 설정 + 이미지 목록 수신
    response = api.get_queue()
    queue = response.get("data", [])
    server_settings = response.get("settings", {})
    image_list = response.get("images", [])

    if not queue:
        log.info("오늘 발송 대기열이 없습니다.")
        return

    total = len(queue)
    log.info(f"대기열 수신: {total}건")

    # 서버 발송 설정 적용
    if server_settings.get("send_message_delay"):
        msg_delay = int(server_settings["send_message_delay"])
        config["min_delay"] = msg_delay
        config["max_delay"] = msg_delay + 2
    if server_settings.get("send_file_delay"):
        config["file_delay"] = int(server_settings["send_file_delay"])
    log.info(f"발송 설정: 메시지 {config['min_delay']}~{config['max_delay']}초, 파일 {config['file_delay']}초")

    # 2. 이미지 다운로드
    download_images_from_list(image_list)

    # 3. 진행 상황 확인 (재시작 시)
    progress = load_progress()
    start_index = progress["last_index"] + 1
    results = progress["results"]

    if start_index > 0:
        log.info(f"이전 진행 상황 복원: {start_index}번부터 이어서")

    sent_count = sum(1 for r in results if r["status"] == "sent")
    failed_count = sum(1 for r in results if r["status"] == "failed")

    # 4. heartbeat 타이머
    last_heartbeat = time.time()
    HEARTBEAT_INTERVAL = 60

    def maybe_heartbeat():
        nonlocal last_heartbeat
        now = time.time()
        if now - last_heartbeat >= HEARTBEAT_INTERVAL:
            pending = total - sent_count - failed_count
            api.send_heartbeat(pending, sent_count, failed_count, total)
            last_heartbeat = now

    # 5. 사람 단위로 그룹화
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
    global_index = -1
    kakao_restart_attempted = False

    for person_name, items in person_groups:
        # 이미 처리한 사람 스킵
        if global_index + len(items) < start_index:
            global_index += len(items)
            continue

        # 카카오톡 포커스 확인 (매 사람마다)
        focus_kakao()

        # 친구 검색
        log.info(f"발송: {person_name} ({len(items)}건)")

        friend_found = search_friend(person_name)
        if not friend_found:
            log.warning(f"친구 못 찾음: {person_name}")
            for item in items:
                global_index += 1
                if global_index < start_index:
                    continue
                results.append({
                    "queue_id": item["id"],
                    "status": "failed",
                    "error_type": "friend_not_found",
                })
                failed_count += 1
                save_progress(global_index, results)
            maybe_heartbeat()
            continue

        # 메시지 발송
        person_failed = False
        for item in items:
            global_index += 1
            if global_index < start_index:
                continue

            try:
                # ⭐ 발송 전 확인: 채팅방이 아직 열려있는지
                if not verify_chat_opened(person_name):
                    log.warning(f"  채팅방이 닫혔음 — 나머지 메시지 실패 처리: {person_name}")
                    results.append({
                        "queue_id": item["id"],
                        "status": "failed",
                        "error_type": "device_error",
                    })
                    failed_count += 1
                    person_failed = True
                    save_progress(global_index, results)
                    break  # 이 사람의 나머지 메시지도 아래에서 실패 처리

                if item.get("image_path") and (not item.get("message_content") or item["message_content"] == "파일"):
                    # 이미지만 전송
                    send_image_file(item["image_path"], config)
                elif item.get("image_path"):
                    # 텍스트 + 이미지
                    send_text_message(item["message_content"])
                    delay = float(config.get("min_delay", 3))
                    time.sleep(delay)
                    send_image_file(item["image_path"], config)
                else:
                    # 텍스트만 전송
                    send_text_message(item["message_content"])

                results.append({"queue_id": item["id"], "status": "sent"})
                sent_count += 1

                # 메시지 간 딜레이
                delay = random.uniform(
                    float(config.get("min_delay", 3)),
                    float(config.get("max_delay", 5)),
                )
                time.sleep(delay)

            except pyautogui.FailSafeException:
                log.error("FailSafe 발동 — 마우스가 화면 모서리에 감지됨. 중단합니다.")
                save_progress(global_index - 1, results)
                api.send_report(results, date.today().isoformat())
                return

            except Exception as e:
                log.error(f"발송 오류: {e}")
                person_failed = True

                if not kakao_restart_attempted:
                    log.info("카카오톡 재시작 시도...")
                    kakao_restart_attempted = True
                    close_chat(person_name)

                    if restart_kakao(config):
                        focus_kakao()
                        go_to_friend_tab()
                        results.append({
                            "queue_id": item["id"],
                            "status": "failed",
                            "error_type": "device_error",
                        })
                        failed_count += 1
                        save_progress(global_index, results)
                        break
                    else:
                        log.error("카카오톡 재시작 실패. 중단합니다.")
                        results.append({
                            "queue_id": item["id"],
                            "status": "failed",
                            "error_type": "device_error",
                        })
                        failed_count += 1
                        save_progress(global_index, results)
                        api.send_report(results, date.today().isoformat())
                        return
                else:
                    log.error("카카오톡 이미 재시작 시도함. 중단합니다.")
                    results.append({
                        "queue_id": item["id"],
                        "status": "failed",
                        "error_type": "device_error",
                    })
                    failed_count += 1
                    save_progress(global_index, results)
                    api.send_report(results, date.today().isoformat())
                    return

            save_progress(global_index, results)
            maybe_heartbeat()

        # 채팅방 닫기 (창 제목으로 닫힘 확인)
        if not person_failed:
            close_chat(person_name)

    # 7. 최종 보고
    log.info(f"발송 완료: 성공 {sent_count}, 실패 {failed_count}, 총 {total}")
    success = api.send_report(results, date.today().isoformat())
    if not success:
        log.error("결과 보고 실패! progress.json에 결과가 남아있습니다.")

    # progress 초기화
    if PROGRESS_PATH.exists():
        PROGRESS_PATH.unlink()


if __name__ == "__main__":
    run_macro()
