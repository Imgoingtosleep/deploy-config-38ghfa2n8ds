"""
Append-only audit log for one scheduled deploy:
  <DEPLOY_LOG_DIR>/<schedule_id>.log

One line per event, stamped in the timezone of the browser that created the schedule:
  2026-09-25 02:00:03 +0700 | SW-Core-01           | 10.0.0.1        | DEPLOY     | success | 3 commands
"""
import os
import threading
from datetime import datetime, timedelta, timezone, tzinfo
from typing import Optional

try:
    from zoneinfo import ZoneInfo
except ImportError:  # Python < 3.9
    ZoneInfo = None


def resolve_tz(tz_name: Optional[str], offset_minutes: Optional[int] = None) -> tzinfo:
    """IANA zone from the browser, falling back to its fixed UTC offset, then UTC"""
    if tz_name and ZoneInfo is not None:
        try:
            return ZoneInfo(tz_name)
        except Exception:
            pass
    if offset_minutes is not None:
        return timezone(timedelta(minutes=offset_minutes))
    return timezone.utc


def format_local(dt: datetime, tz: tzinfo) -> str:
    return dt.astimezone(tz).strftime("%Y-%m-%d %H:%M:%S %z")


def _one_line(text: str) -> str:
    return " ".join(str(text or "").split())


class DeployLog:
    def __init__(self, path: str, tz: tzinfo):
        self.path = path
        self.tz = tz
        self._lock = threading.Lock()
        os.makedirs(os.path.dirname(path), exist_ok=True)

    def write(self, name: str, ip: str, action: str, status: str = "", detail: str = ""):
        line = (
            f"{format_local(datetime.now(timezone.utc), self.tz)} | {(name or '-'):<20} | {(ip or '-'):<15} | "
            f"{action:<10} | {status:<7} | {_one_line(detail)}"
        )
        with self._lock:
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(line.rstrip() + "\n")

    def system(self, action: str, status: str = "", detail: str = ""):
        """Schedule-level event, not tied to one device"""
        self.write("-", "-", action, status, detail)

    def device_event(self, device, action: str, status: str, detail: str = ""):
        """Callback for NornirService.run_batch_deploy(on_event=...)"""
        self.write(getattr(device, "name", None) or "-", getattr(device, "host", None) or "-", action, status, detail)

    def read(self) -> str:
        if not os.path.exists(self.path):
            return ""
        with open(self.path, "r", encoding="utf-8") as f:
            return f.read()
