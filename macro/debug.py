"""1D1M 매크로 디버그 — Enter 전송 방법 자동 테스트

사용법: python debug.py 010-8932-8692
터미널 건드리지 않고 5가지 Enter 방법을 자동 실행합니다.
"""
import sys
import ctypes
import time
import win32gui
import win32api
import win32con
import win32clipboard
import win32process

if len(sys.argv) < 2:
    print("사용법: python debug.py <친구이름 또는 전화번호>")
    print("예: python debug.py 010-8932-8692")
    exit(1)

name = sys.argv[1]

print("=" * 50)
print(f"  1D1M Enter 방법 자동 테스트: {name}")
print("  ★ 5초 후 시작 — 터미널 건드리지 마세요 ★")
print("=" * 50)
time.sleep(5)
print()

# 1. 카카오톡 메인 창
hwnd = win32gui.FindWindow(None, "카카오톡")
if not hwnd:
    print("❌ 카카오톡 메인 창을 찾을 수 없습니다")
    exit(1)
print(f"✅ 메인 창: {hwnd}")

# 2. 검색 입력창
child = win32gui.FindWindowEx(hwnd, None, "EVA_ChildWindow", None)
eva1 = win32gui.FindWindowEx(child, None, "EVA_Window", None)
eva2 = win32gui.FindWindowEx(child, eva1, "EVA_Window", None)
search_edit = win32gui.FindWindowEx(eva2, None, "Edit", None)
print(f"✅ 검색 입력창: {search_edit}")

# 3. 검색
print(f"  검색: {name}")
win32api.SendMessage(search_edit, win32con.WM_SETTEXT, 0, name)
time.sleep(2)
win32api.PostMessage(search_edit, win32con.WM_KEYDOWN, win32con.VK_RETURN, 0)
time.sleep(0.01)
win32api.PostMessage(search_edit, win32con.WM_KEYUP, win32con.VK_RETURN, 0)
time.sleep(2)

# 4. 채팅방 찾기
kakao_pid = win32process.GetWindowThreadProcessId(hwnd)[1]
chat_hwnd = None
def find_chat(h, _):
    global chat_hwnd
    if win32gui.IsWindowVisible(h):
        _, pid = win32process.GetWindowThreadProcessId(h)
        if pid == kakao_pid:
            t = win32gui.GetWindowText(h)
            if t == name:
                chat_hwnd = h
                return False
    return True
try:
    win32gui.EnumWindows(find_chat, None)
except:
    pass

if not chat_hwnd:
    print(f"❌ 채팅방 '{name}' 못 찾음")
    exit(1)
print(f"✅ 채팅방: {chat_hwnd}")

# 5. RichEdit 찾기
chat_edit = None
def find_edit(h, _):
    global chat_edit
    cls = win32gui.GetClassName(h)
    if cls in ("RichEdit50W", "RICHEDIT50W"):
        chat_edit = h
        return False
    return True
try:
    win32gui.EnumChildWindows(chat_hwnd, find_edit, None)
except:
    pass

if not chat_edit:
    print("❌ RichEdit 못 찾음")
    exit(1)
print(f"✅ RichEdit: {chat_edit}")

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

print()
print("=" * 50)
print("  5가지 Enter 방법을 15초간 자동 실행합니다")
print("  ★ 터미널을 건드리지 마세요! ★")
print("  카카오톡에서 어떤 메시지가 도착하는지 확인하세요")
print("=" * 50)
print()
time.sleep(3)

# === 방법 1: PostMessage VK_RETURN (lparam=0) ===
print("  [1/5] PostMessage VK_RETURN (lparam=0)...")
win32api.SendMessage(chat_edit, win32con.WM_SETTEXT, 0, "[테스트1] PostMessage Enter lparam=0")
time.sleep(0.2)
win32api.PostMessage(chat_edit, win32con.WM_KEYDOWN, win32con.VK_RETURN, 0)
time.sleep(0.01)
win32api.PostMessage(chat_edit, win32con.WM_KEYUP, win32con.VK_RETURN, 0)
time.sleep(3)

# === 방법 2: PostMessage VK_RETURN (with scan code) ===
print("  [2/5] PostMessage VK_RETURN (scan code)...")
win32api.SendMessage(chat_edit, win32con.WM_SETTEXT, 0, "[테스트2] PostMessage Enter scancode")
time.sleep(0.2)
scan = user32.MapVirtualKeyA(win32con.VK_RETURN, 0)
lp_down = win32api.MAKELONG(1, scan)
lp_up = win32api.MAKELONG(1, scan) | 0xC0000000
win32api.PostMessage(chat_edit, win32con.WM_KEYDOWN, win32con.VK_RETURN, lp_down)
time.sleep(0.01)
win32api.PostMessage(chat_edit, win32con.WM_KEYUP, win32con.VK_RETURN, lp_up)
time.sleep(3)

# === 방법 3: SendMessage VK_RETURN (동기) ===
print("  [3/5] SendMessage VK_RETURN (동기)...")
win32api.SendMessage(chat_edit, win32con.WM_SETTEXT, 0, "[테스트3] SendMessage Enter")
time.sleep(0.2)
win32api.SendMessage(chat_edit, win32con.WM_KEYDOWN, win32con.VK_RETURN, 0)
time.sleep(0.01)
win32api.SendMessage(chat_edit, win32con.WM_KEYUP, win32con.VK_RETURN, 0)
time.sleep(3)

# === 방법 4: WM_CHAR '\r' ===
print("  [4/5] WM_CHAR 0x0D (\\r)...")
win32api.SendMessage(chat_edit, win32con.WM_SETTEXT, 0, "[테스트4] WM_CHAR Enter")
time.sleep(0.2)
win32api.SendMessage(chat_edit, win32con.WM_CHAR, 0x0D, 0)
time.sleep(3)

# === 방법 5: SetForegroundWindow + keybd_event (Alt 없이) ===
print("  [5/5] SetForegroundWindow + keybd_event...")
win32api.SendMessage(chat_edit, win32con.WM_SETTEXT, 0, "[테스트5] SetForeground+keybd Enter")
time.sleep(0.2)
# WM_ACTIVATE로 활성화
win32gui.SendMessage(chat_hwnd, win32con.WM_ACTIVATE, win32con.WA_ACTIVE, 0)
user32.SetForegroundWindow(chat_hwnd)
time.sleep(0.2)
# AttachThreadInput + SetFocus
tid_self = kernel32.GetCurrentThreadId()
tid_target = user32.GetWindowThreadProcessId(chat_hwnd, None)
user32.AttachThreadInput(tid_self, tid_target, True)
user32.SetFocus(chat_edit)
user32.AttachThreadInput(tid_self, tid_target, False)
time.sleep(0.2)
# keybd_event Enter
user32.keybd_event(win32con.VK_RETURN, 0, 0, 0)
time.sleep(0.05)
user32.keybd_event(win32con.VK_RETURN, 0, win32con.KEYEVENTF_KEYUP, 0)
time.sleep(3)

# 결과
print()
print("=" * 50)
print("  테스트 완료!")
print()
print("  카카오톡에서 어떤 메시지가 도착했나요?")
print("  [테스트1] → 방법1 성공")
print("  [테스트2] → 방법2 성공")
print("  [테스트3] → 방법3 성공")
print("  [테스트4] → 방법4 성공")
print("  [테스트5] → 방법5 성공")
print()
print("  도착한 번호를 알려주세요!")
print("=" * 50)

# 채팅방 닫기
time.sleep(2)
win32gui.PostMessage(chat_hwnd, win32con.WM_CLOSE, 0, 0)
print("  채팅방 닫힘")
