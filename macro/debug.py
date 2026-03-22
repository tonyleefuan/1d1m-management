# 1D1M 매크로 디버그 스크립트
# 한 단계씩 실행하면서 카카오톡 상태를 확인합니다
import win32gui, win32api, win32con, win32clipboard, ctypes, time, sys

print("=" * 50)
print("  1D1M 매크로 디버그")
print("=" * 50)
print()

# 1. 카카오톡 메인 창
print("[1] 카카오톡 메인 창 찾기...")
hwnd = win32gui.FindWindow(None, "카카오톡")
if hwnd:
    print(f"  ✅ 메인 창 발견: hwnd={hwnd}")
else:
    print("  ❌ 카카오톡 창을 찾을 수 없습니다. 카카오톡이 켜져있나요?")
    sys.exit(1)

# 2. EVA 구조 탐색
print("[2] 검색 입력창 찾기 (EVA 구조)...")
child = win32gui.FindWindowEx(hwnd, None, "EVA_ChildWindow", None)
print(f"  EVA_ChildWindow: {child}")
eva1 = win32gui.FindWindowEx(child, None, "EVA_Window", None) if child else 0
print(f"  EVA_Window (1): {eva1}")
eva2 = win32gui.FindWindowEx(child, eva1, "EVA_Window", None) if child and eva1 else 0
print(f"  EVA_Window (2): {eva2}")
edit = win32gui.FindWindowEx(eva2, None, "Edit", None) if eva2 else 0
print(f"  Edit (검색창): {edit}")

if not edit:
    print("  ⚠️  EVA 구조로 못 찾음 — 전체 자식 창 탐색 시도...")
    edits_found = []
    def find_edits(parent, depth=0):
        child_hwnd = win32gui.FindWindowEx(parent, None, None, None)
        while child_hwnd:
            cls = win32gui.GetClassName(child_hwnd)
            if cls == "Edit":
                edits_found.append((child_hwnd, depth))
            find_edits(child_hwnd, depth + 1)
            child_hwnd = win32gui.FindWindowEx(parent, child_hwnd, None, None)
    find_edits(hwnd)
    print(f"  Edit 컨트롤 {len(edits_found)}개 발견: {edits_found}")
    if edits_found:
        edit = edits_found[0][0]
        print(f"  첫 번째 Edit 사용: {edit}")

if not edit:
    print("  ❌ 검색 입력창을 찾을 수 없습니다")
    sys.exit(1)

print(f"  ✅ 검색 입력창: hwnd={edit}")

# 3. 검색어 입력
input("\n[3] Enter를 누르면 검색어를 입력합니다... ")
test_name = input("  검색할 친구 이름 또는 전화번호: ").strip()
if not test_name:
    test_name = "010-8932-8692"

win32api.SendMessage(edit, win32con.WM_SETTEXT, 0, test_name)
print(f"  검색어 '{test_name}' 입력 완료")
print("  카카오톡에 검색 결과가 보이나요? (2초 대기)")
time.sleep(2)

# 4. Enter로 채팅방 열기
input("\n[4] Enter를 누르면 채팅방을 엽니다... ")
win32api.PostMessage(edit, win32con.WM_KEYDOWN, win32con.VK_RETURN, 0)
time.sleep(0.01)
win32api.PostMessage(edit, win32con.WM_KEYUP, win32con.VK_RETURN, 0)
print("  Enter 전송 완료 (2초 대기)")
time.sleep(2)

# 5. 열린 채팅방 확인 — 모든 창 클래스 탐색
print("\n[5] 열린 창 목록 확인...")
all_windows = []
titles = []
def enum_cb(h, _):
    if win32gui.IsWindowVisible(h):
        cls = win32gui.GetClassName(h)
        t = win32gui.GetWindowText(h)
        if t and t != "카카오톡" and h != hwnd:
            all_windows.append((h, t, cls))
            # 카카오톡 프로세스 창인지 확인
            _, pid = win32process.GetWindowThreadProcessId(h)
            _, kakao_pid = win32process.GetWindowThreadProcessId(hwnd)
            if pid == kakao_pid:
                titles.append((h, t, cls))
    return True

import win32process
win32gui.EnumWindows(enum_cb, None)
print(f"  카카오톡 프로세스 창: {len(titles)}개")
for h, t, c in titles:
    print(f"    hwnd={h}, title='{t}', class='{c}'")
if not titles:
    print(f"  (참고) 전체 보이는 창 중 관련 후보:")
    for h, t, c in all_windows[:10]:
        print(f"    hwnd={h}, title='{t}', class='{c}'")

chat_hwnd = None
for h, t, c in titles:
    if test_name in t or t in test_name:
        chat_hwnd = h
        print(f"  ✅ 채팅방 발견: '{t}' (hwnd={h}, class='{c}')")
        break

if not chat_hwnd and titles:
    chat_hwnd = titles[0][0]
    print(f"  ⚠️  정확 매칭 없음, 첫 번째 카카오톡 창 사용: '{titles[0][1]}'")

if not chat_hwnd:
    print("  ❌ 채팅방을 찾을 수 없습니다")
    print("  채팅방이 PowerShell 뒤에 열려있을 수 있습니다.")
    print("  카카오톡 채팅방을 수동으로 앞으로 가져온 후 Enter를 누르세요.")
    input("  Enter를 누르면 다시 검색합니다... ")
    titles.clear()
    win32gui.EnumWindows(enum_cb, None)
    print(f"  카카오톡 프로세스 창: {len(titles)}개")
    for h, t, c in titles:
        print(f"    hwnd={h}, title='{t}', class='{c}'")
    for h, t, c in titles:
        if test_name in t or t in test_name:
            chat_hwnd = h
            break
    if not chat_hwnd and titles:
        chat_hwnd = titles[0][0]
    if not chat_hwnd:
        print("  ❌ 여전히 찾을 수 없습니다")
        sys.exit(1)
    print(f"  ✅ 채팅방 발견: hwnd={chat_hwnd}")

# 6. 메시지 입력창 (RichEdit50W) 찾기
print("\n[6] 메시지 입력창 찾기 (RichEdit50W)...")
rich_edits = []
def find_rich(parent, depth=0):
    try:
        child_hwnd = win32gui.FindWindowEx(parent, None, None, None)
        while child_hwnd:
            cls = win32gui.GetClassName(child_hwnd)
            if "RICHEDIT" in cls.upper() or "RichEdit" in cls:
                rich_edits.append((child_hwnd, cls, depth))
            find_rich(child_hwnd, depth + 1)
            child_hwnd = win32gui.FindWindowEx(parent, child_hwnd, None, None)
    except:
        pass
find_rich(chat_hwnd)
print(f"  RichEdit 컨트롤 {len(rich_edits)}개 발견:")
for h, c, d in rich_edits:
    print(f"    hwnd={h}, class='{c}', depth={d}")

chat_edit = rich_edits[-1][0] if rich_edits else None  # 마지막이 입력창
if chat_edit:
    print(f"  ✅ 입력창 사용: hwnd={chat_edit}")
else:
    print("  ❌ RichEdit를 찾을 수 없습니다")
    sys.exit(1)

# 7. 텍스트 전송 테스트
input("\n[7] Enter를 누르면 테스트 메시지를 전송합니다... ")

# 방법 A: WM_SETTEXT + Enter
print("  방법 A: WM_SETTEXT + PostMessage Enter")
win32api.SendMessage(chat_edit, win32con.WM_SETTEXT, 0, "[디버그] 방법A 테스트")
time.sleep(0.3)
win32api.PostMessage(chat_edit, win32con.WM_KEYDOWN, win32con.VK_RETURN, 0)
time.sleep(0.01)
win32api.PostMessage(chat_edit, win32con.WM_KEYUP, win32con.VK_RETURN, 0)
time.sleep(1)

# 입력창 확인
buf = ctypes.create_unicode_buffer(1024)
ctypes.windll.user32.SendMessageW(chat_edit, win32con.WM_GETTEXT, 1024, buf)
if buf.value.strip():
    print(f"  ❌ 방법A 실패 — 입력창에 '{buf.value}' 남아있음")
    # 초기화
    win32api.SendMessage(chat_edit, win32con.WM_SETTEXT, 0, "")
    time.sleep(0.3)
else:
    print("  ✅ 방법A 성공 — 메시지 전송됨!")

input("\n  계속하려면 Enter... ")

# 방법 B: 클립보드 + Ctrl+V + keybd_event Enter
print("  방법 B: 클립보드 + Ctrl+V + keybd_event Enter")
# 클립보드에 복사
win32clipboard.OpenClipboard()
win32clipboard.EmptyClipboard()
win32clipboard.SetClipboardText("[디버그] 방법B 테스트", win32clipboard.CF_UNICODETEXT)
win32clipboard.CloseClipboard()
time.sleep(0.2)

# 포그라운드
user32 = ctypes.windll.user32
user32.keybd_event(0x12, 0, 0, 0)  # Alt down
user32.keybd_event(0x12, 0, 2, 0)  # Alt up
time.sleep(0.1)
win32gui.SetForegroundWindow(chat_hwnd)
time.sleep(0.3)

# SetFocus to chat_edit
tid_self = ctypes.windll.kernel32.GetCurrentThreadId()
tid_target = user32.GetWindowThreadProcessId(chat_hwnd, None)
user32.AttachThreadInput(tid_self, tid_target, True)
user32.SetFocus(chat_edit)
user32.AttachThreadInput(tid_self, tid_target, False)
time.sleep(0.2)

# Ctrl+V
user32.keybd_event(0x11, 0, 0, 0)  # Ctrl down
user32.keybd_event(0x56, 0, 0, 0)  # V down
user32.keybd_event(0x56, 0, 2, 0)  # V up
user32.keybd_event(0x11, 0, 2, 0)  # Ctrl up
time.sleep(0.5)

# Enter
user32.keybd_event(win32con.VK_RETURN, 0, 0, 0)
time.sleep(0.05)
user32.keybd_event(win32con.VK_RETURN, 0, 2, 0)
time.sleep(0.5)

print("  방법 B 실행 완료 — 카카오톡에 메시지가 보이나요?")

# 방법 C: WM_PASTE
input("\n  계속하려면 Enter... ")
print("  방법 C: 클립보드 + WM_PASTE + PostMessage Enter")
win32clipboard.OpenClipboard()
win32clipboard.EmptyClipboard()
win32clipboard.SetClipboardText("[디버그] 방법C 테스트", win32clipboard.CF_UNICODETEXT)
win32clipboard.CloseClipboard()
time.sleep(0.2)

win32api.SendMessage(chat_edit, win32con.WM_PASTE, 0, 0)
time.sleep(0.3)
win32api.PostMessage(chat_edit, win32con.WM_KEYDOWN, win32con.VK_RETURN, 0)
time.sleep(0.01)
win32api.PostMessage(chat_edit, win32con.WM_KEYUP, win32con.VK_RETURN, 0)
time.sleep(0.5)

print("  방법 C 실행 완료 — 카카오톡에 메시지가 보이나요?")

# 8. 채팅방 닫기
input("\n[8] Enter를 누르면 채팅방을 닫습니다... ")
print("  WM_CLOSE 전송...")
win32gui.PostMessage(chat_hwnd, win32con.WM_CLOSE, 0, 0)
time.sleep(1)

still_open = win32gui.IsWindow(chat_hwnd) and win32gui.IsWindowVisible(chat_hwnd)
if still_open:
    print("  ⚠️  아직 열려있음 — ESC 시도")
    win32api.PostMessage(chat_hwnd, win32con.WM_KEYDOWN, win32con.VK_ESCAPE, 0)
    time.sleep(0.01)
    win32api.PostMessage(chat_hwnd, win32con.WM_KEYUP, win32con.VK_ESCAPE, 0)
    time.sleep(0.5)
    win32api.PostMessage(chat_hwnd, win32con.WM_KEYDOWN, win32con.VK_ESCAPE, 0)
    time.sleep(0.01)
    win32api.PostMessage(chat_hwnd, win32con.WM_KEYUP, win32con.VK_ESCAPE, 0)
    time.sleep(1)

still_open2 = win32gui.IsWindow(chat_hwnd) and win32gui.IsWindowVisible(chat_hwnd)
if still_open2:
    print("  ❌ 채팅방이 안 닫혔습니다")
else:
    print("  ✅ 채팅방 닫힘 확인")

print()
print("=" * 50)
print("  디버그 완료!")
print("  위 결과를 전체 복사 (Ctrl+A → Ctrl+C) 해서 보내주세요")
print("=" * 50)
