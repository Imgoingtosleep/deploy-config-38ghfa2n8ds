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

A repeating schedule (repeat=hourly|daily|weekly) goes running -> scheduled again with run_at
moved to its next occurrence, and only reaches a terminal status once occurrences / repeat_until
are used up or a user cancels the series. Every run of one schedule appends to the same log file
and to item["runs"].
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
from app.services.recurrence import describe, next_occurrence

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
    def _tz(cls, item: Dict[str, Any]):
        return resolve_tz(item.get("client_tz"), item.get("client_offset_minutes"))

    @classmethod
    def _log(cls, item: Dict[str, Any]) -> DeployLog:
        path = os.path.join(os.path.abspath(settings.DEPLOY_LOG_DIR), f"{item['id']}.log")
        return DeployLog(path, cls._tz(item))

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
        out = {k: v for k, v in item.items() if k not in ("request", "runs")}
        out.setdefault("repeat", "once")
        out.setdefault("run_count", 0)
        if detail:
            out["runs"] = item.get("runs") or []
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
        if req.repeat_until is not None and req.repeat_until <= now:
            raise ScheduleError("repeat_until is in the past")
        if req.repeat != "once" and req.deadline is not None:
            raise ScheduleError("A repeating schedule uses repeat_until, not deadline")

        # A weekly series whose start day is not one of the chosen weekdays begins on the first chosen one
        run_at = req.run_at
        if req.repeat == "weekly" and run_at.astimezone(resolve_tz(req.client_tz, req.client_offset_minutes)).weekday() \
                not in req.weekdays:
            run_at = next_occurrence(
                run_at, "weekly", 1, req.weekdays,
                resolve_tz(req.client_tz, req.client_offset_minutes), after=run_at - timedelta(seconds=1),
            )
            if req.repeat_until is not None and run_at > req.repeat_until:
                raise ScheduleError("No chosen weekday falls between the start time and repeat_until")

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
            "run_at": _iso(run_at),
            "first_run_at": _iso(run_at),
            "deadline": _iso(req.deadline),
            "repeat": req.repeat,
            "interval": req.interval,
            "weekdays": req.weekdays,
            "occurrences": req.occurrences,
            "repeat_until": _iso(req.repeat_until),
            "repeat_label": describe(req.repeat, req.interval, req.weekdays, req.occurrences),
            "run_count": 0,
            "missed_count": 0,
            "runs": [],
            "stop_repeat": False,
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
        log.system("SCHEDULED", "", f"run_at={format_local(run_at, log.tz)}"
                   + (f", deadline={format_local(req.deadline, log.tz)}" if req.deadline else ""))
        if req.repeat != "once":
            log.system("REPEAT", "", item["repeat_label"]
                       + (f", until {format_local(req.repeat_until, log.tz)}" if req.repeat_until else ""))

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
                item["stop_repeat"] = True  # no further occurrence once this run stops
                cls._save(items)
                cls._log(item).system("CANCEL", "", "Cancel requested while running; devices already started will finish")
                return cls._public(item)
            if item["status"] != "scheduled":
                raise ScheduleError(f"Cannot cancel a schedule in status '{item['status']}'")
            item["status"] = "cancelled"
            item["stop_repeat"] = True
            item["finished_at"] = _iso(_now())
            cls._save(items)
        cls._log(item).system("CANCELLED", "", "Cancelled before start; the series is stopped")
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

    # ---------- recurrence ----------
    @classmethod
    def _next_run_at(cls, item: Dict[str, Any], after: datetime) -> Optional[datetime]:
        """When this schedule should run again, or None when the series is over"""
        if item.get("repeat", "once") == "once" or item.get("stop_repeat"):
            return None
        occurrences = item.get("occurrences")
        if occurrences and item.get("run_count", 0) >= occurrences:
            return None
        nxt = next_occurrence(
            _parse(item["run_at"]), item["repeat"], item.get("interval") or 1,
            item.get("weekdays") or [], cls._tz(item), after,
        )
        until = _parse(item.get("repeat_until"))
        if nxt is None or (until and nxt > until):
            return None
        return nxt

    @classmethod
    def _record_run(cls, item: Dict[str, Any], status: str) -> None:
        runs = item.setdefault("runs", [])
        runs.append({
            "n": len(runs) + 1,
            "run_at": item["run_at"],
            "started_at": item.get("started_at"),
            "finished_at": item.get("finished_at"),
            "status": status,
            "summary": item.get("summary"),
            "error": item.get("error"),
        })
        del runs[:-50]  # keep the last 50 runs; the log file holds the full history

    @classmethod
    def _end_run(cls, item: Dict[str, Any], status: str) -> None:
        """Finish one occurrence: either queue the next one or leave the series in `status`"""
        item["status"] = status
        item["finished_at"] = _iso(_now())
        if item.get("repeat", "once") == "once":
            return
        cls._record_run(item, status)
        nxt = cls._next_run_at(item, _now())
        log = cls._log(item)
        if nxt is None:
            log.system("SERIES END", status, f"{item.get('run_count', 0)} run(s) done, no further occurrence")
            return
        item["run_at"] = _iso(nxt)
        item["status"] = "scheduled"
        item["job_id"] = None
        item["started_at"] = None
        item["finished_at"] = None
        item["summary"] = None
        item["error"] = None
        total = f"/{item['occurrences']}" if item.get("occurrences") else ""
        log.system("NEXT RUN", "scheduled",
                   f"run {item.get('run_count', 0) + 1}{total} at {format_local(nxt, log.tz)}")

    # ---------- scheduler ----------
    @classmethod
    def _start(cls, item: Dict[str, Any], reason: str) -> None:
        """Submit the deploy job. Caller holds the lock and saves items afterwards."""
        req = BatchDeployRequest(**item["request"])
        log = cls._log(item)
        commands = [c.strip() for c in req.config_commands if c.strip() and not c.strip().startswith(("!", "#"))]
        run_no = item.get("run_count", 0) + 1
        if item.get("repeat", "once") != "once":
            total = f"/{item['occurrences']}" if item.get("occurrences") else ""
            reason = f"{reason} (run {run_no}{total})"
        item["run_count"] = run_no
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
            item["error"] = str(e)
            log.system("FINISHED", "failed", f"Could not start job: {e}")
            cls._end_run(item, "failed")
            return
        item["status"] = "running"
        item["job_id"] = res.job_id
        item["started_at"] = _iso(_now())
        log.system("JOB", "", f"job_id={res.job_id}")

    @classmethod
    def _finish_running(cls, item: Dict[str, Any]) -> bool:
        status = JobService.get_job_status(item["job_id"]) if item.get("job_id") else None
        if status is None:
            item["error"] = "Backend restarted while the deploy was running; check the devices in the log"
            cls._log(item).system("FINISHED", "failed", item["error"])
            cls._end_run(item, "interrupted")
            return True
        if not status.is_completed:
            return False
        outcome = "cancelled" if status.status == "cancelled" else "completed"
        item["summary"] = {
            "total": status.total_devices,
            "completed": status.completed_devices,
            "success": status.success_count,
            "failed": status.failed_count,
            "elapsed_seconds": status.elapsed_seconds,
        }
        cls._log(item).system(
            "FINISHED", outcome,
            f"success={status.success_count}, failed={status.failed_count}, "
            f"done={status.completed_devices}/{status.total_devices}, {status.elapsed_seconds}s",
        )
        cls._end_run(item, outcome)
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
                        item["error"] = "Not started before the deadline (backend was down or busy)"
                        item["missed_count"] = item.get("missed_count", 0) + 1
                        cls._log(item).system("MISSED", "failed", item["error"])
                        cls._end_run(item, "missed")
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
