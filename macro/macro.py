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
from datetime import datetime, date
from pathlib import Path
from typing import Optional

# ─── 설정 ───

BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "config.json"
PROGRESS_PATH = BASE_DIR / "progress.json"
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
    """서버에서 받은 이미지 URL 목록을 로컬에 다운로드 (캐싱)

    - 로컬에 있으면 서버 날짜(Last-Modified) 비교, 최신이면 스킵
    - 없으면 다운로드
    """
    if not image_urls:
        log.info("다운로드할 이미지 없음")
        return

    log.info(f"이미지 {len(image_urls)}개 확인 중...")
    downloaded = 0

    for url in image_urls:
        filename = url.split("/")[-1]
        local_path = IMAGES_DIR / filename

        if local_path.exists():
            # 로컬 파일 존재 — 서버 날짜 비교 (HEAD 요청)
            try:
                head = requests.head(url, timeout=10)
                server_modified = head.headers.get("last-modified")
                if server_modified:
                    from email.utils import parsedate_to_datetime
                    server_time = parsedate_to_datetime(server_modified).timestamp()
                    local_time = local_path.stat().st_mtime
                    if server_time <= local_time:
                        continue  # 로컬이 최신 — 스킵
            except Exception:
                continue  # HEAD 실패해도 기존 파일 사용

        # 다운로드
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
        with open(PROGRESS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            if data.get("date") == date.today().isoformat():
                return data
    return {"date": date.today().isoformat(), "last_index": -1, "results": []}


def save_progress(last_index: int, results: list):
    with open(PROGRESS_PATH, "w", encoding="utf-8") as f:
        json.dump(
            {"date": date.today().isoformat(), "last_index": last_index, "results": results},
            f,
            ensure_ascii=False,
        )


# ─── 카카오톡 자동화 ───

SEARCH_ICON = BASE_DIR / "images_ui" / "search.png"
CLOSE_ICON = BASE_DIR / "images_ui" / "close.png"


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


def search_friend(name: str) -> bool:
    """카카오톡에서 친구 이름 검색 → 1:1 채팅방 열기

    기존 Kakao v4 매크로 패턴 참고:
    - chat_criteria: "친구이름" (친구 탭에서 이름 검색)
    - 검색 아이콘 클릭 → 이름 입력 → 아래 키로 선택 → Enter
    """
    # 검색 아이콘 클릭
    if not find_and_click_image(str(SEARCH_ICON), timeout=5):
        log.warning("검색 아이콘을 찾을 수 없습니다")
        return False

    time.sleep(random.uniform(0.5, 1.0))

    # 기존 검색어 지우기 (X 아이콘 또는 Ctrl+A → Delete)
    pyautogui.hotkey("ctrl", "a")
    pyautogui.press("delete")
    time.sleep(0.3)

    # 이름 입력 (pyperclip으로 한글 지원)
    pyperclip.copy(name)
    pyautogui.hotkey("ctrl", "v")
    time.sleep(random.uniform(1.5, 2.0))  # 검색 결과 로딩 대기

    # 첫 번째 결과 선택 (down → enter로 채팅방 열기)
    pyautogui.press("down")
    time.sleep(0.3)
    pyautogui.press("enter")
    time.sleep(random.uniform(0.8, 1.2))

    return True


def send_text_message(text: str):
    """현재 열린 채팅방에 텍스트 메시지 전송"""
    pyperclip.copy(text)
    pyautogui.hotkey("ctrl", "v")
    pyautogui.press("enter")


def send_image_file(image_path: str, config: dict):
    """현재 열린 채팅방에 이미지 파일 전송"""
    filename = image_path.split("/")[-1]
    local_path = IMAGES_DIR / filename

    if not local_path.exists():
        log.warning(f"이미지 파일 없음: {local_path}")
        return

    # Ctrl+T로 파일 전송 대화상자 열기
    pyautogui.hotkey("ctrl", "t")
    time.sleep(1)

    # 파일 경로 입력
    pyperclip.copy(str(local_path))
    pyautogui.hotkey("ctrl", "v")
    pyautogui.press("enter")
    time.sleep(1)
    pyautogui.press("enter")  # 전송 확인
    time.sleep(float(config.get("file_delay", 6)))


def close_chat():
    """채팅방 닫기"""
    pyautogui.press("escape")
    time.sleep(0.5)


def restart_kakao(config: dict) -> bool:
    """카카오톡 재시작"""
    log.info("카카오톡 재시작 중...")

    # 강제 종료 (static command — no user input)
    subprocess.run(["taskkill", "/F", "/IM", "KakaoTalk.exe"], capture_output=True)
    time.sleep(30)

    # 재실행
    kakao_path = config.get("kakao_path", r"C:\Program Files (x86)\Kakao\KakaoTalk\KakaoTalk.exe")
    try:
        subprocess.Popen([kakao_path])
        log.info("카카오톡 실행됨, 60초 대기...")
        time.sleep(60)  # 로그인 + 로딩 대기
        return True
    except Exception as e:
        log.error(f"카카오톡 실행 실패: {e}")
        return False


# ─── 메인 발송 루프 ───

def run_macro():
    config = load_config()
    api = ServerAPI(config)

    log.info(f"=== 매크로 시작 — {config['device_id']} ===")

    # 1. 대기열 + 설정 + 이미지 목록 수신 (한 번의 API 호출)
    response = api.get_queue()
    queue = response.get("data", [])
    server_settings = response.get("settings", {})
    image_list = response.get("images", [])

    if not queue:
        log.info("오늘 발송 대기열이 없습니다.")
        return

    total = len(queue)
    log.info(f"대기열 수신: {total}건")

    # 서버 발송 설정 적용 (대시보드에서 설정한 값 우선)
    if server_settings.get("send_message_delay"):
        msg_delay = int(server_settings["send_message_delay"])
        config["min_delay"] = msg_delay
        config["max_delay"] = msg_delay + 2
    if server_settings.get("send_file_delay"):
        config["file_delay"] = int(server_settings["send_file_delay"])
    log.info(f"발송 설정: 메시지 {config['min_delay']}~{config['max_delay']}초, 파일 {config['file_delay']}초")

    # 2. 이미지 다운로드 (서버에서 받은 이미지 목록 기반)
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
                    close_chat()

                    if restart_kakao(config):
                        # 재시작 성공 — 이 사람 나머지 실패 처리 후 다음 사람부터 이어서
                        results.append({
                            "queue_id": item["id"],
                            "status": "failed",
                            "error_type": "device_error",
                        })
                        failed_count += 1
                        save_progress(global_index, results)
                        break
                    else:
                        # 재시작도 실패 — 전체 중단
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
                    # 이미 재시작 시도함 — 중단
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

        # 채팅방 닫기
        if not person_failed:
            close_chat()

    # 7. 최종 보고
    log.info(f"발송 완료: 성공 {sent_count}, 실패 {failed_count}, 총 {total}")
    success = api.send_report(results, date.today().isoformat())
    if not success:
        log.error("결과 보고 실패! 로컬 로그를 확인하세요.")
        # progress.json에 결과가 남아있으므로 수동 복구 가능

    # progress 초기화
    if PROGRESS_PATH.exists():
        PROGRESS_PATH.unlink()

    log.info("=== 매크로 종료 ===")


if __name__ == "__main__":
    run_macro()
