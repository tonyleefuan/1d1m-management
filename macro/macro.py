"""
1D1M KakaoTalk Macro — 카카오톡 자동 발송 프로그램 (Win32 API)

서버에서 대기열을 받아 카카오톡으로 메시지를 순차 발송합니다.
Win32 API 기반으로 모니터 없이도 동작합니다.
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
import win32process

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
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
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
    return {"date": date.today().isoformat(), "last_index": -1, "results": []}


def save_progress(last_index: int, results: list):
    tmp_path = PROGRESS_PATH.with_suffix(".tmp")
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(
                {"date": date.today().isoformat(), "last_index": last_index, "results": results},
                f, ensure_ascii=False,
            )
        if PROGRESS_PATH.exists():
            PROGRESS_PATH.unlink()
        tmp_path.rename(PROGRESS_PATH)
    except Exception as e:
        log.warning(f"progress 저장 실패: {e}")


# ─── Win32 카카오톡 자동화 ───

class KakaoController:
    """Win32 API로 카카오톡을 제어 — 모니터 없이 동작

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
        """특정 이름의 채팅방 창 찾기"""
        self.chat_hwnd = None
        def callback(hwnd, _):
            if win32gui.IsWindowVisible(hwnd):
                title = win32gui.GetWindowText(hwnd)
                if friend_name in title and title != "카카오톡":
                    self.chat_hwnd = hwnd
                    return False
            return True
        try:
            win32gui.EnumWindows(callback, None)
        except Exception:
            pass
        return self.chat_hwnd is not None

    def find_chat_edit(self) -> int:
        """현재 채팅방의 메시지 입력창 핸들 찾기

        카카오톡 버전에 따라 클래스명이 다를 수 있음:
        - "RichEdit50W" (일반적)
        - "RICHEDIT50W" (일부 버전)
        """
        if not self.chat_hwnd:
            return 0
        try:
            edit = win32gui.FindWindowEx(self.chat_hwnd, None, "RichEdit50W", None)
            if not edit:
                edit = win32gui.FindWindowEx(self.chat_hwnd, None, "RICHEDIT50W", None)
            return edit or 0
        except Exception:
            return 0

    # ─── 키 입력 ───

    def send_return(self, hwnd: int):
        """엔터키 전송 (PostMessage — 포그라운드 불필요)"""
        win32api.PostMessage(hwnd, win32con.WM_KEYDOWN, win32con.VK_RETURN, 0)
        time.sleep(0.01)
        win32api.PostMessage(hwnd, win32con.WM_KEYUP, win32con.VK_RETURN, 0)
        time.sleep(0.1)

    def send_escape_msg(self, hwnd: int):
        """ESC키 전송"""
        win32api.PostMessage(hwnd, win32con.WM_KEYDOWN, win32con.VK_ESCAPE, 0)
        time.sleep(0.01)
        win32api.PostMessage(hwnd, win32con.WM_KEYUP, win32con.VK_ESCAPE, 0)
        time.sleep(0.1)

    def set_text(self, hwnd: int, text: str):
        """윈도우 컨트롤에 텍스트 직접 설정 (WM_SETTEXT)"""
        win32api.SendMessage(hwnd, win32con.WM_SETTEXT, 0, text)
        time.sleep(0.1)

    def set_clipboard_text(self, text: str):
        """클립보드에 텍스트 복사"""
        win32clipboard.OpenClipboard()
        try:
            win32clipboard.EmptyClipboard()
            win32clipboard.SetClipboardText(text, win32clipboard.CF_UNICODETEXT)
        finally:
            win32clipboard.CloseClipboard()

    def send_ctrl_key(self, hwnd: int, char: str):
        """Ctrl+문자 전송 — 포그라운드 필요하므로 keybd_event 사용"""
        try:
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
            win32gui.SetForegroundWindow(hwnd)
            time.sleep(0.2)
        except Exception:
            pass
        vk = ord(char.upper())
        win32api.keybd_event(win32con.VK_CONTROL, 0, 0, 0)
        time.sleep(0.05)
        win32api.keybd_event(vk, 0, 0, 0)
        time.sleep(0.05)
        win32api.keybd_event(vk, 0, win32con.KEYEVENTF_KEYUP, 0)
        win32api.keybd_event(win32con.VK_CONTROL, 0, win32con.KEYEVENTF_KEYUP, 0)
        time.sleep(0.1)

    # ─── 카카오톡 동작 ───

    def search_friend(self, name: str) -> bool:
        """친구 검색 → 채팅방 열기 → 창 제목으로 검증

        WM_SETTEXT로 검색 입력창에 직접 텍스트 설정 (키보드 시뮬레이션 없음)
        """
        if not self.main_hwnd:
            log.error("  카카오톡 메인 창 없음")
            return False

        # 1. 검색 입력창 핸들 찾기
        search_edit = self.find_search_edit()
        if not search_edit:
            log.warning("  검색 입력창을 찾을 수 없음 — Ctrl+F로 시도")
            self.send_ctrl_key(self.main_hwnd, 'F')
            time.sleep(0.5)
            search_edit = self.find_search_edit()

        if not search_edit:
            log.error("  검색 입력창을 찾을 수 없습니다")
            return False

        # 2. 검색어 직접 설정 (WM_SETTEXT — 가장 안정적)
        self.set_text(search_edit, name)
        time.sleep(random.uniform(1.5, 2.0))

        # 3. 엔터로 첫 번째 결과 열기
        self.send_return(search_edit)
        time.sleep(random.uniform(1.0, 1.5))

        # ⭐ 4. 검증: 채팅방 창이 열렸는지 확인
        if self.find_chat_window(name):
            log.info(f"  채팅방 확인 ✅: {name}")
            return True

        time.sleep(1.0)
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
        """현재 열린 채팅방에 텍스트 전송

        RichEdit50W에 WM_SETTEXT로 직접 설정 → Enter
        """
        if not self.chat_hwnd:
            raise Exception("채팅방 창이 없습니다")

        chat_edit = self.find_chat_edit()
        if not chat_edit:
            raise Exception("메시지 입력창(RichEdit50W)을 찾을 수 없습니다")

        self.set_text(chat_edit, text)
        time.sleep(0.2)
        self.send_return(chat_edit)

    def send_image_file(self, image_path: str, file_delay: int = 6):
        """현재 열린 채팅방에 이미지 파일 전송"""
        if not self.chat_hwnd:
            raise Exception("채팅방 창이 없습니다")

        filename = image_path.split("/")[-1]
        local_path = IMAGES_DIR / filename

        if not local_path.exists():
            raise FileNotFoundError(f"이미지 파일 없음: {local_path}")

        # Ctrl+T로 파일 전송 대화상자 열기
        self.send_ctrl_key(self.chat_hwnd, 'T')
        time.sleep(1.5)

        # 파일 대화상자 찾기 (#32770 = 표준 파일 대화상자)
        file_dialog = None
        for _ in range(10):
            file_dialog = win32gui.FindWindow('#32770', None)
            if file_dialog:
                break
            time.sleep(0.3)

        if file_dialog:
            # 파일명 입력란에 경로 설정
            # 파일 대화상자의 Edit 컨트롤 (ComboBoxEx32 → ComboBox → Edit)
            combo = win32gui.FindWindowEx(file_dialog, None, "ComboBoxEx32", None)
            if combo:
                combo_inner = win32gui.FindWindowEx(combo, None, "ComboBox", None)
                if combo_inner:
                    edit = win32gui.FindWindowEx(combo_inner, None, "Edit", None)
                    if edit:
                        self.set_text(edit, str(local_path))
                        time.sleep(0.5)
                        self.send_return(file_dialog)
                        time.sleep(1.5)
                        self.send_return(self.chat_hwnd)  # 전송 확인
                    else:
                        self.send_escape_msg(file_dialog)
                else:
                    self.send_escape_msg(file_dialog)
            else:
                # 구조가 다르면 클립보드 폴백
                self.set_clipboard_text(str(local_path))
                time.sleep(0.2)
                self.send_ctrl_key(file_dialog, 'V')
                time.sleep(0.5)
                self.send_return(file_dialog)
                time.sleep(1.5)
                self.send_return(self.chat_hwnd)
        else:
            log.warning("  파일 대화상자를 찾을 수 없습니다")
            self.send_escape_msg(self.chat_hwnd)

        time.sleep(file_delay)

    def close_chat(self, friend_name: str = ""):
        """채팅방 닫기 — ESC → 검증 → 강제 닫기"""
        if not self.chat_hwnd:
            return

        # 1차: ESC
        self.send_escape_msg(self.chat_hwnd)
        time.sleep(0.3)
        self.send_escape_msg(self.chat_hwnd)
        time.sleep(0.5)

        if friend_name and not self.find_chat_window(friend_name):
            self.chat_hwnd = None
            return

        # 2차: ESC 재시도
        self.send_escape_msg(self.chat_hwnd)
        time.sleep(0.5)

        if friend_name and not self.find_chat_window(friend_name):
            self.chat_hwnd = None
            return

        # 3차: WM_CLOSE 강제 닫기
        log.warning(f"  ESC 실패, 창 강제 닫기: {friend_name}")
        try:
            win32gui.PostMessage(self.chat_hwnd, win32con.WM_CLOSE, 0, 0)
            time.sleep(0.5)
        except Exception:
            pass
        self.chat_hwnd = None


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
    log.info(f"발송 설정: 메시지 {config['min_delay']}~{config['max_delay']}초, 파일 {config['file_delay']}초")

    # 2. 이미지 다운로드
    download_images_from_list(image_list)

    # 3. 진행 상황 복원
    progress = load_progress()
    start_index = progress["last_index"] + 1
    results = progress["results"]

    if start_index > 0:
        log.info(f"이전 진행 복원: {start_index}번부터 이어서")

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
    global_index = -1
    kakao_restart_attempted = False

    for person_name, items in person_groups:
        # 이미 처리한 사람 스킵
        if global_index + len(items) < start_index:
            global_index += len(items)
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
                # ⭐ 매 메시지 전 채팅방 열림 확인
                if not kakao.verify_chat_still_open(person_name):
                    log.warning(f"  채팅방 닫힘 — 나머지 실패: {person_name}")
                    results.append({
                        "queue_id": item["id"],
                        "status": "failed",
                        "error_type": "device_error",
                    })
                    failed_count += 1
                    person_failed = True
                    save_progress(global_index, results)
                    break

                if item.get("image_path") and (not item.get("message_content") or item["message_content"] == "파일"):
                    kakao.send_image_file(item["image_path"], int(config.get("file_delay", 6)))
                elif item.get("image_path"):
                    kakao.send_text_message(item["message_content"])
                    time.sleep(float(config.get("min_delay", 3)))
                    kakao.send_image_file(item["image_path"], int(config.get("file_delay", 6)))
                else:
                    kakao.send_text_message(item["message_content"])

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

                if not kakao_restart_attempted:
                    log.info("카카오톡 재시작 시도...")
                    kakao_restart_attempted = True
                    kakao.close_chat(person_name)

                    if restart_kakao(config):
                        kakao.find_main_window()
                        kakao.go_to_friend_tab()
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

        # ⭐ 채팅방 닫기 + 검증
        if not person_failed:
            kakao.close_chat(person_name)

    # 7. 최종 보고
    log.info(f"발송 완료: 성공 {sent_count}, 실패 {failed_count}, 총 {total}")
    api.send_report(results, date.today().isoformat())

    if PROGRESS_PATH.exists():
        PROGRESS_PATH.unlink()


if __name__ == "__main__":
    run_macro()
