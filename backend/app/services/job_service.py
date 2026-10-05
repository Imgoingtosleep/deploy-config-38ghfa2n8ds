"""
Job Service for Massive Fleet (10,000+ Devices) Background Automation.
Handles asynchronous task dispatching, Nornir batch chunking, real-time progress
tracking, cancellation, and paginated results streaming.
"""
import time
import uuid
import math
import threading
from datetime import datetime
from typing import List, Dict, Any, Optional, Union, Callable

from app.schemas.device import DeviceCredentials
from app.schemas.command import (
    CommandResponse,
    AdvancedDeployResponse,
    JobSubmitResponse,
    JobStatusResponse,
    JobPaginatedResultsResponse,
)
from app.services.nornir_service import NornirService
from app.services.netmiko_service import NetmikoService
from app.core.config import settings
from app.services.ssh_compat import describe_kex_error

class JobRecord:
    def __init__(self, job_id: str, job_type: str, devices: List[DeviceCredentials], payload: Dict[str, Any] = None):
        self.job_id = job_id
        self.job_type = job_type
        self.devices = devices
        self.payload = payload or {}
        self.status = "pending"  # pending, running, completed, failed, cancelled
        self.total_devices = len(devices)
        self.completed_devices = 0
        self.success_count = 0
        self.failed_count = 0
        self.start_time = time.time()
        self.end_time = None
        self.results: List[Any] = []
        self.error: Optional[str] = None
        self.cancel_requested = False
        self.created_at = datetime.now().isoformat()
        # Per-device step callback (device, action, status, detail), used by scheduled deploy logs
        self.on_event: Optional[Callable[[DeviceCredentials, str, str, str], None]] = None

class JobService:
    _jobs: Dict[str, JobRecord] = {}
    _lock = threading.Lock()

    @classmethod
    def create_troubleshoot_job(
        cls,
        devices: List[DeviceCredentials],
        command: str = "",
        commands: List[str] = None,
        command_regexes: Optional[Union[Dict[str, Any], List[Optional[str]]]] = None,
        vendor_commands: Dict[str, str] = None,
        huawei_command: str = None,
        cisco_command: str = None,
        num_workers: Optional[int] = None,
    ) -> JobSubmitResponse:
        job_id = str(uuid.uuid4())
        workers_val = max(1, min(int(num_workers or getattr(settings, "DEFAULT_NUM_WORKERS", 10)), 100))
        cleaned_commands = [c.strip() for c in (commands or []) if c and c.strip()]
        primary_command = command.strip() if command else (cleaned_commands[0] if cleaned_commands else "")
        job = JobRecord(
            job_id=job_id,
            job_type="troubleshoot",
            devices=devices,
            payload={
                "command": primary_command,
                "commands": cleaned_commands if cleaned_commands else ([primary_command] if primary_command else []),
                "command_regexes": command_regexes or {},
                "vendor_commands": vendor_commands,
                "huawei_command": huawei_command,
                "cisco_command": cisco_command,
                "num_workers": workers_val,
            }
        )
        with cls._lock:
            cls._jobs[job_id] = job

        threading.Thread(target=cls._run_troubleshoot_worker, args=(job_id,), daemon=True).start()

        return JobSubmitResponse(
            job_id=job_id,
            job_type="troubleshoot",
            status="pending",
            total_devices=len(devices),
            created_at=job.created_at,
            message=f"Job {job_id} submitted for {len(devices)} devices in background ({workers_val} workers).",
        )

    @classmethod
    def create_deploy_job(
        cls,
        devices: List[DeviceCredentials],
        config_commands: List[str],
        save_config: bool = True,
        pre_check_commands: List[str] = None,
        post_check_commands: List[str] = None,
        backup_before_deploy: bool = False,
        num_workers: Optional[int] = None,
        on_event: Optional[Callable[[DeviceCredentials, str, str, str], None]] = None,
    ) -> JobSubmitResponse:
        job_id = str(uuid.uuid4())
        workers_val = max(1, min(int(num_workers or getattr(settings, "DEFAULT_NUM_WORKERS", 10)), 100))
        job = JobRecord(
            job_id=job_id,
            job_type="deploy",
            devices=devices,
            payload={
                "config_commands": config_commands,
                "save_config": save_config,
                "pre_check_commands": pre_check_commands or [],
                "post_check_commands": post_check_commands or [],
                "backup_before_deploy": backup_before_deploy,
                "num_workers": workers_val,
            }
        )
        job.on_event = on_event
        with cls._lock:
            cls._jobs[job_id] = job

        threading.Thread(target=cls._run_deploy_worker, args=(job_id,), daemon=True).start()

        return JobSubmitResponse(
            job_id=job_id,
            job_type="deploy",
            status="pending",
            total_devices=len(devices),
            created_at=job.created_at,
            message=f"Deployment job {job_id} submitted for {len(devices)} devices in background ({workers_val} workers).",
        )

    @classmethod
    def create_backup_job(cls, devices: List[DeviceCredentials], num_workers: Optional[int] = None) -> JobSubmitResponse:
        job_id = str(uuid.uuid4())
        workers_val = max(1, min(int(num_workers or getattr(settings, "DEFAULT_NUM_WORKERS", 10)), 100))
        job = JobRecord(
            job_id=job_id,
            job_type="backup",
            devices=devices,
            payload={"num_workers": workers_val}
        )
        with cls._lock:
            cls._jobs[job_id] = job

        threading.Thread(target=cls._run_backup_worker, args=(job_id,), daemon=True).start()

        return JobSubmitResponse(
            job_id=job_id,
            job_type="backup",
            status="pending",
            total_devices=len(devices),
            created_at=job.created_at,
            message=f"Fleet backup job {job_id} submitted for {len(devices)} devices in background ({workers_val} workers).",
        )

    @classmethod
    def create_healthcheck_job(
        cls,
        devices: List[DeviceCredentials],
        check_type: str = "standard",
        commands: List[str] = None,
        command_regexes: Optional[Union[Dict[str, Any], List[Optional[str]]]] = None,
        vendor_commands: Dict[str, List[str]] = None,
        suite_name: str = None,
        num_workers: Optional[int] = None,
        command_sets: Optional[List[Dict[str, Any]]] = None,
    ) -> JobSubmitResponse:
        job_id = str(uuid.uuid4())
        workers_val = max(1, min(int(num_workers or getattr(settings, "DEFAULT_NUM_WORKERS", 10)), 100))
        job = JobRecord(
            job_id=job_id,
            job_type="healthcheck",
            devices=devices,
            payload={
                "check_type": check_type,
                "commands": commands or [],
                "command_regexes": command_regexes or {},
                "vendor_commands": vendor_commands or {},
                "command_sets": command_sets or None,
                "suite_name": suite_name or check_type.capitalize(),
                "num_workers": workers_val,
            }
        )
        with cls._lock:
            cls._jobs[job_id] = job

        threading.Thread(target=cls._run_healthcheck_worker, args=(job_id,), daemon=True).start()

        label = suite_name or check_type
        return JobSubmitResponse(
            job_id=job_id,
            job_type="healthcheck",
            status="pending",
            total_devices=len(devices),
            created_at=job.created_at,
            message=f"Fleet health check job {job_id} ({label}) submitted for {len(devices)} devices in background ({workers_val} workers).",
        )


    @classmethod
    def _run_troubleshoot_worker(cls, job_id: str):
        job = cls._jobs.get(job_id)
        if not job:
            return

        job.status = "running"
        job.start_time = time.time()
        chunk_size = max(1, min(int(job.payload.get("num_workers") or getattr(settings, "DEFAULT_NUM_WORKERS", 10)), 100))
        devices = job.devices
        cmds = [c for c in (job.payload.get("commands") or []) if c and c.strip()]
        cmd_regexes = job.payload.get("command_regexes") or {}

        for i in range(0, len(devices), chunk_size):
            if job.cancel_requested:
                job.status = "cancelled"
                job.end_time = time.time()
                return

            chunk = devices[i : i + chunk_size]

            if len(cmds) > 1:
                from concurrent.futures import ThreadPoolExecutor, as_completed
                chunk_results = [None] * len(chunk)
                with ThreadPoolExecutor(max_workers=min(len(chunk), chunk_size)) as executor:
                    future_to_idx = {
                        executor.submit(
                            NetmikoService.send_multiple_commands,
                            dev,
                            cmds,
                            cmd_regexes,
                        ): idx
                        for idx, dev in enumerate(chunk)
                    }
                    for future in as_completed(future_to_idx):
                        idx = future_to_idx[future]
                        dev = chunk[idx]
                        try:
                            res = future.result()
                            results_list = res.get("results", [])
                            raw_blocks = []
                            regex_blocks = []

                            for r_i, r in enumerate(results_list, 1):
                                cmd_str = r.get("command", "")
                                out_str = r.get("output", "")
                                reg_pat = r.get("regex")
                                reg_out = r.get("regex_output")
                                matched_cnt = r.get("matched_lines", 0)

                                raw_blocks.append(f"=== [#{r_i}] {cmd_str} ===\n{out_str}")

                                if reg_pat and str(reg_pat).strip():
                                    reg_header = f"=== [#{r_i}] {cmd_str} | Regex: /{reg_pat}/ ({matched_cnt} matches) ==="
                                    reg_body = reg_out if (reg_out and reg_out.strip()) else "--- No lines matched regex filter ---"
                                    regex_blocks.append(f"{reg_header}\n{reg_body}")
                                else:
                                    reg_header = f"=== [#{r_i}] {cmd_str} | (No Regex Filter - Full Output) ==="
                                    regex_blocks.append(f"{reg_header}\n{out_str}")

                            separator = "\n\n" + "-" * 78 + "\n\n"
                            combined_raw = separator.join(raw_blocks) if raw_blocks else "Completed"
                            combined_regex = separator.join(regex_blocks) if regex_blocks else combined_raw

                            sysname = res.get("sysname_device") or NetmikoService.extract_device_sysname(combined_raw)
                            is_succ = bool(res.get("success", False))
                            err_val = res.get("error")
                            if not is_succ:
                                err_val = cls.format_failure_diagnostic(err_val or res, host_ip=dev.host or "")

                            chunk_results[idx] = CommandResponse(
                                host=dev.host or "Unknown",
                                hostname_import=getattr(dev, "name", None) or "",
                                sysname_device=sysname,
                                command=f"{len(cmds)} command(s)",
                                output=combined_raw or "Completed",
                                regex_output=combined_regex or combined_raw,
                                success=is_succ,
                                error=err_val,
                                execution_time_seconds=res.get("overall_time_seconds") or 0.0,
                                authenticated_username=res.get("authenticated_username") or getattr(dev, "username", None),
                                authenticated_credential=res.get("authenticated_credential"),
                            )
                        except Exception as dev_err:
                            chunk_results[idx] = CommandResponse(
                                host=dev.host or "Unknown",
                                hostname_import=getattr(dev, "name", None) or "",
                                sysname_device="",
                                command=f"{len(cmds)} command(s)",
                                output="",
                                success=False,
                                error=cls.format_failure_diagnostic(str(dev_err), host_ip=dev.host or ""),
                                execution_time_seconds=0.0,
                            )
                with cls._lock:
                    valid_results = [r for r in chunk_results if r is not None]
                    job.results.extend(valid_results)
                    job.completed_devices += len(chunk)
                    job.success_count += sum(1 for r in valid_results if r.success)
                    job.failed_count += sum(1 for r in valid_results if not r.success)
            else:
                try:
                    single_cmd = job.payload.get("command", "") or (cmds[0] if cmds else "")
                    batch_res = NornirService.run_batch_command(
                        devices=chunk,
                        command=single_cmd,
                        vendor_resolve=True,
                        vendor_commands=job.payload.get("vendor_commands"),
                        huawei_command=job.payload.get("huawei_command"),
                        cisco_command=job.payload.get("cisco_command"),
                        num_workers=chunk_size,
                    )
                    cmd_regex = None
                    if isinstance(cmd_regexes, (list, tuple)):
                        cmd_regex = cmd_regexes[0] if len(cmd_regexes) > 0 else None
                    elif isinstance(cmd_regexes, dict):
                        if "0" in cmd_regexes:
                            cmd_regex = cmd_regexes.get("0")
                        elif 0 in cmd_regexes:
                            cmd_regex = cmd_regexes.get(0)
                        else:
                            cmd_regex = (
                                cmd_regexes.get(single_cmd)
                                or cmd_regexes.get(single_cmd.strip())
                                or (next(iter(cmd_regexes.values()), None) if len(cmd_regexes) == 1 else None)
                            )
                    if cmd_regex and cmd_regex.strip():
                        import re
                        try:
                            rx = re.compile(cmd_regex.strip(), re.MULTILINE | re.IGNORECASE)
                            for r in batch_res.results:
                                r.regex = cmd_regex.strip()
                                lines = (r.output or "").splitlines()
                                matched = [l for l in lines if rx.search(l)]
                                r.regex_output = "\n".join(matched)
                                r.matched_lines = len(matched)
                        except Exception:
                            pass
                    with cls._lock:
                        job.results.extend(batch_res.results)
                        job.completed_devices += len(chunk)
                        job.success_count += batch_res.success_count
                        job.failed_count += batch_res.failed_count
                except Exception as e:
                    with cls._lock:
                        for dev in chunk:
                            job.results.append(CommandResponse(
                                host=dev.host or "Unknown",
                                hostname_import=getattr(dev, "name", None) or "",
                                sysname_device="",
                                command=job.payload.get("command", ""),
                                output="",
                                success=False,
                                error=cls.format_failure_diagnostic(str(e), host_ip=dev.host or ""),
                                execution_time_seconds=0.0,
                            ))
                        job.completed_devices += len(chunk)
                        job.failed_count += len(chunk)

            time.sleep(0.01)

        job.status = "completed"
        job.end_time = time.time()

    @classmethod
    def _run_deploy_worker(cls, job_id: str):
        job = cls._jobs.get(job_id)
        if not job:
            return

        job.status = "running"
        job.start_time = time.time()
        chunk_size = max(1, min(int(job.payload.get("num_workers") or getattr(settings, "DEFAULT_NUM_WORKERS", 10)), 100))
        devices = job.devices

        for i in range(0, len(devices), chunk_size):
            if job.cancel_requested:
                job.status = "cancelled"
                job.end_time = time.time()
                return

            chunk = devices[i : i + chunk_size]
            try:
                batch_res = NornirService.run_batch_deploy(
                    devices=chunk,
                    config_commands=job.payload.get("config_commands", []),
                    save_config=job.payload.get("save_config", True),
                    pre_check_commands=job.payload.get("pre_check_commands", []),
                    post_check_commands=job.payload.get("post_check_commands", []),
                    backup_before_deploy=job.payload.get("backup_before_deploy", False),
                    num_workers=chunk_size,
                    on_event=job.on_event,
                )
                with cls._lock:
                    job.results.extend(batch_res.results)
                    job.completed_devices += len(chunk)
                    job.success_count += batch_res.success_count
                    job.failed_count += batch_res.failed_count
            except Exception as e:
                if job.on_event:
                    for dev in chunk:
                        try:
                            job.on_event(dev, "ERROR", "failed", f"Batch deploy error: {e}")
                        except Exception:
                            pass
                with cls._lock:
                    for dev in chunk:
                        job.results.append(AdvancedDeployResponse(
                            host=dev.host or "Unknown",
                            hostname_import=getattr(dev, "name", None) or "",
                            sysname_device="",
                            command="Batch Deploy Error",
                            output="",
                            success=False,
                            error=cls.format_failure_diagnostic(str(e), host_ip=dev.host or ""),
                            execution_time_seconds=0.0,
                            commands_deployed=job.payload.get("config_commands", []),
                            save_output=None,
                            backup_config=None,
                            pre_check_results=[],
                            post_check_results=[],
                            rollback_commands=[],
                            step_logs=[],
                        ))
                    job.completed_devices += len(chunk)
                    job.failed_count += len(chunk)

            time.sleep(0.01)

        job.status = "completed"
        job.end_time = time.time()

    @classmethod
    def _run_backup_worker(cls, job_id: str):
        job = cls._jobs.get(job_id)
        if not job:
            return

        job.status = "running"
        job.start_time = time.time()
        chunk_size = max(1, min(int(job.payload.get("num_workers") or getattr(settings, "DEFAULT_NUM_WORKERS", 10)), 100))
        devices = job.devices

        for i in range(0, len(devices), chunk_size):
            if job.cancel_requested:
                job.status = "cancelled"
                job.end_time = time.time()
                return

            chunk = devices[i : i + chunk_size]
            try:
                batch_res = NornirService.run_batch_backup(devices=chunk, num_workers=chunk_size)
                with cls._lock:
                    job.results.extend(batch_res.results)
                    job.completed_devices += len(chunk)
                    job.success_count += batch_res.success_count
                    job.failed_count += batch_res.failed_count
            except Exception as e:
                with cls._lock:
                    for dev in chunk:
                        job.results.append(CommandResponse(
                            host=dev.host or "Unknown",
                            hostname_import=getattr(dev, "name", None) or "",
                            sysname_device="",
                            command="Backup Running Config",
                            output="",
                            success=False,
                            error=cls.format_failure_diagnostic(str(e), host_ip=dev.host or ""),
                            execution_time_seconds=0.0,
                        ))
                    job.completed_devices += len(chunk)
                    job.failed_count += len(chunk)

            time.sleep(0.01)

        job.status = "completed"
        job.end_time = time.time()

    @classmethod
    def _run_healthcheck_worker(cls, job_id: str):
        from app.api.endpoints.healthcheck import _execute_device_health_check
        from concurrent.futures import ThreadPoolExecutor, as_completed

        job = cls._jobs.get(job_id)
        if not job:
            return

        job.status = "running"
        job.start_time = time.time()
        chunk_size = max(1, min(int(job.payload.get("num_workers") or getattr(settings, "DEFAULT_NUM_WORKERS", 10)), 100))
        devices = job.devices
        check_type = job.payload.get("check_type", "standard")
        commands = job.payload.get("commands", [])
        command_regexes = job.payload.get("command_regexes", {})
        vendor_commands = job.payload.get("vendor_commands", {})
        command_sets = job.payload.get("command_sets")
        suite_name = job.payload.get("suite_name", check_type.capitalize())

        for i in range(0, len(devices), chunk_size):
            if job.cancel_requested:
                job.status = "cancelled"
                job.end_time = time.time()
                return

            chunk = devices[i : i + chunk_size]
            chunk_results = [None] * len(chunk)

            with ThreadPoolExecutor(max_workers=min(len(chunk), chunk_size)) as executor:
                future_to_idx = {
                    executor.submit(
                        _execute_device_health_check,
                        dev,
                        check_type,
                        commands,
                        vendor_commands,
                        command_regexes,
                        command_sets,
                    ): idx
                    for idx, dev in enumerate(chunk)
                }
                for future in as_completed(future_to_idx):
                    idx = future_to_idx[future]
                    dev = chunk[idx]
                    try:
                        res = future.result()
                        raw_blocks = []
                        regex_blocks = []
                        for r_i, r in enumerate(res.results, 1):
                            cmd_str = r.command
                            out_str = r.output or ""
                            reg_pat = r.regex
                            reg_out = r.regex_output
                            matched_cnt = r.matched_lines or 0

                            raw_blocks.append(f"=== [#{r_i}] {cmd_str} ===\n{out_str}")

                            if reg_pat and str(reg_pat).strip():
                                reg_header = f"=== [#{r_i}] {cmd_str} | Regex: /{reg_pat}/ ({matched_cnt} matches) ==="
                                reg_body = reg_out if (reg_out and reg_out.strip()) else "--- No lines matched regex filter ---"
                                regex_blocks.append(f"{reg_header}\n{reg_body}")
                            else:
                                reg_header = f"=== [#{r_i}] {cmd_str} | (No Regex Filter - Full Output) ==="
                                regex_blocks.append(f"{reg_header}\n{out_str}")

                        separator = "\n\n" + "-" * 78 + "\n\n"
                        combined_output = separator.join(raw_blocks) if raw_blocks else "Health Check Completed"
                        combined_regex_output = separator.join(regex_blocks) if regex_blocks else combined_output

                        summary_str = ""
                        if res.summary:
                            perf = res.summary.get("performance", {})
                            cpu = perf.get("cpu_percent")
                            mem = perf.get("memory_percent")
                            if cpu or mem:
                                summary_str = f"(CPU: {cpu or 'N/A'}, Mem: {mem or 'N/A'})"
                        sysname = getattr(res, "sysname_device", None) or NetmikoService.extract_device_sysname(combined_output)
                        chunk_results[idx] = CommandResponse(
                            host=res.host or dev.host or "Unknown",
                            hostname_import=getattr(dev, "name", None) or "",
                            sysname_device=sysname,
                            command=f"[{suite_name}] {len(res.results)} cmd(s) {summary_str}".strip(),
                            output=combined_output or "Health Check Completed",
                            regex_output=combined_regex_output or combined_output,
                            success=res.success,
                            error=res.error if res.success else cls.format_failure_diagnostic(res.error or res, host_ip=dev.host or ""),
                            execution_time_seconds=res.overall_time_seconds or 0.0,
                            authenticated_username=getattr(res, "authenticated_username", None) or getattr(dev, "username", None),
                            authenticated_credential=getattr(res, "authenticated_credential", None),
                        )
                    except Exception as e:
                        chunk_results[idx] = CommandResponse(
                            host=dev.host or "Unknown",
                            hostname_import=getattr(dev, "name", None) or "",
                            sysname_device="",
                            command=f"[{suite_name}] Error",
                            output="",
                            success=False,
                            error=cls.format_failure_diagnostic(str(e), host_ip=dev.host or ""),
                            execution_time_seconds=0.0,
                        )

            with cls._lock:
                valid_results = [r for r in chunk_results if r is not None]
                job.results.extend(valid_results)
                job.completed_devices += len(chunk)
                job.success_count += sum(1 for r in valid_results if r.success)

                job.failed_count += sum(1 for r in valid_results if not r.success)

            time.sleep(0.01)

        job.status = "completed"
        job.end_time = time.time()


    @classmethod
    def get_job_status(cls, job_id: str) -> Optional[JobStatusResponse]:
        job = cls._jobs.get(job_id)
        if not job:
            return None

        now = job.end_time or time.time()
        elapsed = round(now - job.start_time, 2)
        progress = round((job.completed_devices / max(job.total_devices, 1)) * 100, 1)

        return JobStatusResponse(
            job_id=job.job_id,
            job_type=job.job_type,
            status=job.status,
            total_devices=job.total_devices,
            completed_devices=job.completed_devices,
            success_count=job.success_count,
            failed_count=job.failed_count,
            progress_percent=min(progress, 100.0),
            elapsed_seconds=elapsed,
            is_completed=job.status in ["completed", "failed", "cancelled"],
            error=job.error,
        )

    @classmethod
    def get_paginated_results(
        cls,
        job_id: str,
        page: int = 1,
        page_size: int = 50,
        search: str = "",
        status_filter: str = "all",
    ) -> Optional[JobPaginatedResultsResponse]:
        job = cls._jobs.get(job_id)
        if not job:
            return None

        with cls._lock:
            all_results = list(job.results)

        # Apply search filter
        filtered = all_results
        if search:
            q = search.lower().strip()
            filtered = [
                r for r in filtered
                if (getattr(r, "host", "") and q in getattr(r, "host", "").lower()) or
                   (getattr(r, "output", "") and q in getattr(r, "output", "").lower()) or
                   (getattr(r, "error", "") and q in str(getattr(r, "error", "")).lower())
            ]

        # Apply status filter
        if status_filter == "success":
            filtered = [r for r in filtered if getattr(r, "success", False)]
        elif status_filter == "failed":
            filtered = [r for r in filtered if not getattr(r, "success", False)]

        total_items = len(filtered)
        page = max(page, 1)
        page_size = max(min(page_size, 200), 10)
        total_pages = max(math.ceil(total_items / page_size), 1)

        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        page_items = filtered[start_idx:end_idx]

        return JobPaginatedResultsResponse(
            job_id=job_id,
            total_items=total_items,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            success_count=job.success_count,
            failed_count=job.failed_count,
            results=page_items,
        )

    @classmethod
    def get_all_results(cls, job_id: str) -> Optional[List[Dict[str, Any]]]:
        job = cls._jobs.get(job_id)
        if not job:
            return None
        with cls._lock:
            return [
                r.dict() if hasattr(r, "dict") else dict(r)
                for r in job.results
            ]

    @classmethod
    def cancel_job(cls, job_id: str) -> bool:
        job = cls._jobs.get(job_id)
        if not job:
            return False
        job.cancel_requested = True
        return True

    @classmethod
    def format_failure_diagnostic(cls, res: Any, host_ip: str = "", dev: Optional[DeviceCredentials] = None) -> str:
        """
        Format a detailed, human-readable diagnostic explanation of why a device failed.
        Provides root-cause analysis, actionable suggestions, and context.
        """
        raw_error = getattr(res, "error", None) or (res if isinstance(res, (str, Exception)) else "")
        raw_output = getattr(res, "output", None) or ""
        err_str = str(raw_error).strip()
        out_str = str(raw_output).strip()
        combined = f"{err_str} {out_str}".lower()

        kex_reason = describe_kex_error(err_str)
        if kex_reason:
            return kex_reason

        # 1. SSH Channel Error (Unable to open channel / VTY exhausted / Channel allocation failed)
        if "unable to open channel" in combined or "channel closed" in combined or "channel request failed" in combined or "administratively prohibited" in combined:
            return (
                f"SSH Channel Error: Switch rejected SSH session channel (Unable to open channel). "
                f"Common causes: 1) Switch VTY lines are exhausted or hung (check 'display users' / 'show users'), "
                f"2) User account lacks shell/terminal authorization (check service-type ssh / user privilege), "
                f"3) Switch reached max concurrent SSH sessions limit."
            )

        # 2. Authentication Failure
        if "authentication failed" in combined or "auth fail" in combined or "bad authentication" in combined or "authentication to device failed" in combined or "permission denied" in combined:
            sub = ""
            if "priority" in err_str.lower() and "[" in err_str:
                p_part = err_str[err_str.find("["):]
                sub = f" Details: {p_part}."
            return (
                f"Authentication Failed: Username, password, or privilege secret was rejected by device.{sub} "
                f"Please verify credentials, check account lockout status, or adjust fallback profile priority order."
            )

        # 3. Device Type Mismatch
        if "terminal width 511" in combined or "pattern not detected: 'terminal width 511'" in combined:
            return (
                f"Device Type Mismatch: Netmiko sent Cisco IOS setup command ('terminal width 511') to a non-Cisco switch (e.g. Huawei VRP). "
                f"Please change device_type to 'huawei' or use Auto Detect."
            )

        # 4. Connection Timeout
        if "timed out" in combined or "timed-out" in combined or "timeout" in combined or "tcp connection to device failed" in combined or "did not respond" in combined:
            return (
                f"Connection Timeout: Device did not respond within timeout period on port 22/23. "
                f"Common causes: Device is powered off, IP address is unreachable, or intermediate firewall/ACL is dropping packets."
            )

        # 5. Connection Refused
        if "connection refused" in combined:
            return (
                f"Connection Refused: Port 22/23 is closed. "
                f"SSH/Telnet service is disabled on the switch, or an access control list (ACL) is rejecting connection requests."
            )

        # 6. Network Unreachable
        if "no route to host" in combined or "network is unreachable" in combined or "network unreachable" in combined or "host unreached" in combined:
            return (
                f"Network Unreachable: No IP route to host {host_ip or 'device'} from automation server, "
                f"or default gateway dropped packets."
            )

        # 7. Prompt Detection Timeout
        if "pattern not detected" in combined:
            return (
                f"Prompt Detection Timeout: Connected successfully but device CLI prompt was not recognized within timeout. "
                f"Check device_type setting or inspect for unexpected interactive login banners."
            )

        # 8. SSH Cipher / Algorithm Mismatch
        if "incompatible ssh peer" in combined or "cipher" in combined or "kex" in combined or "algorithm" in combined:
            return (
                f"SSH Cipher/Algorithm Mismatch: Switch rejected modern SSH key exchange algorithms or ciphers. "
                f"Legacy switch firmware requires older SSH ciphers/KEX algorithms."
            )

        # 9. CLI Command Syntax Error
        if "unrecognized command" in combined or "invalid input" in combined or "syntax error" in combined or "wrong parameter" in combined or "error: incomplete command" in combined:
            for line in out_str.splitlines():
                l_lower = line.lower()
                if "error:" in l_lower or "unrecognized" in l_lower or "invalid input" in l_lower or "syntax" in l_lower:
                    return f"CLI Syntax Error: Command rejected by switch CLI parser - {line.strip()}"
            return f"CLI Syntax Error: Command was rejected by device parser ({err_str or 'Syntax error'})."

        # 10. Multi-command failure detail
        if "command failure:" in combined or "command #" in combined:
            return f"Command Execution Failure: {err_str}"

        # 11. Job Cancelled
        if "cancelled" in combined or "canceled" in combined or "aborted" in combined:
            return "Job Aborted: Execution was manually cancelled by user."

        # 12. Non-empty error string
        if err_str:
            return f"Execution Error: {err_str}"

        # 13. Empty error string but CLI output has error keywords
        if out_str:
            for line in out_str.splitlines():
                if any(w in line.lower() for w in ["error", "fail", "denied", "abort", "reject"]):
                    return f"Execution Error from CLI Output: {line.strip()}"

        return "Execution Failed: Device connection disconnected or aborted without returning output."

    @classmethod
    def generate_job_zip(cls, job_id: str) -> Optional[bytes]:
        """
        Generate a comprehensive in-memory ZIP package containing:
        1. report_summary.csv: Overall summary (total, success, failed, duration, rate).
        2. report_per_device.csv: Columns [hostname_import, sysname_device, ip, result, detail].
        3. raw_logs/{host}_{hostname}.txt: Separate raw CLI output file for each host.
        4. regex_logs/{host}_{hostname}.txt: Separate regex filtered output file for each host.
        """
        import io
        import re
        import csv
        import zipfile

        job = cls._jobs.get(job_id)
        if not job:
            return None

        with cls._lock:
            results_snapshot = list(job.results)
            devices_snapshot = list(job.devices)
            total_devs = job.total_devices
            succ_cnt = job.success_count
            fail_cnt = job.failed_count
            job_type = job.job_type
            status = job.status
            start_time = job.start_time
            end_time = job.end_time or time.time()
            created_at = job.created_at

        elapsed = round(end_time - start_time, 2)
        rate = round((succ_cnt / max(total_devs, 1)) * 100, 1)

        # 1. Build report_summary.csv
        summary_csv_buffer = io.StringIO()
        summary_csv_writer = csv.writer(summary_csv_buffer, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
        summary_csv_writer.writerow([
            "total",
            "success",
            "fail",
            "success_rate",
            "elapsed_seconds",
            "job_id",
            "job_type",
            "status",
            "created_at",
        ])
        summary_csv_writer.writerow([
            total_devs,
            succ_cnt,
            fail_cnt,
            f"{rate}%",
            f"{elapsed}s",
            job_id,
            job_type.upper(),
            status.upper(),
            created_at,
        ])
        summary_csv_text = summary_csv_buffer.getvalue()

        # 2. Build report_per_device.csv
        csv_buffer = io.StringIO()
        csv_writer = csv.writer(csv_buffer, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
        csv_writer.writerow(["hostname_import", "sysname_device", "ip", "result", "detail"])

        dev_map_by_host = {d.host: d for d in devices_snapshot if getattr(d, "host", None)}

        def sanitize_name(val: str) -> str:
            cleaned = re.sub(r'[\\/*?:"<>| \t]+', "_", str(val or "")).strip("_")
            return cleaned or "device"

        zip_buffer = io.BytesIO()
        seen_filenames: Dict[str, int] = {}

        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("report_summary.csv", summary_csv_text)

            for idx, res in enumerate(results_snapshot):
                host_ip = getattr(res, "host", None) or (devices_snapshot[idx].host if idx < len(devices_snapshot) else f"host_{idx+1}")
                linked_dev = dev_map_by_host.get(host_ip) or (devices_snapshot[idx] if idx < len(devices_snapshot) else None)

                h_import = (
                    getattr(res, "hostname_import", None)
                    or (getattr(linked_dev, "name", None) if linked_dev else None)
                    or ""
                )

                sysname = getattr(res, "sysname_device", None) or ""
                if not sysname and getattr(res, "output", None):
                    sysname = NetmikoService.extract_device_sysname(res.output)

                is_success = bool(getattr(res, "success", False))
                result_str = "success" if is_success else "fail"

                if not is_success:
                    detail_str = cls.format_failure_diagnostic(res, host_ip=host_ip, dev=linked_dev)
                else:
                    t_exec = getattr(res, "execution_time_seconds", None)
                    t_str = f"{t_exec}s" if t_exec is not None else "0.0s"
                    detail_str = f"Completed successfully ({t_str})"

                csv_writer.writerow([h_import, sysname, host_ip, result_str, detail_str])

                # Raw CLI Output
                raw_out = getattr(res, "output", None) or ""
                if not raw_out and not is_success:
                    raw_out = f"[Execution Failed]\nHost: {host_ip}\nError: {detail_str}\n"

                # Regex Filtered Output
                regex_out = getattr(res, "regex_output", None) or raw_out
                if not regex_out and not is_success:
                    regex_out = f"[Execution Failed]\nHost: {host_ip}\nError: {detail_str}\n"

                # Construct unique file base name
                if h_import:
                    base_name = f"{sanitize_name(host_ip)}_{sanitize_name(h_import)}"
                elif sysname:
                    base_name = f"{sanitize_name(host_ip)}_{sanitize_name(sysname)}"
                else:
                    base_name = f"{sanitize_name(host_ip)}"

                if base_name in seen_filenames:
                    seen_filenames[base_name] += 1
                    file_key = f"{base_name}_{seen_filenames[base_name]}.txt"
                else:
                    seen_filenames[base_name] = 1
                    file_key = f"{base_name}.txt"

                zf.writestr(f"raw_logs/{file_key}", raw_out)
                zf.writestr(f"regex_logs/{file_key}", regex_out)

            zf.writestr("report_per_device.csv", csv_buffer.getvalue())

        zip_buffer.seek(0)
        return zip_buffer.getvalue()

