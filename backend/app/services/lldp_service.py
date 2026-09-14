import io
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any, Optional, Set

from app.core.config import settings
from app.schemas.device import DeviceCredentials
from app.services.netmiko_service import NetmikoService

SYSNAME_CMD = "display current-configuration | include sysname"
LLDP_BRIEF_CMD = "display lldp neighbor brief"
LLDP_DETAIL_CMD = "display lldp neighbor interface {intf}"

# Excel cell hard limit is 32,767 chars
EXCEL_CELL_LIMIT = 32000

_BRIEF_HEADER_ALIASES = {
    "local": ["Local Interface", "Local Intf", "Local Port"],
    "remote_dev": ["Neighbor Device", "Neighbor Dev", "System Name"],
    "remote_intf": ["Neighbor Interface", "Neighbor Intf", "Neighbor Port", "Port ID"],
    "exptime": ["Exptime(s)", "Exptime", "Expire"],
}


class LldpService:
    @staticmethod
    def get_sysname(prompt: str) -> str:
        return re.sub(r"[<>\[\]#]", "", prompt or "").strip()

    @staticmethod
    def parse_lldp_brief(output: str) -> List[Dict[str, str]]:
        """
        Parse Huawei 'display lldp neighbor brief' into rows of
        {local_port, remote_device, remote_port}. Column boundaries are taken
        from the header line, so column order differences between VRP versions work.
        """
        rows: List[Dict[str, str]] = []
        lines = (output or "").splitlines()

        header_idx = None
        columns = []
        for idx, line in enumerate(lines):
            found = []
            for key, aliases in _BRIEF_HEADER_ALIASES.items():
                for alias in aliases:
                    pos = line.find(alias)
                    if pos >= 0:
                        found.append((pos, key))
                        break
            if any(k == "local" for _, k in found) and len(found) >= 2:
                header_idx = idx
                columns = sorted(found)
                break

        if header_idx is None:
            return rows

        for line in lines[header_idx + 1:]:
            if not line.strip() or set(line.strip()) <= set("-="):
                continue
            if re.match(r"^\s*[<\[]\S+[>\]]\s*$", line):
                continue
            values = {}
            for i, (start, key) in enumerate(columns):
                end = columns[i + 1][0] if i + 1 < len(columns) else len(line)
                # First column starts at 0 so leading data is not lost
                values[key] = line[0 if i == 0 else start:end].strip()
            local = values.get("local", "")
            if not local or " " in local:
                # Fallback for misaligned rows: whitespace split in header order
                parts = line.split()
                if len(parts) < len(columns):
                    continue
                values = {key: parts[i] for i, (_, key) in enumerate(columns)}
                local = values.get("local", "")
            # Interface names like GE0/0/1, 10GE1/0/48, Eth-Trunk1, MEth0/0/1
            if not re.match(r"^(?=[\w\-]*[A-Za-z])[\w\-]+\d", local):
                continue
            rows.append({
                "local_port": local,
                "remote_device": values.get("remote_dev", ""),
                "remote_port": values.get("remote_intf", ""),
            })
        return rows

    @staticmethod
    def parse_lldp_detail(output: str) -> List[Dict[str, str]]:
        """
        Parse Huawei 'display lldp neighbor [interface X]' detail output.
        Same block split as the original script, plus support for several
        neighbors per interface and the management address.
        """
        results: List[Dict[str, str]] = []
        blocks = re.split(r"(\S+) has \d+ neighbor\(s\):", output or "")
        for i in range(1, len(blocks), 2):
            local_port = blocks[i]
            content = blocks[i + 1] if i + 1 < len(blocks) else ""
            neighbors = re.split(r"Neighbor index\s*:\s*\d+", content)
            neighbors = [n for n in neighbors if n.strip()] or [content]
            for n in neighbors:
                sysname = re.search(r"System name\s*:(.*)", n)
                port_id = re.search(r"Port ID\s*:(.*)", n)
                if not sysname and not port_id:
                    continue
                mgmt = re.search(r"Management address(?: value)?\s*:\s*(\d{1,3}(?:\.\d{1,3}){3})", n)
                results.append({
                    "local_port": local_port,
                    "remote_device": sysname.group(1).strip() if sysname else "N/A",
                    "remote_port": port_id.group(1).strip() if port_id else "N/A",
                    "remote_ip": mgmt.group(1) if mgmt else "",
                })
        return results

    @classmethod
    def collect_device(cls, device: DeviceCredentials, depth: int = 0) -> Dict[str, Any]:
        """
        SSH to one device -> 'display lldp neighbor brief' -> loop every local
        interface that has a neighbor with 'display lldp neighbor interface <if>'.
        """
        start = time.time()
        local_ip = device.host or ""
        log_lines = [f"--- Execution Log for {device.name or local_ip} ({local_ip}) ---"]
        raw_parts: List[str] = []
        neighbors: List[Dict[str, Any]] = []
        sysname = device.name or local_ip
        status = "Success"
        error = None

        try:
            with NetmikoService.connect_with_fallback(device) as (net_connect, winning_cred, attempt_logs):
                log_lines.append(f"Step 0: Connected via {winning_cred}")
                try:
                    net_connect.send_command("screen-length 0 temporary", read_timeout=settings.DEFAULT_TIMEOUT)
                except Exception:
                    pass
                sysname_source = SYSNAME_CMD
                cfg_sysname = ""
                try:
                    sys_raw = NetmikoService.clean_cli_output(
                        net_connect.send_command(SYSNAME_CMD, read_timeout=settings.DEFAULT_TIMEOUT)
                    )
                    raw_parts.append(f"<{sysname}> {SYSNAME_CMD}\n{sys_raw}")
                    m = re.search(r"^\s*sysname\s+(.+?)\s*$", sys_raw, re.MULTILINE | re.IGNORECASE)
                    cfg_sysname = m.group(1).strip() if m else ""
                except Exception as e:
                    log_lines.append(f"Step 1: '{SYSNAME_CMD}' failed: {e}")
                if cfg_sysname:
                    sysname = cfg_sysname
                else:
                    # Fall back to the CLI prompt when sysname is not in the config output
                    sysname_source = "prompt"
                    sysname = cls.get_sysname(net_connect.find_prompt()) or sysname
                log_lines.append(f"Step 1: Identified real sysname as [{sysname}] (from {sysname_source})")

                brief_raw = NetmikoService.clean_cli_output(
                    net_connect.send_command(LLDP_BRIEF_CMD, read_timeout=settings.DEFAULT_TIMEOUT)
                )
                raw_parts.append(f"<{sysname}> {LLDP_BRIEF_CMD}\n{brief_raw}")
                brief_rows = cls.parse_lldp_brief(brief_raw)
                log_lines.append(f"Step 2: '{LLDP_BRIEF_CMD}' returned {len(brief_rows)} neighbor row(s)")

                seen_intf: Set[str] = set()
                for row in brief_rows:
                    intf = row["local_port"]
                    if intf in seen_intf:
                        continue
                    seen_intf.add(intf)
                    cmd = LLDP_DETAIL_CMD.format(intf=intf)
                    details: List[Dict[str, str]] = []
                    try:
                        detail_raw = NetmikoService.clean_cli_output(
                            net_connect.send_command(cmd, read_timeout=settings.DEFAULT_TIMEOUT)
                        )
                        raw_parts.append(f"<{sysname}> {cmd}\n{detail_raw}")
                        details = cls.parse_lldp_detail(detail_raw)
                    except Exception as e:
                        log_lines.append(f"Step 3: '{cmd}' failed: {e}")

                    if details:
                        log_lines.append(f"Step 3: '{cmd}' -> {len(details)} neighbor(s)")
                    else:
                        # Fall back to the brief row values for this interface
                        details = [
                            {
                                "local_port": r["local_port"],
                                "remote_device": r["remote_device"] or "N/A",
                                "remote_port": r["remote_port"] or "N/A",
                                "remote_ip": "",
                            }
                            for r in brief_rows if r["local_port"] == intf
                        ]
                        log_lines.append(f"Step 3: '{cmd}' had no detail, used brief values")

                    for d in details:
                        neighbors.append({
                            "Local Device": sysname,
                            "Local IP": local_ip,
                            # Full name from detail (GigabitEthernet0/0/1), same as the original script
                            "Local Port": d["local_port"],
                            "Remote Device": d["remote_device"],
                            "Remote Port": d["remote_port"],
                            "Remote IP": d.get("remote_ip", ""),
                        })

                log_lines.append(f"Step 4: Parsed {len(neighbors)} neighbors.")
        except Exception as e:
            status = f"Failed: {e}"
            error = str(e)
            log_lines.append(f"ERROR: {status}")

        return {
            "hostname": sysname,
            "ip": local_ip,
            "depth": depth,
            "status": status,
            "success": error is None,
            "error": error,
            "neighbors_found": len(neighbors),
            "neighbors": neighbors,
            "log": "\n".join(log_lines),
            "raw_output": "\n\n".join(raw_parts),
            "execution_time_seconds": round(time.time() - start, 2),
        }

    @classmethod
    def discover(
        cls,
        devices: List[DeviceCredentials],
        num_workers: Optional[int] = None,
        recursive: bool = False,
        max_depth: int = 3,
    ) -> Dict[str, Any]:
        """
        Run collect_device over the seed devices. When recursive is on, the
        management IPs learned from LLDP are queued as the next wave (using the
        seed's credentials) until no new devices appear or max_depth is reached.
        """
        start = time.time()
        workers = max(1, min(100, num_workers or settings.DEFAULT_NUM_WORKERS))
        visited_ips: Set[str] = set()
        visited_names: Set[str] = set()
        hosts: List[Dict[str, Any]] = []

        wave = []
        for d in devices:
            if d.host and d.host not in visited_ips:
                visited_ips.add(d.host)
                wave.append(d)

        depth = 0
        while wave:
            results = [None] * len(wave)
            with ThreadPoolExecutor(max_workers=min(workers, len(wave))) as executor:
                futures = {executor.submit(cls.collect_device, dev, depth): i for i, dev in enumerate(wave)}
                for fut in as_completed(futures):
                    results[futures[fut]] = fut.result()

            next_wave = []
            for dev, res in zip(wave, results):
                hosts.append(res)
                if res["success"]:
                    visited_names.add(res["hostname"])

            if recursive and depth < max_depth:
                for dev, res in zip(wave, results):
                    for n in res["neighbors"]:
                        ip = n.get("Remote IP")
                        if not ip or ip in visited_ips or n["Remote Device"] in visited_names:
                            continue
                        visited_ips.add(ip)
                        visited_names.add(n["Remote Device"])
                        next_wave.append(dev.copy(update={
                            "id": None,
                            "host": ip,
                            "name": n["Remote Device"],
                            "active_credential_name": None,
                        }))

            wave = next_wave
            depth += 1

        all_neighbors = [n for h in hosts for n in h["neighbors"]]
        success = sum(1 for h in hosts if h["success"])
        return {
            "total_hosts": len(hosts),
            "success_hosts": success,
            "failed_hosts": len(hosts) - success,
            "total_lldp_rows": len(all_neighbors),
            "overall_time_seconds": round(time.time() - start, 2),
            "neighbors": all_neighbors,
            "hosts": hosts,
        }

    @staticmethod
    def build_excel(neighbors: List[Dict[str, Any]], hosts: List[Dict[str, Any]]) -> bytes:
        import openpyxl
        from openpyxl.styles import Font, PatternFill
        from openpyxl.utils import get_column_letter

        wb = openpyxl.Workbook()

        def write_sheet(ws, headers, rows):
            ws.append(headers)
            for cell in ws[1]:
                cell.font = Font(bold=True, color="FFFFFF")
                cell.fill = PatternFill("solid", fgColor="1F4E78")
            for r in rows:
                ws.append([
                    (str(r.get(h, "")) if r.get(h) is not None else "")[:EXCEL_CELL_LIMIT]
                    for h in headers
                ])
            ws.freeze_panes = "A2"
            ws.auto_filter.ref = ws.dimensions
            for i, h in enumerate(headers, 1):
                width = max([len(h)] + [min(len(str(r.get(h, "") or "")), 60) for r in rows[:500]])
                ws.column_dimensions[get_column_letter(i)].width = width + 2

        # Sheet 1: all LLDP entries
        ws1 = wb.active
        ws1.title = "LLDP_Inventory"
        write_sheet(
            ws1,
            ["Local Device", "Local IP", "Local Port", "Remote Device", "Remote Port", "Remote IP"],
            neighbors,
        )

        # Sheet 2: host list & status (shows which hosts have no neighbors)
        ws2 = wb.create_sheet("Execution_Summary")
        write_sheet(
            ws2,
            ["Hostname", "IP Address", "Depth", "Status", "Neighbors Found", "Time (s)"],
            [
                {
                    "Hostname": h.get("hostname"),
                    "IP Address": h.get("ip"),
                    "Depth": h.get("depth", 0),
                    "Status": h.get("status"),
                    "Neighbors Found": h.get("neighbors_found", 0),
                    "Time (s)": h.get("execution_time_seconds"),
                }
                for h in hosts
            ],
        )

        # Sheet 3: per-host log + raw terminal output (replaces logs/<host>.log)
        ws3 = wb.create_sheet("Raw_Logs")
        write_sheet(
            ws3,
            ["Hostname", "IP Address", "Log", "Raw Output"],
            [
                {
                    "Hostname": h.get("hostname"),
                    "IP Address": h.get("ip"),
                    "Log": h.get("log"),
                    "Raw Output": h.get("raw_output") or "No Data",
                }
                for h in hosts
            ],
        )

        stream = io.BytesIO()
        wb.save(stream)
        return stream.getvalue()
