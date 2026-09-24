"""
Subnet LLDP scan: expand subnets / ranges -> TCP port check -> LLDP collect on
reachable hosts (LldpService.collect_device) as a background job.
Every host is written to disk as soon as it finishes, so logs survive a
closed browser or a backend crash:

  <LLDP_LOG_DIR>/<timestamp>_<job_id[:8]>/
    job.log              timeline of the whole job
    scan_result.csv      one row per IP (status, sysname, credential, detail)
    lldp_inventory.csv   one row per LLDP neighbor
    hosts/<ip>_<sysname>.log   execution log + raw CLI output (reachable hosts only)
    summary.json, topology.json, lldp_report.xlsx   written when the job ends
"""
import csv
import io
import ipaddress
import json
import os
import re
import socket
import threading
import time
import traceback
import uuid
import zipfile
from collections import deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Tuple

from app.core.config import settings
from app.schemas.device import DeviceCredentials
from app.services.job_service import JobRecord, JobService
from app.services.lldp_service import LldpService

INVENTORY_COLUMNS = [
    "Local Device", "Local Model", "Local IP", "Local Port", "Remote Device", "Remote Model", "Remote Port", "Remote IP",
]
SCAN_COLUMNS = [
    "ip", "depth", "tcp_open", "status", "sysname", "model", "credential", "command_profile",
    "neighbors", "time_s", "detail",
]

STATUS_SUCCESS = "SUCCESS"
STATUS_NO_LLDP = "NO_LLDP"
STATUS_DUPLICATE = "DUPLICATE"
STATUS_AUTH_FAILED = "AUTH_FAILED"
STATUS_FAILED = "FAILED"
STATUS_UNREACHABLE = "UNREACHABLE"
ALL_STATUSES = [STATUS_SUCCESS, STATUS_NO_LLDP, STATUS_DUPLICATE, STATUS_AUTH_FAILED, STATUS_FAILED, STATUS_UNREACHABLE]
LOGGED_IN_STATUSES = {STATUS_SUCCESS, STATUS_NO_LLDP, STATUS_DUPLICATE}
# Could not get in with this profile: worth one more sweep with the next priority profile.
# UNREACHABLE is not here - another credential cannot fix a closed port.
RETRYABLE_STATUSES = {STATUS_AUTH_FAILED, STATUS_FAILED}


def split_targets(items: Iterable[str]) -> List[str]:
    """Accept list items that may themselves contain several tokens separated by space / comma / newline"""
    tokens: List[str] = []
    for item in items or []:
        tokens += [t for t in re.split(r"[\s,;]+", str(item)) if t]
    return tokens


def parse_range(token: str) -> Tuple[int, int]:
    """
    Token -> inclusive (first, last) IPv4 integers.
    Supports 10.0.0.0/24, 10.0.0.5, 10.0.0.10-10.0.0.50 and 10.0.0.10-50.
    Network and broadcast addresses are skipped for prefixes shorter than /31.
    """
    tok = token.strip()
    try:
        if "-" in tok:
            a, b = (x.strip() for x in tok.split("-", 1))
            start = int(ipaddress.IPv4Address(a))
            if "." in b:
                end = int(ipaddress.IPv4Address(b))
            else:
                if not b.isdigit() or int(b) > 255:
                    raise ValueError("last octet must be 0-255")
                end = (start & 0xFFFFFF00) | int(b)
            if end < start:
                raise ValueError("range end is before start")
            return start, end
        net = ipaddress.ip_network(tok, strict=False)
        if net.version != 4:
            raise ValueError("only IPv4 is supported")
        first, last = int(net.network_address), int(net.broadcast_address)
        if net.num_addresses > 2:
            first, last = first + 1, last - 1
        return first, last
    except ValueError as e:
        raise ValueError(f"Invalid target '{token}': {e}")


def in_ranges(ip: str, ranges: List[Tuple[int, int]]) -> bool:
    try:
        value = int(ipaddress.IPv4Address(ip))
    except ValueError:
        return False
    return any(start <= value <= end for start, end in ranges)


def expand_targets(targets: Iterable[str], exclude: Iterable[str] = (), limit: Optional[int] = None) -> List[str]:
    limit = limit or settings.LLDP_SCAN_MAX_IPS
    ranges = [parse_range(t) for t in split_targets(targets)]
    ex_ranges = [parse_range(t) for t in split_targets(exclude)]
    # Check the size before materializing so a typo like /8 cannot eat memory
    total = sum(end - start + 1 for start, end in ranges)
    if total > limit:
        raise ValueError(f"{total} IPs exceeds the scan limit of {limit} (LLDP_SCAN_MAX_IPS)")
    seen = set()
    ips: List[str] = []
    for start, end in ranges:
        for value in range(start, end + 1):
            if value in seen or any(xs <= value <= xe for xs, xe in ex_ranges):
                continue
            seen.add(value)
            ips.append(str(ipaddress.IPv4Address(value)))
    return ips


def tcp_alive(ip: str, port: int, timeout: float) -> bool:
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except OSError:
        return False


def _safe_name(value: Any) -> str:
    return re.sub(r'[\\/*?:"<>| \t]+', "_", str(value or "")).strip("_") or "host"


class ScanLogWriter:
    """Append-only, thread-safe writer for one scan job's log directory"""

    def __init__(self, base_dir: str, job_id: str):
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.dir = os.path.abspath(os.path.join(base_dir, f"{stamp}_{job_id[:8]}"))
        self.hosts_dir = os.path.join(self.dir, "hosts")
        os.makedirs(self.hosts_dir, exist_ok=True)
        self.tail: deque = deque(maxlen=1000)
        self._lock = threading.Lock()
        self._write_csv_row("scan_result.csv", SCAN_COLUMNS)
        self._write_csv_row("lldp_inventory.csv", INVENTORY_COLUMNS)

    def _write_csv_row(self, name: str, row: List[Any]):
        with open(os.path.join(self.dir, name), "a", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(row)

    def log(self, message: str):
        line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}"
        with self._lock:
            self.tail.append(line)
            with open(os.path.join(self.dir, "job.log"), "a", encoding="utf-8") as f:
                f.write(line + "\n")

    def write_host(self, host: Dict[str, Any]):
        with self._lock:
            self._write_csv_row("scan_result.csv", [
                host["ip"], host["depth"], host["tcp_open"], host["status"], host["hostname"], host.get("model", ""),
                host.get("credential", ""), host.get("command_profile", ""),
                host["neighbors_found"], host["execution_time_seconds"], host.get("detail", ""),
            ])
            if host["neighbors"]:
                with open(os.path.join(self.dir, "lldp_inventory.csv"), "a", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f)
                    for n in host["neighbors"]:
                        writer.writerow([n.get(c, "") for c in INVENTORY_COLUMNS])
            if host["tcp_open"]:
                path = os.path.join(self.hosts_dir, f"{_safe_name(host['ip'])}_{_safe_name(host['hostname'])}.log")
                with open(path, "w", encoding="utf-8") as f:
                    f.write(
                        f"Status     : {host['status']}\n"
                        f"Detail     : {host.get('detail', '')}\n"
                        f"Credential : {host.get('credential', '')}\n"
                        f"Depth      : {host['depth']}\n"
                        f"Time (s)   : {host['execution_time_seconds']}\n\n"
                        f"{host.get('log', '')}\n\n"
                        f"{'=' * 50}\nRAW TERMINAL OUTPUT:\n{'=' * 50}\n"
                        f"{host.get('raw_output') or 'No Data'}\n"
                    )

    def write_final(
        self,
        summary: Dict[str, Any],
        neighbors: List[Dict[str, Any]],
        hosts: List[Dict[str, Any]],
        topology: Dict[str, Any],
    ):
        with open(os.path.join(self.dir, "summary.json"), "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        with open(os.path.join(self.dir, "topology.json"), "w", encoding="utf-8") as f:
            json.dump(topology, f, indent=2, ensure_ascii=False)
        with open(os.path.join(self.dir, "lldp_report.xlsx"), "wb") as f:
            f.write(LldpService.build_excel(neighbors, hosts))

    def zip_bytes(self) -> bytes:
        buf = io.BytesIO()
        with self._lock, zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(self.dir):
                for name in files:
                    path = os.path.join(root, name)
                    zf.write(path, os.path.relpath(path, self.dir))
        return buf.getvalue()


class LldpScanService:
    _scans: Dict[str, Dict[str, Any]] = {}

    @classmethod
    def create_job(
        cls,
        targets: List[str],
        exclude: List[str],
        template: DeviceCredentials,
        num_workers: Optional[int] = None,
        enable_tcp_scan: bool = True,
        scan_workers: int = 200,
        tcp_timeout: float = 1.5,
        recursive: bool = False,
        max_depth: int = 3,
        command_profile_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        ips = expand_targets(targets, exclude)
        if not ips:
            raise ValueError("No IP addresses left to scan after applying the exclude list")

        # Ordered profile sweep: Priority 1 over every IP, then the leftovers with Priority 2, ...
        profile_pool: List[str] = []
        for pid in ([template.profile_id] if template.profile_id else []) + list(template.fallback_profile_ids or []):
            if pid and pid not in profile_pool:
                profile_pool.append(pid)

        job_id = str(uuid.uuid4())
        job = JobRecord(
            job_id=job_id,
            job_type="lldp_scan",
            devices=[],
            payload={
                "targets": split_targets(targets),
                "exclude": split_targets(exclude),
                "exclude_ranges": [parse_range(t) for t in split_targets(exclude)],
                "ips": ips,
                "template": template.model_dump(),
                "profile_pool": profile_pool,
                "command_profile_ids": list(command_profile_ids or []),
                "port": template.port or settings.DEFAULT_SSH_PORT,
                "num_workers": max(1, min(int(num_workers or settings.DEFAULT_NUM_WORKERS), settings.MAX_NUM_WORKERS)),
                "enable_tcp_scan": bool(enable_tcp_scan),
                "scan_workers": max(1, min(int(scan_workers), 1000)),
                "tcp_timeout": tcp_timeout,
                "recursive": recursive,
                "max_depth": max_depth,
            },
        )
        job.total_devices = len(ips)
        writer = ScanLogWriter(settings.LLDP_LOG_DIR, job_id)
        state = {
            "writer": writer,
            "phase": "pending",
            "hosts": [],
            "stats": {s: 0 for s in ALL_STATUSES},
            "seen_names": {},
        }
        with JobService._lock:
            JobService._jobs[job_id] = job
            cls._scans[job_id] = state

        threading.Thread(target=cls._run, args=(job_id,), daemon=True).start()
        return {
            "job_id": job_id,
            "job_type": "lldp_scan",
            "status": job.status,
            "total_ips": len(ips),
            "log_dir": writer.dir,
            "created_at": job.created_at,
        }

    @classmethod
    def _run(cls, job_id: str):
        job = JobService._jobs[job_id]
        st = cls._scans[job_id]
        p = job.payload
        writer: ScanLogWriter = st["writer"]
        job.status = "running"
        job.start_time = time.time()

        try:
            tmpl = p["template"]
            cred_desc = (
                f"profile_id={tmpl['profile_id']}" if tmpl.get("profile_id")
                else f"manual user '{tmpl['username']}'" if tmpl.get("username")
                else "default credential profile"
            )
            if len(p.get("profile_pool") or []) > 1:
                cred_desc = f"profile sweep {' -> '.join(p['profile_pool'])} (each profile over every IP in turn)"
            enable_tcp = p.get("enable_tcp_scan", True)
            tcp_desc = (
                f"TCP/{p['port']} timeout={p['tcp_timeout']}s, tcp_workers={p['scan_workers']}"
                if enable_tcp
                else "TCP scan disabled (direct SSH)"
            )
            writer.log(f"Job {job_id} started")
            writer.log(f"Targets: {', '.join(p['targets'])} | Exclude: {', '.join(p['exclude']) or '-'} -> {len(p['ips'])} IP(s)")
            writer.log(
                f"Options: {tcp_desc}, "
                f"ssh_workers={p['num_workers']}, recursive={p['recursive']} (max_depth={p['max_depth']}), credentials={cred_desc}"
            )

            visited_ips = set(p["ips"])
            wave: List[Tuple[str, str]] = [(ip, "") for ip in p["ips"]]
            depth = 0
            while wave and not job.cancel_requested:
                if enable_tcp:
                    st["phase"] = f"TCP scan (depth {depth})"
                    alive = cls._tcp_scan(job, st, wave, depth)
                else:
                    st["writer"].log(f"Depth {depth}: TCP scan disabled -> directly attempting LLDP collect on {len(wave)} IP(s)")
                    alive = wave

                if job.cancel_requested:
                    break

                results = cls._run_profile_passes(job, st, alive, depth)
                if job.cancel_requested:
                    break

                next_wave: List[Tuple[str, str]] = []
                if p["recursive"] and depth < p["max_depth"]:
                    for res in results:
                        for n in res["neighbors"]:
                            ip = n.get("Remote IP")
                            name = n.get("Remote Device") or ""
                            if not ip or ip in visited_ips or name in st["seen_names"]:
                                continue
                            visited_ips.add(ip)
                            if in_ranges(ip, p["exclude_ranges"]):
                                writer.log(f"Depth {depth + 1}: skip {ip} ({name}) - in exclude list")
                                continue
                            next_wave.append((ip, name))
                            # Driver from the neighbor's own LLDP description, else unknown (swept)
                            st.setdefault("drivers", {})[ip] = (
                                LldpService.description_driver(n.get("Remote Description") or n.get("Remote Model") or "")
                                or "unknown"
                            )
                    if next_wave:
                        writer.log(f"Depth {depth + 1}: {len(next_wave)} new device(s) learned from LLDP management IP")
                        with JobService._lock:
                            job.total_devices += len(next_wave)
                wave = next_wave
                depth += 1

            job.status = "cancelled" if job.cancel_requested else "completed"
        except Exception as e:
            job.status = "failed"
            job.error = str(e)
            writer.log(f"JOB ERROR: {e}\n{traceback.format_exc()}")
        finally:
            job.end_time = time.time()
            st["phase"] = job.status
            try:
                report = cls.build_report(job, st)
                summary = {k: v for k, v in report.items() if k not in ("neighbors", "hosts", "topology")}
                writer.write_final(summary, report["neighbors"], report["hosts"], report["topology"])
            except Exception as e:
                writer.log(f"Failed to write final report: {e}")
            s = st["stats"]
            writer.log(
                f"Job {job.status} in {round(job.end_time - job.start_time, 2)}s: "
                + ", ".join(f"{k}={s[k]}" for k in ALL_STATUSES)
            )

    @classmethod
    def _tcp_scan(cls, job: JobRecord, st: Dict[str, Any], wave: List[Tuple[str, str]], depth: int) -> List[Tuple[str, str]]:
        p = job.payload
        port, timeout = p["port"], p["tcp_timeout"]
        alive: List[Tuple[str, str]] = []
        checked = 0
        with ThreadPoolExecutor(max_workers=min(p["scan_workers"], len(wave))) as executor:
            futures = {executor.submit(tcp_alive, ip, port, timeout): (ip, name) for ip, name in wave}
            for fut in as_completed(futures):
                if job.cancel_requested:
                    for f in futures:
                        f.cancel()
                    break
                checked += 1
                ip, name = futures[fut]
                if fut.result():
                    alive.append((ip, name))
                    continue
                cls._record(job, st, {
                    "hostname": name or ip,
                    "ip": ip,
                    "depth": depth,
                    "tcp_open": False,
                    "status": STATUS_UNREACHABLE,
                    "success": False,
                    "error": f"TCP/{port} no response within {timeout}s",
                    "detail": f"TCP/{port} closed or no response within {timeout}s (host down, ACL or firewall)",
                    "credential": "",
                    "model": "",
                    "neighbors_found": 0,
                    "neighbors": [],
                    "log": "",
                    "raw_output": "",
                    "execution_time_seconds": 0,
                })
        alive.sort(key=lambda item: int(ipaddress.IPv4Address(item[0])))
        cancelled = f" (cancelled after {checked} of {len(wave)})" if checked < len(wave) else ""
        st["writer"].log(
            f"Depth {depth}: TCP/{port} scan of {checked} IP(s){cancelled} -> {len(alive)} open, {checked - len(alive)} unreachable"
        )
        return alive

    @classmethod
    def _run_profile_passes(
        cls, job: JobRecord, st: Dict[str, Any], alive: List[Tuple[str, str]], depth: int
    ) -> List[Dict[str, Any]]:
        """
        One full sweep per credential profile: SSH every IP with the Priority 1
        profile, then re-run only the IPs that could not be logged into with
        Priority 2, and so on. A host is recorded once - when it logs in, or when
        the last profile has also failed on it.
        """
        p = job.payload
        passes: List[Optional[str]] = list(p.get("profile_pool") or []) or [None]
        writer: ScanLogWriter = st["writer"]
        collected: List[Dict[str, Any]] = []
        remaining = alive

        for pass_no, profile_id in enumerate(passes, 1):
            if not remaining or job.cancel_requested:
                break
            is_last = pass_no == len(passes)
            label = f"profile {profile_id}" if profile_id else "the job credentials"
            st["phase"] = f"LLDP collect (depth {depth}, priority {pass_no}/{len(passes)})"
            if len(passes) > 1:
                writer.log(f"Depth {depth}: priority {pass_no}/{len(passes)} - {label} on {len(remaining)} IP(s)")

            results = cls._collect_wave(job, st, remaining, depth, profile_id=profile_id, defer_failures=not is_last)

            retry: List[Tuple[str, str]] = []
            for res in results:
                if not is_last and res["status"] in RETRYABLE_STATUSES:
                    retry.append((res["ip"], "" if res["hostname"] == res["ip"] else res["hostname"]))
                else:
                    collected.append(res)
            if retry:
                writer.log(
                    f"Depth {depth}: {len(retry)} IP(s) not logged in with {label} -> retrying with priority {pass_no + 1}"
                )
            remaining = retry

        return collected

    @classmethod
    def _collect_wave(
        cls,
        job: JobRecord,
        st: Dict[str, Any],
        alive: List[Tuple[str, str]],
        depth: int,
        profile_id: Optional[str] = None,
        defer_failures: bool = False,
    ) -> List[Dict[str, Any]]:
        if not alive:
            return []
        p = job.payload
        results: List[Dict[str, Any]] = []
        with ThreadPoolExecutor(max_workers=min(p["num_workers"], len(alive))) as executor:
            futures = {}
            for ip, name in alive:
                overrides: Dict[str, Any] = {"host": ip, "name": name}
                if ip in st.get("drivers", {}):
                    overrides["device_type"] = st["drivers"][ip]
                if profile_id:
                    # Exactly one profile per pass, so the sweep order is the profile order
                    overrides["profile_id"] = profile_id
                    overrides["fallback_profile_ids"] = None
                dev = DeviceCredentials(**{**p["template"], **overrides})
                futures[
                    # A scanned IP has no fleet row: auto-detected, or swept when the vendor cannot be named
                    executor.submit(LldpService.collect_auto, dev, depth, p.get("command_profile_ids"))
                ] = dev
            for fut in as_completed(futures):
                if job.cancel_requested:
                    for f in futures:
                        f.cancel()
                    break
                dev = futures[fut]
                try:
                    res = fut.result()
                except Exception as e:
                    res = {
                        "hostname": dev.name or dev.host, "ip": dev.host, "model": "", "depth": depth,
                        "status": f"Failed: {e}", "success": False, "error": str(e),
                        "neighbors_found": 0, "neighbors": [], "log": f"ERROR: {e}",
                        "raw_output": "", "execution_time_seconds": 0,
                    }
                cls._classify(st, res, dev)
                if defer_failures and res["status"] in RETRYABLE_STATUSES:
                    # Recorded by a later pass instead, so stats count each IP once
                    st["writer"].log(f"[RETRY] {res['ip']} - {' '.join(str(res.get('detail', '')).split())}")
                else:
                    cls._record(job, st, res)
                results.append(res)
        return results

    @classmethod
    def _classify(cls, st: Dict[str, Any], res: Dict[str, Any], dev: DeviceCredentials):
        res["tcp_open"] = True
        res["credential"] = dev.active_credential_name or ""
        if res["success"]:
            with JobService._lock:
                first_ip = st["seen_names"].setdefault(res["hostname"], res["ip"])
            if first_ip != res["ip"]:
                # Same switch reached via another IP (Vlanif / MEth): keep the log, drop duplicate rows
                res["status"] = STATUS_DUPLICATE
                res["detail"] = f"Same sysname as {first_ip}; {res['neighbors_found']} neighbor row(s) not added again"
                res["neighbors"] = []
                res["neighbors_found"] = 0
            elif res["neighbors_found"]:
                res["status"] = STATUS_SUCCESS
                res["detail"] = f"{res['neighbors_found']} LLDP neighbor(s)"
            else:
                res["status"] = STATUS_NO_LLDP
                res["detail"] = "Logged in but no LLDP neighbor (LLDP disabled or nothing connected)"
        else:
            diag = JobService.format_failure_diagnostic(res.get("error") or "", host_ip=res["ip"])
            if diag.startswith("Authentication Failed"):
                res["status"] = STATUS_AUTH_FAILED
            elif any(diag.startswith(pfx) for pfx in ("Connection Timeout", "Network Unreachable", "Connection Refused")):
                res["status"] = STATUS_UNREACHABLE
            else:
                res["status"] = STATUS_FAILED
            res["detail"] = diag

    @classmethod
    def _record(cls, job: JobRecord, st: Dict[str, Any], host: Dict[str, Any]):
        writer: ScanLogWriter = st["writer"]
        writer.write_host(host)
        with JobService._lock:
            st["hosts"].append(host)
            st["stats"][host["status"]] += 1
            job.completed_devices += 1
            if host["status"] in LOGGED_IN_STATUSES:
                job.success_count += 1
            else:
                job.failed_count += 1
        name = f" ({host['hostname']})" if host["hostname"] != host["ip"] else ""
        detail = " ".join(str(host.get("detail", "")).split())
        writer.log(f"[{host['status']}] {host['ip']}{name} - {detail}")

    @classmethod
    def build_report(cls, job: JobRecord, st: Dict[str, Any]) -> Dict[str, Any]:
        with JobService._lock:
            hosts = sorted(
                st["hosts"],
                key=lambda h: (h["depth"], int(ipaddress.IPv4Address(h["ip"])) if h["ip"] else 0),
            )
            stats = dict(st["stats"])
        neighbors = [n for h in hosts for n in h["neighbors"]]
        LldpService.fill_remote_models(neighbors, hosts)
        return {
            "job_id": job.job_id,
            "status": job.status,
            "total_hosts": len(hosts),
            "success_hosts": sum(stats[s] for s in LOGGED_IN_STATUSES),
            "failed_hosts": stats[STATUS_AUTH_FAILED] + stats[STATUS_FAILED],
            "unreachable_hosts": stats[STATUS_UNREACHABLE],
            "total_lldp_rows": len(neighbors),
            "overall_time_seconds": round((job.end_time or time.time()) - job.start_time, 2),
            "stats": stats,
            "targets": job.payload["targets"],
            "exclude": job.payload["exclude"],
            "log_dir": st["writer"].dir,
            "neighbors": neighbors,
            "hosts": hosts,
            "topology": LldpService.build_topology(neighbors, hosts),
        }

    @classmethod
    def get_status(cls, job_id: str, include_report: bool = False, log_lines: int = 100) -> Optional[Dict[str, Any]]:
        job = JobService._jobs.get(job_id)
        st = cls._scans.get(job_id)
        if not job or not st:
            return None
        out = JobService.get_job_status(job_id).model_dump()
        writer: ScanLogWriter = st["writer"]
        with JobService._lock:
            out["stats"] = dict(st["stats"])
        out["phase"] = st["phase"]
        out["log_dir"] = writer.dir
        out["targets"] = job.payload["targets"]
        out["log_tail"] = list(writer.tail)[-log_lines:] if log_lines else []
        if include_report:
            out["report"] = cls.build_report(job, st)
        return out

    @classmethod
    def export_zip(cls, job_id: str) -> Optional[bytes]:
        st = cls._scans.get(job_id)
        return st["writer"].zip_bytes() if st else None
