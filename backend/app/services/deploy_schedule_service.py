"""
Scheduled config deploys.

Schedules persist in app/data/scheduled_deploys.json so they survive a backend restart.
A single daemon thread checks them every DEPLOY_SCHEDULE_TICK_SECONDS against the server's
UTC clock and hands due ones to JobService.create_deploy_job, which does the actual work.

Status flow:
  scheduled -> running -> completed | cancelled
  scheduled -> missed        (not started before deadline, e.g. backend was down)
  scheduled -> cancelled     (cancelled by a user before it started)
  running   -> interrupted   (backend restarted mid-run; the in-memory job is gone)
"""
import json
import os
import threading
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.schemas.command import BatchDeployRequest
from app.schemas.deploy_schedule import ScheduleDeployRequest
from app.services.deploy_log import DeployLog, format_local, resolve_tz
from app.services.job_service import JobService
from app.services.netmiko_service import NetmikoService

DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "scheduled_deploys.json")
ACTIVE = ("scheduled", "running")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.astimezone(timezone.utc).isoformat() if dt else None


def _parse(value: Optional[str]) -> Optional[datetime]:
    return datetime.fromisoformat(value) if value else None


class ScheduleError(ValueError):
    pass


class DeployScheduleService:
    _lock = threading.RLock()
    _thread: Optional[threading.Thread] = None
    _stop = threading.Event()

    # ---------- storage ----------
    @classmethod
    def _load(cls) -> List[Dict[str, Any]]:
        if not os.path.exists(DATA_FILE):
            return []
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, list) else []
        except Exception:
            return []

    @classmethod
    def _save(cls, items: List[Dict[str, Any]]) -> None:
        os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
        tmp = f"{DATA_FILE}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(items, f, indent=2, ensure_ascii=False)
        os.replace(tmp, DATA_FILE)

    @classmethod
    def _log(cls, item: Dict[str, Any]) -> DeployLog:
        path = os.path.join(os.path.abspath(settings.DEPLOY_LOG_DIR), f"{item['id']}.log")
        return DeployLog(path, resolve_tz(item.get("client_tz"), item.get("client_offset_minutes")))

    @staticmethod
    def _strip_credentials(devices: List[Dict[str, Any]]) -> bool:
        """Drop passwords of devices that use a Credential Profile: they are read from the
        profile at run time. Returns True if any device still carries a password in the file."""
        stores_passwords = False
        for d in devices:
            if d.get("profile_id"):
                d["password"] = ""
                d["secret"] = None
                d["credential_pool"] = None
            elif d.get("password") or d.get("secret") or d.get("credential_pool"):
                stores_passwords = True
        return stores_passwords

    @staticmethod
    def _public(item: Dict[str, Any], detail: bool = False) -> Dict[str, Any]:
        """API view: never returns the stored request (it may hold passwords)"""
        req = item.get("request") or {}
        out = {k: v for k, v in item.items() if k != "request"}
        out["device_count"] = len(req.get("devices") or [])
        out["command_count"] = len(req.get("config_commands") or [])
        if detail:
            out["config_commands"] = [NetmikoService.mask_sensitive_data(c) for c in req.get("config_commands") or []]
            out["devices"] = [{"name": d.get("name") or "", "host": d.get("host") or ""} for d in req.get("devices") or []]
            out["options"] = {
                "save_config": req.get("save_config"),
                "backup_before_deploy": req.get("backup_before_deploy"),
                "pre_check_commands": req.get("pre_check_commands") or [],
                "post_check_commands": req.get("post_check_commands") or [],
                "num_workers": req.get("num_workers"),
            }
        return out

    # ---------- public API ----------
    @classmethod
    def create(cls, req: ScheduleDeployRequest) -> Dict[str, Any]:
        now = _now()
        if not req.devices:
            raise ScheduleError("No devices provided for scheduled deploy")
        commands = [c.strip() for c in req.config_commands if c.strip() and not c.strip().startswith(("!", "#"))]
        if not commands:
            raise ScheduleError("No valid configuration commands provided")
        if req.run_at < now - timedelta(minutes=1):
            raise ScheduleError("run_at is in the past")
        if req.deadline is not None and req.deadline <= now:
            raise ScheduleError("deadline is in the past")

        request = BatchDeployRequest(
            devices=req.devices,
            config_commands=req.config_commands,
            save_config=req.save_config,
            pre_check_commands=req.pre_check_commands,
            post_check_commands=req.post_check_commands,
            backup_before_deploy=req.backup_before_deploy,
            num_workers=req.num_workers,
        ).model_dump()
        stores_passwords = cls._strip_credentials(request["devices"])

        item = {
            "id": f"sched-{uuid.uuid4().hex[:10]}",
            "title": (req.title or "").strip() or f"Deploy {len(commands)} commands to {len(req.devices)} devices",
            "status": "scheduled",
            "run_at": _iso(req.run_at),
            "deadline": _iso(req.deadline),
            "client_tz": req.client_tz,
            "client_offset_minutes": req.client_offset_minutes,
            "created_at": _iso(now),
            "started_at": None,
            "finished_at": None,
            "job_id": None,
            "summary": None,
            "error": None,
            "stores_passwords": stores_passwords,
            "request": request,
        }
        log = cls._log(item)
        log.system("SCHEDULED", "", f"{item['title']} | id={item['id']}")
        log.system("SCHEDULED", "", f"run_at={format_local(req.run_at, log.tz)}"
                   + (f", deadline={format_local(req.deadline, log.tz)}" if req.deadline else ""))

        with cls._lock:
            items = cls._load()
            items.append(item)
            cls._save(items)
        return cls._public(item)

    @classmethod
    def list_all(cls) -> List[Dict[str, Any]]:
        with cls._lock:
            items = cls._load()
        items.sort(key=lambda i: i.get("run_at") or "", reverse=True)
        return [cls._public(i) for i in items]

    @classmethod
    def get(cls, schedule_id: str) -> Optional[Dict[str, Any]]:
        with cls._lock:
            item = next((i for i in cls._load() if i["id"] == schedule_id), None)
        return cls._public(item, detail=True) if item else None

    @classmethod
    def cancel(cls, schedule_id: str) -> Dict[str, Any]:
        with cls._lock:
            items = cls._load()
            item = next((i for i in items if i["id"] == schedule_id), None)
            if not item:
                raise KeyError(schedule_id)
            if item["status"] == "running" and item.get("job_id"):
                JobService.cancel_job(item["job_id"])
                cls._log(item).system("CANCEL", "", "Cancel requested while running; devices already started will finish")
                return cls._public(item)
            if item["status"] != "scheduled":
                raise ScheduleError(f"Cannot cancel a schedule in status '{item['status']}'")
            item["status"] = "cancelled"
            item["finished_at"] = _iso(_now())
            cls._save(items)
        cls._log(item).system("CANCELLED", "", "Cancelled before start")
        return cls._public(item)

    @classmethod
    def delete(cls, schedule_id: str) -> None:
        """Remove a finished schedule from the list. Its log file is kept."""
        with cls._lock:
            items = cls._load()
            item = next((i for i in items if i["id"] == schedule_id), None)
            if not item:
                raise KeyError(schedule_id)
            if item["status"] in ACTIVE:
                raise ScheduleError("Cancel the schedule before deleting it")
            cls._save([i for i in items if i["id"] != schedule_id])

    @classmethod
    def run_now(cls, schedule_id: str) -> Dict[str, Any]:
        with cls._lock:
            items = cls._load()
            item = next((i for i in items if i["id"] == schedule_id), None)
            if not item:
                raise KeyError(schedule_id)
            if item["status"] != "scheduled":
                raise ScheduleError(f"Cannot run a schedule in status '{item['status']}'")
            cls._start(item, reason="Run now (manual)")
            cls._save(items)
        return cls._public(item)

    @classmethod
    def read_log(cls, schedule_id: str) -> Optional[str]:
        with cls._lock:
            item = next((i for i in cls._load() if i["id"] == schedule_id), None)
        if item:
            return cls._log(item).read()
        # Deleted from the list: the log file may still be there
        path = os.path.join(os.path.abspath(settings.DEPLOY_LOG_DIR), f"{os.path.basename(schedule_id)}.log")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        return None

    # ---------- scheduler ----------
    @classmethod
    def _start(cls, item: Dict[str, Any], reason: str) -> None:
        """Submit the deploy job. Caller holds the lock and saves items afterwards."""
        req = BatchDeployRequest(**item["request"])
        log = cls._log(item)
        commands = [c.strip() for c in req.config_commands if c.strip() and not c.strip().startswith(("!", "#"))]
        log.system("START", "running", f"{reason}: {len(req.devices)} devices, {len(commands)} commands")
        for n, cmd in enumerate(commands, 1):
            log.system("COMMAND", "", f"{n}. {NetmikoService.mask_sensitive_data(cmd)}")
        log.system(
            "OPTIONS", "",
            f"save={req.save_config}, backup={req.backup_before_deploy}, "
            f"pre_check={len(req.pre_check_commands or [])}, post_check={len(req.post_check_commands or [])}",
        )
        try:
            res = JobService.create_deploy_job(
                devices=req.devices,
                config_commands=req.config_commands,
                save_config=req.save_config,
                pre_check_commands=req.pre_check_commands or [],
                post_check_commands=req.post_check_commands or [],
                backup_before_deploy=bool(req.backup_before_deploy),
                num_workers=req.num_workers,
                on_event=log.device_event,
            )
        except Exception as e:
            item["status"] = "failed"
            item["error"] = str(e)
            item["finished_at"] = _iso(_now())
            log.system("FINISHED", "failed", f"Could not start job: {e}")
            return
        item["status"] = "running"
        item["job_id"] = res.job_id
        item["started_at"] = _iso(_now())
        log.system("JOB", "", f"job_id={res.job_id}")

    @classmethod
    def _finish_running(cls, item: Dict[str, Any]) -> bool:
        status = JobService.get_job_status(item["job_id"]) if item.get("job_id") else None
        if status is None:
            item["status"] = "interrupted"
            item["finished_at"] = _iso(_now())
            item["error"] = "Backend restarted while the deploy was running; check the devices in the log"
            cls._log(item).system("FINISHED", "failed", item["error"])
            return True
        if not status.is_completed:
            return False
        item["status"] = "cancelled" if status.status == "cancelled" else "completed"
        item["finished_at"] = _iso(_now())
        item["summary"] = {
            "total": status.total_devices,
            "completed": status.completed_devices,
            "success": status.success_count,
            "failed": status.failed_count,
            "elapsed_seconds": status.elapsed_seconds,
        }
        cls._log(item).system(
            "FINISHED", item["status"],
            f"success={status.success_count}, failed={status.failed_count}, "
            f"done={status.completed_devices}/{status.total_devices}, {status.elapsed_seconds}s",
        )
        return True

    @classmethod
    def tick(cls) -> None:
        now = _now()
        grace = timedelta(minutes=settings.DEPLOY_SCHEDULE_GRACE_MINUTES)
        with cls._lock:
            items = cls._load()
            changed = False
            for item in items:
                if item["status"] == "running":
                    changed |= cls._finish_running(item)
                elif item["status"] == "scheduled":
                    run_at = _parse(item["run_at"])
                    if run_at > now:
                        continue
                    latest = _parse(item.get("deadline")) or run_at + grace
                    if now > latest:
                        item["status"] = "missed"
                        item["finished_at"] = _iso(now)
                        item["error"] = "Not started before the deadline (backend was down or busy)"
                        cls._log(item).system("MISSED", "failed", item["error"])
                    else:
                        cls._start(item, reason="Scheduled start")
                    changed = True
            if changed:
                cls._save(items)

    @classmethod
    def recover_after_restart(cls) -> None:
        """Jobs live in memory only: anything still 'running' in the file died with the old process"""
        with cls._lock:
            items = cls._load()
            changed = False
            for item in items:
                if item["status"] == "running":
                    cls._finish_running(item)
                    changed = True
            if changed:
                cls._save(items)

    @classmethod
    def _loop(cls) -> None:
        while not cls._stop.is_set():
            try:
                cls.tick()
            except Exception as e:
                print(f"[deploy-schedule] tick failed: {e}")
            cls._stop.wait(settings.DEPLOY_SCHEDULE_TICK_SECONDS)

    @classmethod
    def start(cls) -> None:
        with cls._lock:
            if cls._thread and cls._thread.is_alive():
                return
            cls.recover_after_restart()
            cls._stop.clear()
            cls._thread = threading.Thread(target=cls._loop, name="deploy-scheduler", daemon=True)
            cls._thread.start()

    @classmethod
    def stop(cls) -> None:
        cls._stop.set()
