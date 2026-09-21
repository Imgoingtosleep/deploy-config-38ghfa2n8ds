"""
Entry point of the Windows .exe: starts the API + web UI on this machine only
and opens it in the default browser. Close this window to stop the app.
"""
import os
import socket
import sys
import threading
import time
import webbrowser

from app.core.paths import DATA_DIR, seed_defaults

HOST = "127.0.0.1"
PREFERRED_PORT = int(os.getenv("NETAUTO_PORT", "4050"))


def pick_port(preferred: int) -> int:
    """The preferred port, or a free one when another program already holds it"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((HOST, preferred))
            return preferred
        except OSError:
            s.bind((HOST, 0))
            return s.getsockname()[1]


def open_browser_when_ready(url: str, port: int) -> None:
    for _ in range(120):
        try:
            with socket.create_connection((HOST, port), timeout=0.5):
                break
        except OSError:
            time.sleep(0.25)
    webbrowser.open(url)


def main() -> None:
    seed_defaults()
    # Relative paths (LLDP scan logs, nornir.log) land in the data folder, not
    # wherever the .exe was double-clicked from
    os.chdir(DATA_DIR)

    port = pick_port(PREFERRED_PORT)
    url = f"http://{HOST}:{port}"
    print("=" * 60)
    print(f" NetAuto is running at {url}")
    print(f" Data folder: {DATA_DIR}")
    print(" Close this window to stop the app.")
    print("=" * 60)

    import uvicorn
    from app.main import app

    threading.Thread(target=open_browser_when_ready, args=(url, port), daemon=True).start()
    uvicorn.run(app, host=HOST, port=port, log_level="warning")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # keep the console open so the error can be read
        print(f"\nNetAuto failed to start: {exc}")
        if getattr(sys, "frozen", False):
            input("Press Enter to close...")
        raise
