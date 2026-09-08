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
from typing import List, Dict, Any, Optional

from app.schemas.device import DeviceCredentials
from app.schemas.command import (
    CommandResponse,
    AdvancedDeployResponse,
    JobSubmitResponse,
    JobStatusResponse,
    JobPaginatedResultsResponse,
)
from app.services.nornir_service import NornirService
from app.core.config import settings

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

class JobService:
    _jobs: Dict[str, JobRecord] = {}
    _lock = threading.Lock()

    @classmethod
    def create_troubleshoot_job(
        cls,
        devices: List[DeviceCredentials],
        command: str,
        vendor_commands: Dict[str, str] = None,
        huawei_command: str = None,
        cisco_command: str = None,
        num_workers: Optional[int] = None,
    ) -> JobSubmitResponse:
        job_id = str(uuid.uuid4())
        workers_val = max(10, min(int(num_workers or getattr(settings, "DEFAULT_NUM_WORKERS", 10)), 100))
        job = JobRecord(
            job_id=job_id,
            job_type="troubleshoot",
            devices=devices,
            payload={
                "command": command,
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
    ) -> JobSubmitResponse:
        job_id = str(uuid.uuid4())
        workers_val = max(10, min(int(num_workers or getattr(settings, "DEFAULT_NUM_WORKERS", 10)), 100))
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
        workers_val = max(10, min(int(num_workers or getattr(settings, "DEFAULT_NUM_WORKERS", 10)), 100))
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
        vendor_commands: Dict[str, List[str]] = None,
        suite_name: str = None,
        num_workers: Optional[int] = None,
    ) -> JobSubmitResponse:
        job_id = str(uuid.uuid4())
        workers_val = max(10, min(int(num_workers or getattr(settings, "DEFAULT_NUM_WORKERS", 10)), 100))
        job = JobRecord(
            job_id=job_id,
            job_type="healthcheck",
            devices=devices,
            payload={
                "check_type": check_type,
                "commands": commands or [],
                "vendor_commands": vendor_commands or {},
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
        chunk_size = max(10, min(int(job.payload.get("num_workers") or getattr(settings, "DEFAULT_NUM_WORKERS", 10)), 100))
        devices = job.devices

        for i in range(0, len(devices), chunk_size):
            if job.cancel_requested:
                job.status = "cancelled"
                job.end_time = time.time()
                return

            chunk = devices[i : i + chunk_size]
            try:
                batch_res = NornirService.run_batch_command(
                    devices=chunk,
                    command=job.payload.get("command", ""),
                    vendor_resolve=True,
                    vendor_commands=job.payload.get("vendor_commands"),
                    huawei_command=job.payload.get("huawei_command"),
                    cisco_command=job.payload.get("cisco_command"),
                    num_workers=chunk_size,
                )
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
                            command=job.payload.get("command", ""),
                            output="",
                            success=False,
                            error=str(e),
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
        chunk_size = max(10, min(int(job.payload.get("num_workers") or getattr(settings, "DEFAULT_NUM_WORKERS", 10)), 100))
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
                )
                with cls._lock:
                    job.results.extend(batch_res.results)
                    job.completed_devices += len(chunk)
                    job.success_count += batch_res.success_count
                    job.failed_count += batch_res.failed_count
            except Exception as e:
                with cls._lock:
                    for dev in chunk:
                        job.results.append(AdvancedDeployResponse(
                            host=dev.host or "Unknown",
                            command="Batch Deploy Error",
                            output="",
                            success=False,
                            error=str(e),
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
        chunk_size = max(10, min(int(job.payload.get("num_workers") or getattr(settings, "DEFAULT_NUM_WORKERS", 10)), 100))
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
                            command="Backup Running Config",
                            output="",
                            success=False,
                            error=str(e),
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
        chunk_size = max(10, min(int(job.payload.get("num_workers") or getattr(settings, "DEFAULT_NUM_WORKERS", 10)), 100))
        devices = job.devices
        check_type = job.payload.get("check_type", "standard")
        commands = job.payload.get("commands", [])
        vendor_commands = job.payload.get("vendor_commands", {})
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
                    ): idx
                    for idx, dev in enumerate(chunk)
                }
                for future in as_completed(future_to_idx):
                    idx = future_to_idx[future]
                    dev = chunk[idx]
                    try:
                        res = future.result()
                        combined_output = "\n".join([f"[{r.command}]\n{r.output}" for r in res.results if r.output])
                        summary_str = ""
                        if res.summary:
                            perf = res.summary.get("performance", {})
                            cpu = perf.get("cpu_percent")
                            mem = perf.get("memory_percent")
                            if cpu or mem:
                                summary_str = f"(CPU: {cpu or 'N/A'}, Mem: {mem or 'N/A'})"
                        chunk_results[idx] = CommandResponse(
                            host=res.host or dev.host or "Unknown",
                            command=f"[{suite_name}] {len(res.results)} cmd(s) {summary_str}".strip(),
                            output=combined_output or "Health Check Completed",
                            success=res.success,
                            error=res.error,
                            execution_time_seconds=res.overall_time_seconds or 0.0,
                        )
                    except Exception as e:
                        chunk_results[idx] = CommandResponse(
                            host=dev.host or "Unknown",
                            command=f"[{suite_name}] Error",
                            output="",
                            success=False,
                            error=str(e),
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
    def cancel_job(cls, job_id: str) -> bool:
        job = cls._jobs.get(job_id)
        if not job:
            return False
        job.cancel_requested = True
        return True
