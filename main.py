import eel
import os
import sys
import socket
import threading
import time
import subprocess
import ctypes
import winsound

from plyer import notification
import pystray
from PIL import Image

# ─────────────────────────────────────────────
# Определение базового пути (PyInstaller-совместимость)
# ─────────────────────────────────────────────
if getattr(sys, 'frozen', False):
    BASE_DIR = sys._MEIPASS
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

WEB_DIR = os.path.join(BASE_DIR, 'web')

# ─────────────────────────────────────────────
# Глобальное состояние
# ─────────────────────────────────────────────
state_lock = threading.Lock()
timer_active = False
end_timestamp = 0.0
total_seconds = 0
current_mode = "sleep"
notifications_enabled = False
timer_thread = None
tray_icon = None
app_should_exit = False
notified_5min = False
notified_1min = False
current_port = 0


# ─────────────────────────────────────────────
# Утилиты
# ─────────────────────────────────────────────
def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return s.getsockname()[1]


def get_icon_image():
    icon_path = os.path.join(WEB_DIR, 'icon.ico')
    try:
        if os.path.exists(icon_path):
            return Image.open(icon_path)
    except Exception:
        pass
    img = Image.new('RGB', (64, 64), '#6C5CE7')
    return img


def play_sound():
    try:
        sound_path = os.path.join(WEB_DIR, 'notification.wav')
        if os.path.exists(sound_path):
            winsound.PlaySound(sound_path, winsound.SND_FILENAME | winsound.SND_ASYNC)
    except Exception:
        pass


def send_notification(title, message):
    try:
        notification.notify(
            title=title,
            message=message,
            app_name="Schedule Shutdown",
            timeout=5
        )
    except Exception:
        pass


def find_chrome_path():
    possible_paths = [
        os.path.join(os.environ.get('PROGRAMFILES', ''), 'Google', 'Chrome', 'Application', 'chrome.exe'),
        os.path.join(os.environ.get('PROGRAMFILES(X86)', ''), 'Google', 'Chrome', 'Application', 'chrome.exe'),
        os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ]
    for p in possible_paths:
        if p and os.path.exists(p):
            return p
    return None


def find_edge_path():
    possible_paths = [
        os.path.join(os.environ.get('PROGRAMFILES', ''), 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        os.path.join(os.environ.get('PROGRAMFILES(X86)', ''), 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ]
    for p in possible_paths:
        if p and os.path.exists(p):
            return p
    return None


# ─────────────────────────────────────────────
# Выполнение действия
# ─────────────────────────────────────────────
def execute_action():
    global current_mode
    try:
        if current_mode == "shutdown":
            subprocess.run(
                ['shutdown', '/s', '/t', '0'],
                creationflags=0x08000000,
                check=False
            )
        elif current_mode == "sleep":
            ctypes.windll.PowrProf.SetSuspendState(0, 1, 0)
        elif current_mode == "lock":
            ctypes.windll.user32.LockWorkStation()
    except Exception:
        pass


# ─────────────────────────────────────────────
# Поток таймера
# ─────────────────────────────────────────────
def timer_worker():
    global timer_active, notified_5min, notified_1min

    while True:
        with state_lock:
            if not timer_active:
                break
            remaining = end_timestamp - time.time()

        if remaining <= 0:
            execute_action()
            with state_lock:
                timer_active = False
            try:
                eel.timer_finished()()
            except Exception:
                pass
            remove_tray()
            break

        if notifications_enabled:
            if not notified_5min and 299 < remaining <= 300:
                with state_lock:
                    notified_5min = True
                send_notification("Schedule Shutdown", "До действия осталось 5 минут")

            if not notified_1min and 59 < remaining <= 60:
                with state_lock:
                    notified_1min = True
                send_notification("Schedule Shutdown", "До действия осталась 1 минута")
                play_sound()

        time.sleep(0.5)


# ─────────────────────────────────────────────
# Exposed-функции для JavaScript
# ─────────────────────────────────────────────
@eel.expose
def start_timer(mode, minutes):
    global timer_active, end_timestamp, total_seconds, current_mode
    global timer_thread, notified_5min, notified_1min

    minutes = max(1, min(480, int(minutes)))

    with state_lock:
        timer_active = False

    if timer_thread and timer_thread.is_alive():
        timer_thread.join(timeout=2)

    with state_lock:
        current_mode = mode
        total_seconds = minutes * 60
        end_timestamp = time.time() + total_seconds
        notified_5min = False
        notified_1min = False
        timer_active = True

    timer_thread = threading.Thread(target=timer_worker, daemon=True)
    timer_thread.start()

    return {
        "status": "ok",
        "end_timestamp": end_timestamp,
        "total_seconds": total_seconds
    }


@eel.expose
def cancel_timer():
    global timer_active

    with state_lock:
        timer_active = False

    try:
        subprocess.run(
            ['shutdown', '/a'],
            creationflags=0x08000000,
            check=False
        )
    except Exception:
        pass

    return {"status": "cancelled"}


@eel.expose
def add_time(minutes):
    global end_timestamp, total_seconds

    with state_lock:
        if not timer_active:
            return {"status": "not_active"}

        end_timestamp += minutes * 60
        remaining = end_timestamp - time.time()

        if remaining < 60:
            end_timestamp = time.time() + 60
            remaining = 60

        if remaining > 480 * 60:
            end_timestamp = time.time() + 480 * 60
            remaining = 480 * 60

        total_seconds = remaining

    return {
        "status": "ok",
        "end_timestamp": end_timestamp,
        "total_seconds": total_seconds,
        "remaining": remaining
    }


@eel.expose
def get_state():
    with state_lock:
        remaining = max(0, end_timestamp - time.time()) if timer_active else 0
        return {
            "timer_active": timer_active,
            "end_timestamp": end_timestamp,
            "total_seconds": total_seconds,
            "current_mode": current_mode,
            "remaining": remaining
        }


@eel.expose
def lock_screen():
    try:
        ctypes.windll.user32.LockWorkStation()
    except Exception:
        pass
    return {"status": "ok"}


@eel.expose
def set_notifications(enabled):
    global notifications_enabled
    notifications_enabled = bool(enabled)


# ─────────────────────────────────────────────
# Системный трей
# ─────────────────────────────────────────────
def remove_tray():
    global tray_icon
    try:
        if tray_icon:
            tray_icon.stop()
            tray_icon = None
    except Exception:
        pass


def show_window_from_tray(icon, item=None):
    global tray_icon
    try:
        icon.stop()
        tray_icon = None
    except Exception:
        pass
    threading.Thread(target=start_eel_window, daemon=True).start()


def cancel_and_exit(icon, item=None):
    global timer_active, tray_icon, app_should_exit

    with state_lock:
        timer_active = False
        app_should_exit = True

    try:
        subprocess.run(['shutdown', '/a'], creationflags=0x08000000, check=False)
    except Exception:
        pass

    try:
        icon.stop()
        tray_icon = None
    except Exception:
        pass

    os._exit(0)


def minimize_to_tray():
    global tray_icon

    remove_tray()

    icon_image = get_icon_image()

    menu = pystray.Menu(
        pystray.MenuItem("Показать", show_window_from_tray, default=True),
        pystray.MenuItem("Отменить таймер", cancel_and_exit),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Выход", cancel_and_exit)
    )

    tray_icon = pystray.Icon(
        name="Schedule Shutdown",
        icon=icon_image,
        title="Schedule Shutdown — таймер активен",
        menu=menu
    )

    tray_thread = threading.Thread(target=tray_icon.run, daemon=True)
    tray_thread.start()


# ─────────────────────────────────────────────
# Управление окном Eel
# ─────────────────────────────────────────────
def on_close(page, sockets):
    global app_should_exit

    if not sockets:
        with state_lock:
            active = timer_active

        if active:
            minimize_to_tray()
        else:
            app_should_exit = True
            os._exit(0)


def start_eel_window():
    global current_port

    current_port = find_free_port()

    chrome_path = find_chrome_path()
    edge_path = find_edge_path()

    browser_path = chrome_path or edge_path

    if browser_path:
        import subprocess as sp
        sp.Popen([
            browser_path,
            f'--app=http://localhost:{current_port}/index.html',
            '--disable-extensions',
            '--disable-default-apps',
            '--new-window',
        ])
        try:
            eel.start(
                'index.html',
                size=(420, 680),
                port=current_port,
                close_callback=on_close,
                mode=None,
                block=True,
            )
        except (SystemExit, MemoryError, KeyboardInterrupt):
            pass
    else:
        try:
            eel.start(
                'index.html',
                size=(420, 680),
                port=current_port,
                close_callback=on_close,
                mode='chrome-app',
            )
        except (SystemExit, MemoryError, KeyboardInterrupt):
            pass
        except Exception:
            try:
                eel.start(
                    'index.html',
                    size=(420, 680),
                    port=find_free_port(),
                    close_callback=on_close,
                    mode='edge',
                )
            except Exception:
                pass


# ─────────────────────────────────────────────
# Точка входа
# ─────────────────────────────────────────────
if __name__ == '__main__':
    eel.init(WEB_DIR)
    start_eel_window()