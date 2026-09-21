import io
import ipaddress
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
LLDP_FULL_CMD = "display lldp neighbor"
VERSION_CMD = "display version"

# Huawei product models, e.g. S2750-28TP-EI-AC, CE6881-48S6CQ, AR6120-S, NE40E-X8A.
# Longest match wins so "S5720-28X-SI-AC" beats the short "(S5720 V200R011...)".
_MODEL_RE = re.compile(r"(?<![\w-])((?:AirEngine|ATN|USG|CE|CX|AR|NE|AC|S)\d{2,5}[A-Z]*(?:-[A-Z0-9]+)*)(?!\w)")
ROUTER_MODEL_PREFIXES = ("AR", "NE")

# Excel cell hard limit is 32,767 chars
EXCEL_CELL_LIMIT = 32000

_BRIEF_HEADER_ALIASES = {
    "local": ["Local Interface", "Local Intf", "Local Port"],
    "remote_dev": ["Neighbor Device", "Neighbor Dev", "System Name"],
    "remote_intf": ["Neighbor Interface", "Neighbor Intf", "Neighbor Port", "Port ID"],
    "exptime": ["Exptime(s)", "Exptime", "Expire"],
}

# Cisco 'show lldp neighbors' puts Device ID first, then Local Intf ... Port ID
_BRIEF_HEADER_ALIASES_CISCO = {
    "remote_dev": ["Device ID"],
    "local": ["Local Intf", "Local Interface"],
    "remote_intf": ["Port ID"],
    "exptime": ["Hold-time"],
}

# The device parser rejected the command, so this command profile is the wrong vendor
_CLI_REJECT_RE = re.compile(
    r"unrecognized command|invalid input|% invalid|syntax error|wrong parameter|incomplete command",
    re.I,
)

# Cisco model codes, e.g. WS-C2960X-48TS-L, C9200-48P, ISR4331, N9K-C93180YC-EX, IE-3300-8T2S
_MODEL_RE_CISCO = re.compile(
    r"(?<![\w-])((?:WS-C|N\dK-C|IE-|ISR|ASR|CSR|CISCO|CBS|SG|C)\d{3,5}[A-Z0-9]*(?:-[A-Z0-9]+)*)(?![\w(])"
)
# 'Model number : WS-C2960X-48TS-L' (show version) / 'cisco C9300-48P (X86) processor'
_MODEL_LINE_CISCO = re.compile(r"^\s*Model\s*number\s*:\s*(\S+)", re.MULTILINE | re.IGNORECASE)
_MODEL_HW_CISCO = re.compile(r"^\s*cisco\s+(?:Nexus\S*\s+)?(\S+)\s.*?(?:processor|chassis)", re.MULTILINE | re.IGNORECASE)
# IOS image names look like models but are not: C2960X-UNIVERSALK9-M, C3750E-IPBASEK9-M
_IMAGE_TOKEN_RE = re.compile(r"K9|UNIVERSAL|IPBASE|LANBASE|IPSERVICES|ENTSERVICES|ADVIP|^M$|^MZ$", re.I)
# 'Catalyst L3 Switch Software (CAT9K_IOSXE)' carries only the family
_FAMILY_RE_CISCO = re.compile(r"\bCAT(\d{1,2})K(?![A-Za-z0-9])", re.I)
_CISCO_ROUTER_RE = re.compile(r"^(?:ISR|ASR|CSR|CISCO\d{4}|C8\d{3}|C11\d{2}|C[1-3]900$)", re.I)


def cli_rejected(text: str) -> bool:
    """True when the CLI answered with a syntax error instead of running the command"""
    return bool(text) and bool(_CLI_REJECT_RE.search(text))


class LldpService:
    @staticmethod
    def short_hostname(name: str) -> str:
        """
        Cisco with 'ip domain-name lab.local' advertises the LLDP System Name /
        Device ID as 'router_cisco.lab.local' (the brief table even cuts it to
        'router_cisco.lab.loc'). Drop the domain so it matches the SSH'd hostname.
        IP addresses and names like 'SW-1.2F' are left alone.
        """
        # rstrip: the brief table can cut the name right after the dot ('router_cisco.')
        name = (name or "").strip().rstrip(".")
        if not name or re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", name):
            return name
        host, dot, domain = name.partition(".")
        # Any 'ip domain-name' value (lab.local, corp.example.com, lab1, net-2, or a
        # truncated '.c'): DNS labels whose first label starts with a letter.
        # 'SW-1.2F' / 'R1.1' (digit right after the dot) are kept as real names.
        if dot and host and re.fullmatch(r"[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]*)*", domain):
            return host
        return name

    @classmethod
    def get_sysname(cls, prompt: str) -> str:
        return cls.short_hostname(re.sub(r"[<>\[\]#]", "", prompt or "").strip())

    @staticmethod
    def detect_vendor(text: str, parser: str = "") -> str:
        """Vendor of the device the text describes; falls back to the command profile's parser"""
        t = (text or "").lower()
        if "huawei" in t or "vrp" in t:
            return "huawei"
        if "cisco" in t or "nx-os" in t or "ios-xe" in t:
            return "cisco"
        return parser or "huawei"

    @staticmethod
    def _extract_cisco_model(text: str) -> str:
        for rx in (_MODEL_LINE_CISCO, _MODEL_HW_CISCO):
            m = rx.search(text)
            if m and _MODEL_RE_CISCO.fullmatch(m.group(1)):
                return m.group(1)
        full, image = [], []
        for cand in _MODEL_RE_CISCO.findall(text):
            parts = cand.split("-")
            keep = []
            for part in parts:
                if _IMAGE_TOKEN_RE.search(part):
                    break
                keep.append(part)
            if len(keep) == len(parts):
                full.append(cand)
            elif keep:
                # C2960X-UNIVERSALK9-M -> C2960X (the platform family)
                image.append("-".join(keep))
        if full:
            return max(full, key=len)
        if image:
            return max(image, key=len)
        fam = _FAMILY_RE_CISCO.search(text)
        return f"C{fam.group(1)}K" if fam else ""

    @classmethod
    def extract_model(cls, text: str, parser: str = "") -> str:
        """
        Model from 'System description' or version output, '' when none is found.
        The vendor is taken from the text itself, so a Huawei switch still reads a
        Cisco neighbor's model (and vice versa); the parser is only a fallback.
        """
        # Model rules edited on the LLDP page win over the built-in regexes
        from app.services.model_rule_service import ModelRuleService
        custom = ModelRuleService.match_model(text or "")
        return custom["model"] if custom else cls.builtin_model(text, parser)

    @classmethod
    def builtin_model(cls, text: str, parser: str = "") -> str:
        """Model from the built-in Huawei / Cisco regexes only"""
        text = text or ""
        vendor = cls.detect_vendor(text, parser)
        if vendor == "cisco":
            return cls._extract_cisco_model(text)
        candidates = _MODEL_RE.findall(text)
        return max(candidates, key=len) if candidates else ""

    @classmethod
    def device_role(cls, model: str) -> str:
        """A model rule with a role wins over the built-in router / switch guess"""
        return cls.device_role_info(model)["role"]

    @classmethod
    def device_role_info(cls, model: str) -> Dict[str, Any]:
        """
        The role and where it came from, so the UI can show which model is drawn
        with which icon and why: {role, source: 'rule'|'builtin'|'none', rule_id, rule_name}
        """
        from app.services.model_rule_service import ModelRuleService
        custom = ModelRuleService.match_role(model)
        if custom:
            rule = custom["rule"]
            return {
                "role": custom["role"],
                "source": "rule",
                "rule_id": rule.get("id", ""),
                "rule_name": rule.get("name", ""),
            }
        role = cls.builtin_role(model)
        return {
            "role": role,
            "source": "none" if role == "unknown" else "builtin",
            "rule_id": "",
            "rule_name": "",
        }

    @staticmethod
    def builtin_role(model: str) -> str:
        """Huawei AR / NE and Cisco ISR / ASR / C8000 / C1100 are routers, any other recognized model is a switch"""
        if not model:
            return "unknown"
        m = model.upper()
        if m.startswith(ROUTER_MODEL_PREFIXES) or _CISCO_ROUTER_RE.match(m):
            return "router"
        return "switch"

    @staticmethod
    def fill_remote_models(neighbors: List[Dict[str, Any]], hosts: List[Dict[str, Any]]) -> None:
        """Blank 'Remote Model' cells get the model the neighbor reported about itself when it was SSH'd"""
        by_name = {h["hostname"]: h["model"] for h in hosts if h.get("model")}
        by_ip = {h["ip"]: h["model"] for h in hosts if h.get("model") and h.get("ip")}
        for n in neighbors:
            if not n.get("Remote Model"):
                n["Remote Model"] = by_name.get(n.get("Remote Device"), "") or by_ip.get(n.get("Remote IP"), "")

    @staticmethod
    def parse_lldp_brief(output: str, parser: str = "huawei") -> List[Dict[str, str]]:
        """
        Parse an LLDP neighbor table into rows of {local_port, remote_device,
        remote_port}. Column boundaries are taken from the header line, so both
        Huawei 'display lldp neighbor brief' and Cisco 'show lldp neighbors'
        work, as do column order differences between firmware versions.
        """
        rows: List[Dict[str, str]] = []
        lines = (output or "").splitlines()
        aliases_map = _BRIEF_HEADER_ALIASES_CISCO if parser == "cisco" else _BRIEF_HEADER_ALIASES

        header_idx = None
        columns = []
        for idx, line in enumerate(lines):
            found = []
            for key, aliases in aliases_map.items():
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
                "remote_device": LldpService.short_hostname(values.get("remote_dev", "")),
                "remote_port": values.get("remote_intf", ""),
            })
        return rows

    @staticmethod
    def intf_key(name: str) -> str:
        """Match short and long interface names: GE0/0/1 == GigabitEthernet0/0/1, XGE0/0/1 == XGigabitEthernet0/0/1"""
        s = re.sub(r"\s+", "", name or "")
        m = re.match(r"^(\d*[A-Za-z])[A-Za-z\-]*?(\d+(?:/\d+)*(?:[:.]\d+)?)$", s)
        if not m:
            return s.lower()
        prefix = m.group(1).upper()
        if "trunk" in s.lower():
            prefix += "TRUNK"
        return f"{prefix}{m.group(2)}"

    @staticmethod
    def extract_mgmt_ipv4(text: str) -> str:
        """
        First valid IPv4 from 'Management address[ value] : <value>' lines.
        The value must be on the same line (an empty value must not pick up the
        next line), and MAC / IPv6 management addresses are skipped.
        """
        for m in re.finditer(r"^[ \t]*Management address(?:[ \t]+value)?[ \t]*:[ \t]*(\S*)", text or "", re.MULTILINE | re.IGNORECASE):
            candidate = re.match(r"\d{1,3}(?:\.\d{1,3}){3}(?![\d.])", m.group(1))
            if not candidate:
                continue
            try:
                return str(ipaddress.IPv4Address(candidate.group(0)))
            except ValueError:
                continue
        return ""

    @classmethod
    def parse_lldp_detail(cls, output: str, default_local_port: Optional[str] = None) -> List[Dict[str, str]]:
        """
        Parse Huawei 'display lldp neighbor [interface X]' detail output.
        Same block split as the original script, plus support for several
        neighbors per interface and the management address. When the
        '<port> has N neighbor(s):' header is missing (some VRP versions on
        the per-interface command), the whole output is used for default_local_port.
        """
        results: List[Dict[str, str]] = []
        blocks = re.split(r"(\S+) has \d+ neighbors?(?:\(s\))?\s*:", output or "", flags=re.IGNORECASE)
        if len(blocks) < 3 and default_local_port:
            blocks = ["", default_local_port, output or ""]
        for i in range(1, len(blocks), 2):
            local_port = blocks[i]
            content = blocks[i + 1] if i + 1 < len(blocks) else ""
            neighbors = re.split(r"Neighbor index\s*:\s*\d+", content, flags=re.IGNORECASE)
            neighbors = [n for n in neighbors if n.strip()] or [content]
            for n in neighbors:
                sysname = re.search(r"^\s*System\s*name\s*:(.*)$", n, re.MULTILINE | re.IGNORECASE)
                port_id = re.search(r"^\s*Port\s*ID\s*:(.*)$", n, re.MULTILINE | re.IGNORECASE)
                if not sysname and not port_id:
                    continue
                remote_ip = cls.extract_mgmt_ipv4(n)
                # System description spans several lines, up to the next 'Key :' line
                desc = re.search(
                    r"^\s*System\s*description\s*:(.*?)(?=^\s*[A-Za-z][A-Za-z /()\-]{2,40}:|\Z)",
                    n, re.MULTILINE | re.IGNORECASE | re.DOTALL,
                )
                results.append({
                    "local_port": local_port,
                    "remote_device": cls.short_hostname(sysname.group(1)) if sysname else "N/A",
                    "remote_port": port_id.group(1).strip() if port_id else "N/A",
                    "remote_ip": remote_ip,
                    "remote_model": cls.extract_model(desc.group(1), "huawei") if desc else "",
                    "remote_description": desc.group(1).strip() if desc else "",
                })
        return results

    @classmethod
    def parse_lldp_detail_cisco(cls, output: str, default_local_port: Optional[str] = None) -> List[Dict[str, str]]:
        """
        Parse Cisco 'show lldp neighbors [<intf>] detail'. Entries are separated
        by dashed rules; each block carries Local Intf / Port id / System Name /
        System Description and an indented 'IP:' under Management Addresses.
        """
        results: List[Dict[str, str]] = []
        blocks = [b for b in re.split(r"^-{4,}\s*$", output or "", flags=re.MULTILINE) if b.strip()]
        for block in blocks:
            sysname = re.search(r"^\s*System Name\s*:(.*)$", block, re.MULTILINE | re.IGNORECASE)
            port_id = re.search(r"^\s*Port id\s*:(.*)$", block, re.MULTILINE | re.IGNORECASE)
            if not sysname and not port_id:
                continue
            local = re.search(r"^\s*Local Intf\s*:(.*)$", block, re.MULTILINE | re.IGNORECASE)
            local_port = local.group(1).strip() if local else (default_local_port or "")
            if not local_port:
                continue
            ip_match = re.search(r"^\s*IP\s*:\s*(\d{1,3}(?:\.\d{1,3}){3})\s*$", block, re.MULTILINE | re.IGNORECASE)
            remote_ip = ""
            if ip_match:
                try:
                    remote_ip = str(ipaddress.IPv4Address(ip_match.group(1)))
                except ValueError:
                    remote_ip = ""
            desc = re.search(
                r"^\s*System Description\s*:(.*?)(?=^\s*(?:Time remaining|System Capabilities|Enabled Capabilities|Management Addresses|Auto Negotiation)\s*:|\Z)",
                block, re.MULTILINE | re.IGNORECASE | re.DOTALL,
            )
            results.append({
                "local_port": local_port,
                "remote_device": cls.short_hostname(sysname.group(1)) if sysname else "N/A",
                "remote_port": port_id.group(1).strip() if port_id else "N/A",
                "remote_ip": remote_ip,
                "remote_model": cls.extract_model(desc.group(1), "cisco") if desc else "",
                "remote_description": desc.group(1).strip() if desc else "",
            })
        return results

    @classmethod
    def parse_detail(cls, output: str, parser: str, default_local_port: Optional[str] = None) -> List[Dict[str, str]]:
        if parser == "cisco":
            return cls.parse_lldp_detail_cisco(output, default_local_port=default_local_port)
        return cls.parse_lldp_detail(output, default_local_port=default_local_port)

    @classmethod
    def collect_device(
        cls,
        device: DeviceCredentials,
        depth: int = 0,
        command_profile_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
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
        model = ""
        status = "Success"
        error = None
        used_profile = ""
        version_output = ""

        from app.services.command_profile_service import CommandProfileService
        cmd_profiles = CommandProfileService.resolve_ordered(command_profile_ids)

        try:
            with NetmikoService.connect_with_fallback(device) as (net_connect, winning_cred, attempt_logs):
                log_lines.append(f"Step 0: Connected via {winning_cred}")

                # Walk the command profiles on this one session: Huawei commands
                # first, and when the CLI rejects them retry with the next profile
                # (Cisco) instead of logging in again.
                for prof_no, cprof in enumerate(cmd_profiles, 1):
                    is_last_profile = prof_no == len(cmd_profiles)
                    cmds = cprof["commands"]
                    parser = cprof["parser"]
                    used_profile = cprof["name"]
                    log_lines.append(
                        f"Step 0b: Command profile {prof_no}/{len(cmd_profiles)} [{cprof['name']}] (parser: {parser})"
                    )
                    neighbors = []
                    raw_parts.append(f"===== Command profile: {cprof['name']} =====")

                    if cmds.get("pager_disable"):
                        try:
                            net_connect.send_command(cmds["pager_disable"], read_timeout=settings.DEFAULT_TIMEOUT)
                        except Exception:
                            pass
                    sysname_source = cmds.get("sysname") or "prompt"
                    cfg_sysname = ""
                    try:
                        sys_raw = NetmikoService.clean_cli_output(
                            net_connect.send_command(cmds["sysname"], read_timeout=settings.DEFAULT_TIMEOUT)
                        )
                        raw_parts.append(f"<{sysname}> {cmds['sysname']}\n{sys_raw}")
                        # [ \t] instead of \s: a bare 'hostname' line must not swallow the next line
                        # of config (e.g. 'ip domain-name lab.local') as the device name
                        m = re.search(r"^[ \t]*(?:sysname|hostname)[ \t]+(\S[^\r\n]*?)[ \t]*$", sys_raw, re.MULTILINE | re.IGNORECASE)
                        cfg_sysname = cls.short_hostname(m.group(1).strip().strip('"')) if m else ""
                    except Exception as e:
                        log_lines.append(f"Step 1: '{cmds.get('sysname')}' failed: {e}")
                    if cfg_sysname:
                        sysname = cfg_sysname
                    else:
                        # Fall back to the CLI prompt when sysname is not in the config output
                        sysname_source = "prompt"
                        sysname = cls.get_sysname(net_connect.find_prompt()) or sysname
                    log_lines.append(f"Step 1: Identified real sysname as [{sysname}] (from {sysname_source})")

                    ver_raw = ""
                    try:
                        ver_raw = NetmikoService.clean_cli_output(
                            net_connect.send_command(cmds["version"], read_timeout=settings.DEFAULT_TIMEOUT)
                        )
                        raw_parts.append(f"<{sysname}> {cmds['version']}\n{ver_raw}")
                        model = cls.extract_model(ver_raw, parser)
                        version_output = ver_raw
                        log_lines.append(f"Step 1b: Model [{model or 'unknown'}] ({cls.device_role(model)}) from '{cmds['version']}'")
                    except Exception as e:
                        log_lines.append(f"Step 1b: '{cmds.get('version')}' failed: {e}")

                    brief_raw = NetmikoService.clean_cli_output(
                        net_connect.send_command(cmds["lldp_brief"], read_timeout=settings.DEFAULT_TIMEOUT)
                    )
                    raw_parts.append(f"<{sysname}> {cmds['lldp_brief']}\n{brief_raw}")
                    brief_rows = cls.parse_lldp_brief(brief_raw, parser)
                    log_lines.append(f"Step 2: '{cmds['lldp_brief']}' returned {len(brief_rows)} neighbor row(s)")

                    # Wrong vendor for this profile: the CLI rejected the LLDP command,
                    # or it returned nothing and the version command was rejected too
                    if not is_last_profile and (cli_rejected(brief_raw) or (not brief_rows and cli_rejected(ver_raw))):
                        log_lines.append(
                            f"Step 2b: [{cprof['name']}] commands rejected by this device, trying the next command profile"
                        )
                        continue

                    # Step 3: per-interface detail for every port that has a neighbor
                    intf_order: List[str] = []
                    details_by_intf: Dict[str, List[Dict[str, str]]] = {}
                    for row in brief_rows:
                        intf = row["local_port"]
                        if intf in details_by_intf:
                            continue
                        intf_order.append(intf)
                        cmd = cmds["lldp_detail"].format(intf=intf) if "{intf}" in cmds["lldp_detail"] else cmds["lldp_detail"]
                        details: List[Dict[str, str]] = []
                        try:
                            detail_raw = NetmikoService.clean_cli_output(
                                net_connect.send_command(cmd, read_timeout=settings.DEFAULT_TIMEOUT)
                            )
                            raw_parts.append(f"<{sysname}> {cmd}\n{detail_raw}")
                            details = cls.parse_detail(detail_raw, parser, default_local_port=intf)
                        except Exception as e:
                            log_lines.append(f"Step 3: '{cmd}' failed: {e}")
                        details_by_intf[intf] = details
                        log_lines.append(f"Step 3: '{cmd}' -> {len(details)} neighbor(s)")

                    # Step 4: ports without detail -> run the full LLDP detail command once
                    missing = [i for i in intf_order if not details_by_intf[i]]
                    if missing or not brief_rows:
                        try:
                            full_raw = NetmikoService.clean_cli_output(
                                net_connect.send_command(cmds["lldp_full"], read_timeout=settings.DEFAULT_TIMEOUT * 4)
                            )
                            raw_parts.append(f"<{sysname}> {cmds['lldp_full']}\n{full_raw}")
                            full_rows = cls.parse_detail(full_raw, parser)
                            log_lines.append(
                                f"Step 4: {len(missing)} port(s) without detail, '{cmds['lldp_full']}' returned {len(full_rows)} neighbor(s)"
                            )
                            by_key: Dict[str, List[Dict[str, str]]] = {}
                            for r in full_rows:
                                by_key.setdefault(cls.intf_key(r["local_port"]), []).append(r)
                            if not brief_rows:
                                # Brief could not be parsed at all: use the full output as-is
                                for r in full_rows:
                                    if r["local_port"] not in details_by_intf:
                                        intf_order.append(r["local_port"])
                                        details_by_intf[r["local_port"]] = []
                                    details_by_intf[r["local_port"]].append(r)
                            for intf in missing:
                                details_by_intf[intf] = by_key.get(cls.intf_key(intf), [])
                        except Exception as e:
                            log_lines.append(f"Step 4: '{cmds['lldp_full']}' failed: {e}")

                    for intf in intf_order:
                        details = details_by_intf[intf]
                        if not details:
                            # Last resort: brief values for this port
                            log_lines.append(f"Step 4: {intf} has no detail anywhere, used brief values")
                            details = [
                                {
                                    "local_port": r["local_port"],
                                    "remote_device": r["remote_device"] or "N/A",
                                    "remote_port": r["remote_port"] or "N/A",
                                    "remote_ip": "",
                                    "remote_model": "",
                                }
                                for r in brief_rows if r["local_port"] == intf
                            ]
                        for d in details:
                            neighbors.append({
                                "Local Device": sysname,
                                "Local Model": model,
                                "Local IP": local_ip,
                                "Local Port": d["local_port"],
                                "Remote Device": d["remote_device"],
                                "Remote Model": d.get("remote_model", ""),
                                "Remote Port": d["remote_port"],
                                "Remote IP": d.get("remote_ip", ""),
                                # Source of Remote Model, kept for 'Re-parse' after the model rules change
                                "Remote Description": d.get("remote_description", ""),
                            })

                    # Reaching here means the device accepted this profile's commands
                    # (a rejection already moved on above), so an empty neighbor list
                    # is a real answer - do not sweep the next vendor's commands.
                    log_lines.append(f"Step 5: Parsed {len(neighbors)} neighbors with [{cprof['name']}].")
                    break
        except Exception as e:
            status = f"Failed: {e}"
            error = str(e)
            log_lines.append(f"ERROR: {status}")

        return {
            "hostname": sysname,
            "ip": local_ip,
            "model": model,
            # Source of the model, kept for 'Re-parse' after the model rules change
            "version_output": version_output,
            "command_profile": used_profile,
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
        enable_tcp_scan: bool = False,
        scan_workers: int = 50,
        tcp_timeout: float = 1.5,
        recursive: bool = False,
        max_depth: int = 3,
        command_profile_ids: Optional[List[str]] = None,
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
            alive_indices = []

            if enable_tcp_scan:
                from app.services.lldp_scan_service import tcp_alive
                tcp_results = {}
                with ThreadPoolExecutor(max_workers=min(scan_workers, len(wave))) as tcp_exec:
                    tcp_futs = {
                        tcp_exec.submit(tcp_alive, dev.host, dev.port or settings.DEFAULT_SSH_PORT, tcp_timeout): i
                        for i, dev in enumerate(wave)
                    }
                    for fut in as_completed(tcp_futs):
                        tcp_results[tcp_futs[fut]] = fut.result()

                for i, dev in enumerate(wave):
                    if tcp_results.get(i):
                        alive_indices.append(i)
                    else:
                        port = dev.port or settings.DEFAULT_SSH_PORT
                        results[i] = {
                            "hostname": dev.name or dev.host,
                            "ip": dev.host,
                            "model": "",
                            "depth": depth,
                            "status": "UNREACHABLE",
                            "success": False,
                            "error": f"TCP/{port} port closed or no response within {tcp_timeout}s",
                            "neighbors_found": 0,
                            "neighbors": [],
                            "log": f"TCP/{port} closed or no response within {tcp_timeout}s (host down, ACL or firewall)",
                            "raw_output": "",
                            "execution_time_seconds": round(tcp_timeout, 2),
                        }
            else:
                alive_indices = list(range(len(wave)))

            if alive_indices:
                with ThreadPoolExecutor(max_workers=min(workers, len(alive_indices))) as executor:
                    futures = {
                        executor.submit(cls.collect_device, wave[i], depth, command_profile_ids): i
                        for i in alive_indices
                    }
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
        cls.fill_remote_models(all_neighbors, hosts)
        success = sum(1 for h in hosts if h["success"])
        return {
            "total_hosts": len(hosts),
            "success_hosts": success,
            "failed_hosts": len(hosts) - success,
            "total_lldp_rows": len(all_neighbors),
            "overall_time_seconds": round(time.time() - start, 2),
            "neighbors": all_neighbors,
            "hosts": hosts,
            "topology": cls.build_topology(all_neighbors, hosts),
        }

    @staticmethod
    def version_from_raw(raw_output: str) -> str:
        """
        The 'display version' / 'show version' output inside a host's raw output
        (results collected before version_output was stored). Sections look like
        '<SW1> display version\n...'; the last one is from the profile that worked.
        """
        found = ""
        section = re.compile(r"^<[^<>\r\n]*> (.+)$", re.MULTILINE)
        heads = list(section.finditer(raw_output or ""))
        for i, m in enumerate(heads):
            if re.search(r"\bversion\b", m.group(1), re.I):
                end = heads[i + 1].start() if i + 1 < len(heads) else len(raw_output)
                body = raw_output[m.end():end]
                # Drop the '===== Command profile: X =====' line that starts the next profile
                found = re.split(r"^={5} Command profile: .*$", body, flags=re.MULTILINE)[0].strip()
        return found

    @classmethod
    def reparse(cls, neighbors: List[Dict[str, Any]], hosts: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Re-run model extraction and role guessing on an existing result with the
        current model rules, without SSH. Hosts use their version output, neighbor
        rows their LLDP System description; rows without a source keep their model.
        """
        changed_hosts = changed_rows = 0
        for h in hosts:
            text = h.get("version_output") or cls.version_from_raw(h.get("raw_output") or "")
            if not text:
                continue
            model = cls.extract_model(text)
            if model and model != h.get("model"):
                h["model"] = model
                changed_hosts += 1
        host_models = {h.get("hostname"): h.get("model", "") for h in hosts if h.get("hostname")}
        for n in neighbors:
            before = (n.get("Local Model", ""), n.get("Remote Model", ""))
            if host_models.get(n.get("Local Device")):
                n["Local Model"] = host_models[n.get("Local Device")]
            desc = n.get("Remote Description") or ""
            if desc:
                n["Remote Model"] = cls.extract_model(desc) or n.get("Remote Model", "")
            if (n.get("Local Model", ""), n.get("Remote Model", "")) != before:
                changed_rows += 1
        cls.fill_remote_models(neighbors, hosts)
        return {
            "neighbors": neighbors,
            "hosts": hosts,
            "topology": cls.build_topology(neighbors, hosts),
            "changed_hosts": changed_hosts,
            "changed_rows": changed_rows,
        }

    @classmethod
    def build_topology(cls, neighbors: List[Dict[str, Any]], hosts: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Nodes keyed by sysname (hostname, ip, model, role) and de-duplicated links:
        A:GE0/0/1 <-> B:GE0/0/2 reported from both sides becomes one link with confirmed=True.
        """
        nodes: Dict[str, Dict[str, Any]] = {}

        def ensure(name: str, ip: str = "", model: str = "") -> str:
            node = nodes.setdefault(name, {"id": name, "hostname": name, "ip": "", "model": "", "discovered": False})
            if ip and not node["ip"]:
                node["ip"] = ip
            if model and not node["model"]:
                node["model"] = model
            return name

        # SSH'd hosts first so their login IP and 'display version' model take priority
        for h in hosts:
            if h.get("success") and h.get("status") != "DUPLICATE" and h.get("hostname"):
                nodes[ensure(h["hostname"], h.get("ip", ""), h.get("model", ""))]["discovered"] = True

        # Backup for FQDN names the rule above keeps: 'X.<domain>' is the same box as a known 'X'
        def canonical(name: str) -> str:
            if name in nodes or "." not in name:
                return name
            host = name.split(".", 1)[0]
            return host if host in nodes else name

        links: Dict[Any, Dict[str, Any]] = {}
        for n in neighbors:
            local = (n.get("Local Device") or "").strip()
            if not local:
                continue
            local = canonical(local)
            ensure(local, n.get("Local IP", ""), n.get("Local Model", ""))
            remote = (n.get("Remote Device") or "").strip()
            if not remote or remote.upper() == "N/A":
                remote = n.get("Remote IP") or f"Unknown ({local} {n.get('Local Port', '')})"
            else:
                remote = canonical(remote)
            ensure(remote, n.get("Remote IP", ""), n.get("Remote Model", ""))
            if remote == local:
                continue
            local_side = (local, cls.intf_key(n.get("Local Port", "")))
            remote_side = (remote, cls.intf_key(n.get("Remote Port", "")))
            key = tuple(sorted([local_side, remote_side]))
            if key in links:
                if links[key]["source"] != local:
                    links[key]["confirmed"] = True
                continue
            links[key] = {
                "source": local,
                "target": remote,
                "source_port": n.get("Local Port", ""),
                "target_port": n.get("Remote Port", ""),
                "confirmed": False,
            }

        degree: Dict[str, int] = {}
        for link in links.values():
            degree[link["source"]] = degree.get(link["source"], 0) + 1
            degree[link["target"]] = degree.get(link["target"], 0) + 1
        for node in nodes.values():
            info = cls.device_role_info(node["model"])
            node["role"] = info["role"]
            # Where the icon came from: a model rule, the built-in guess, or nothing
            node["role_source"] = info["source"]
            node["role_rule"] = info["rule_name"]
            node["degree"] = degree.get(node["id"], 0)

        # Model rules can also give firewall / server / wireless ...
        role_order = {"router": 0, "firewall": 1, "switch": 2, "wireless": 3, "server": 4, "unknown": 9}
        return {
            "nodes": sorted(nodes.values(), key=lambda x: (role_order.get(x["role"], 5), -x["degree"], x["hostname"])),
            "links": list(links.values()),
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
            ["Local Device", "Local Model", "Local IP", "Local Port", "Remote Device", "Remote Model", "Remote Port", "Remote IP"],
            neighbors,
        )

        # Sheet 2: host list & status (shows which hosts have no neighbors)
        ws2 = wb.create_sheet("Execution_Summary")
        write_sheet(
            ws2,
            ["Hostname", "IP Address", "Model", "Depth", "Status", "Neighbors Found", "Time (s)"],
            [
                {
                    "Hostname": h.get("hostname"),
                    "IP Address": h.get("ip"),
                    "Model": h.get("model", ""),
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
