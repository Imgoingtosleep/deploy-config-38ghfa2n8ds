import re
import time
import socket
import http.client
import ssl
import app.services.ssh_compat  # noqa: F401  — apply global SSH algorithm compatibility
import paramiko
from typing import Dict, Any, Optional, Tuple, List
from app.schemas.device import DeviceCredentials
from app.core.config import settings

# device_type values that ask for detection instead of naming a driver
AUTO_TYPES = ("", "autodetect", "auto")
# What detect_device_type() answers when it cannot name a driver. These are statuses,
# never drivers: resolve_driver() turns them into a real driver for the connection.
#   unreachable - nothing answered on the SSH / telnet port
#   auth_failed - it answered, every credential was rejected
#   cant_detect - it answered (and usually logged in) but no banner, prompt or
#                 version command named the vendor
DETECT_FAILURES = ("unreachable", "auth_failed", "cant_detect", "unknown")
# 'unknown' is also a device type the user (or Detect Types) sets when the vendor cannot be
# named: LLDP then tries every command profile; other features detect again, then use the default

# Vendor names printed before / right after login, shared by the SSH and telnet probes
_LOGIN_BANNER_SIGNATURES = [
    ("huawei", r"Huawei Versatile Routing Platform|VRP \(R\) Software|Huawei Technologies|Quidway|CloudEngine", "Huawei VRP"),
    ("cisco_nxos", r"Cisco Nexus|NX-OS", "Cisco NX-OS"),
    ("cisco_ios", r"Cisco IOS Software|IOS-XE|Cisco Systems", "Cisco IOS"),
    ("hp_comware", r"H3C Comware|HPE Comware|Comware Software|New H3C Technologies", "H3C Comware"),
    ("aruba_os", r"ArubaOS|ProCurve", "Aruba OS"),
    ("juniper_junos", r"JUNOS", "Juniper JunOS"),
    ("mikrotik_routeros", r"MikroTik|RouterOS", "MikroTik RouterOS"),
    ("raisecom_roap", r"Raisecom|ROS Software", "Raisecom ROS"),
]
# Printed by Cisco IOS on telnet, but also by Cisco-style clones: decides which driver
# logs in first, and names Cisco only when logging in cannot name the vendor
_CISCO_TELNET_HINT = r"User Access Verification"

# Vendor named outright in the output of a version command, in the order they are told
# apart (NX-OS before IOS: its 'show version' also says "Cisco Systems")
_VERSION_SIGNATURES = [
    ("huawei", r"Huawei|VRP \(R\)|CloudEngine|Quidway"),
    ("hp_comware", r"H3C|Comware"),
    ("cisco_nxos", r"NX-OS|Nexus"),
    ("raisecom_roap", r"Raisecom"),
    ("cisco_ios", r"Cisco IOS Software|Cisco Internetwork Operating System|IOS \(tm\)|IOS-XE|Cisco Systems|"
                  r"\bcisco (?:WS-|C\d|ISR|CISCO|Catalyst)"),
    ("aruba_os", r"ArubaOS|ProCurve"),
    ("juniper_junos", r"JUNOS"),
    ("mikrotik_routeros", r"RouterOS|MikroTik"),
]

# Raisecom 'show version' without the company name: "Software Version: ROS_4.14.2211...",
# product names ISCOM2924GF, RAX711, iTN201, RC002. Weak - a Cisco could be named "RAX1" -
# so only used once no vendor above is named, with the device's own hostname taken out.
# ROS is matched with no letter around it (\bROS\b misses "ROS_4.14", and must not hit "RouterOS")
_RAISECOM_HINTS = r"(?<![A-Za-z])ROS(?![A-Za-z])|\bISCOM\d|\bRAX\d|\biTN\d|\bRC\d{3}|Gazelle"

# Raisecom ROS keeps its factory hostname "Raisecom" on most boxes (a hint: confirmed by 'show version')
_RAISECOM_PROMPT = r"^Raisecom[\w.\-]*[>#]$"
# Login asked inside the shell after the SSH session opened (Raisecom ROS: "Login:" / "Password:")
_SHELL_LOGIN_PROMPT = r"(?:^|\n)\s*(?:login|username|user name)\s*:\s*$"
_SHELL_PASSWORD_PROMPT = r"(?:^|\n)\s*password\s*:\s*$"
_MORE_PROMPT = r"-+\s*more\s*-+|\(more\)|press any key"

# Telnet driver for each SSH driver the detector can return
_TELNET_DRIVERS = {
    "huawei": "huawei_telnet",
    "cisco_ios": "cisco_ios_telnet",
    "cisco_nxos": "cisco_nxos_telnet",
    "hp_comware": "hp_comware_telnet",
    "aruba_os": "aruba_procurve_telnet",
    "juniper_junos": "juniper_junos_telnet",
    "raisecom_roap": "raisecom_telnet",
}

_ALL_LOGINS_REJECTED = "every probe login was rejected"


def is_driver(device_type: Optional[str]) -> bool:
    """True when device_type names a driver, not 'autodetect' or a detection status"""
    t = (device_type or "").strip().lower()
    return t not in AUTO_TYPES and t not in DETECT_FAILURES


def match_login_banner(text: str) -> Optional[Tuple[str, str]]:
    """(driver, vendor label) of the first vendor named in a login banner"""
    for driver, pattern, label in _LOGIN_BANNER_SIGNATURES:
        if re.search(pattern, text or "", re.I):
            return driver, label
    return None


def match_version_output(text: str, hostname: str = "") -> Optional[str]:
    """
    Driver of the vendor a version command's output names. The device's own hostname
    lines (prompt, "<host> uptime is") are left out first, so a Cisco named
    "Raisecom-uplink" or "RAX1-core" stays Cisco. A vendor named outright wins; the
    Raisecom model / ROS hints come last.
    """
    text = text or ""
    if hostname:
        own = re.compile(r"^\s*" + re.escape(hostname) + r"(?:[\s>#(]|$)", re.I)
        text = "\n".join(line for line in text.splitlines() if not own.match(line))
    for driver, pattern in _VERSION_SIGNATURES:
        if re.search(pattern, text, re.I):
            return driver
    if re.search(_RAISECOM_HINTS, text, re.I):
        return "raisecom_roap"
    return None


def prompt_hostname(prompt: str) -> str:
    """'Core-SW(config)#' -> 'Core-SW'"""
    return re.sub(r"(\(.*\))?[>#\]]\s*$", "", (prompt or "").strip()).lstrip("<[")


def clean_ansi(text: str) -> str:
    """Strip VT100/ANSI escape sequences, OSC title codes, and non-printable control characters."""
    if not text:
        return ""
    # 1. Strip OSC (Operating System Command) e.g. \x1b]0;title\x07 or \x1b]0;title\x1b\\
    text = re.sub(r'\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)', '', text)
    # 2. Strip CSI and standard ANSI escape sequences
    text = re.sub(r'\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])', '', text)
    # 3. Strip non-printable control characters (except newline \n and carriage return \r)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)
    return text


def _read_channel_response(channel, timeout: float = 1.2) -> str:
    """Read channel data efficiently, returning early as soon as the switch finishes sending."""
    start = time.time()
    buf = ""
    while time.time() - start < timeout:
        if channel.recv_ready():
            while channel.recv_ready():
                buf += channel.recv(4096).decode("utf-8", errors="ignore")
            # Wait a brief moment to collect any subsequent fragment
            time.sleep(0.06)
            while channel.recv_ready():
                buf += channel.recv(4096).decode("utf-8", errors="ignore")
            break
        time.sleep(0.04)
    return buf


def _last_line(text: str) -> str:
    lines = [line.strip() for line in clean_ansi(text).splitlines() if line.strip()]
    return lines[-1] if lines else ""


def _run_probe_command(channel, command: str, timeout: float = 4.0) -> str:
    """
    Send a command and read until the prompt comes back (or timeout), paging through
    --More--. Reading only the first burst can return just the echoed command, which
    would then look like a Cisco box that accepted the command.
    """
    channel.send(command + "\r\n")
    buf = ""
    deadline = time.time() + timeout
    while time.time() < deadline:
        chunk = _read_channel_response(channel, timeout=0.6)
        if not chunk:
            continue
        buf += chunk
        last = _last_line(buf)
        if re.search(_MORE_PROMPT, last, re.I):
            channel.send(" ")
            continue
        if last and last != command and re.search(r"[>#\]]$", last):
            break
    return clean_ansi(buf)


class AutoDetectService:
    """
    Intelligent Multi-Stage Network Device Auto-Detection Service.
    Detects whether an IP is Huawei VRP, Cisco IOS/XE, Cisco NX-OS, Aruba, HP Comware,
    Juniper, MikroTik, Raisecom, or Linux using:
      Stage 1: Pre-Auth Raw SSH/Telnet Greeting Banner (< 0.1s, Zero Credentials Needed)
      Stage 2: Web/HTTP Signature Sniffing (< 0.1s fallback if zero credentials)
      Stage 3: Interactive Shell with ANSI-Cleaned Prompt Matching (~0.5s)
      Stage 4: Dual-Vendor Active Command Probing (`display version` vs `show version`)
      Stage 5: Prioritized Fast Fallback Probing via Netmiko
    """
    _cache: Dict[str, str] = {}
    _cache_ts: Dict[str, float] = {}
    CACHE_TTL: float = 300.0  # 5 minutes TTL

    @staticmethod
    def _cache_key(host: str, port: Optional[int]) -> str:
        # Port is part of the key: SSH on 22 and telnet on 23 (or a console server
        # mapping several devices behind one IP) are different drivers
        return f"{host}:{port or 22}"

    @classmethod
    def get_cached_type(cls, host: str, port: Optional[int] = None) -> Optional[str]:
        if not host:
            return None
        key = cls._cache_key(host, port)
        cached = cls._cache.get(key)
        if not cached:
            return None
        ts = cls._cache_ts.get(key, 0)
        if time.time() - ts > cls.CACHE_TTL:
            cls._cache.pop(key, None)
            cls._cache_ts.pop(key, None)
            return None
        return cached

    @classmethod
    def set_cached_type(cls, host: str, device_type: str, port: Optional[int] = None):
        if host and is_driver(device_type):
            key = cls._cache_key(host, port)
            cls._cache[key] = device_type
            cls._cache_ts[key] = time.time()

    @staticmethod
    def is_telnet(device: DeviceCredentials) -> bool:
        return device.port == 23 or "telnet" in (device.device_type or "").lower()

    @staticmethod
    def telnet_driver(driver: str) -> str:
        from netmiko.ssh_dispatcher import platforms
        if driver.endswith("_telnet"):
            return driver
        tel = _TELNET_DRIVERS.get(driver) or f"{driver}_telnet"
        return tel if tel in platforms else driver

    @staticmethod
    def ssh_driver(driver: str) -> str:
        """SSH name of a driver: huawei_telnet -> huawei, aruba_procurve_telnet -> aruba_os.
        Detection answers in SSH names; the connection picks the telnet variant from the
        port (23), so the Device Type list needs SSH drivers only."""
        for ssh, tel in _TELNET_DRIVERS.items():
            if driver == tel:
                return ssh
        return driver[: -len("_telnet")] if driver.endswith("_telnet") else driver

    @classmethod
    def fallback_driver(cls, device: DeviceCredentials) -> str:
        """Driver used when detection cannot name one: DEFAULT_DEVICE_TYPE, telnet variant on telnet"""
        from netmiko.ssh_dispatcher import platforms
        base = (settings.DEFAULT_DEVICE_TYPE or "").strip().lower()
        if base not in platforms:
            base = "huawei" if "huawei" in base else "cisco_ios"
        return cls.telnet_driver(base) if cls.is_telnet(device) else base

    @classmethod
    def resolve_driver(cls, device: DeviceCredentials) -> Tuple[str, str]:
        """
        Driver to connect with. Never returns a detection status: a device already set to
        a driver keeps it, 'autodetect' is detected, and when detection fails (or the device
        is on a serial console, where there is nothing to probe over the network) the
        default driver is used and the note says why.
        """
        if is_driver(device.device_type):
            return device.device_type.strip().lower(), ""
        fallback = cls.fallback_driver(device)
        if device.connection_mode == "serial":
            return fallback, f"serial console: auto-detect skipped, default driver {fallback}"
        try:
            detected, reason = cls.detect_device_type(device)
        except Exception as e:
            return fallback, f"auto-detect error ({e}), default driver {fallback}"
        if is_driver(detected):
            return detected, f"auto-detected {detected}: {reason}"
        return fallback, f"auto-detect {detected} ({reason}), default driver {fallback}"

    @classmethod
    def clear_cache(cls):
        cls._cache.clear()
        cls._cache_ts.clear()

    @classmethod
    def detect_device_type(
        cls,
        device: DeviceCredentials,
        timeout: int = 10,
        force_refresh: bool = False
    ) -> Tuple[str, str]:
        """
        Detect device type for given credentials.
        Returns: (detected_type, details_reason)
        e.g. ("huawei", "Detected from prompt signature: <Huawei-Core>")
        """
        if device.connection_mode == "serial":
            # host defaults to 192.168.1.1, so probing it would name some other device's vendor
            return "cant_detect", "Serial console device: vendor cannot be detected over the network, set the type manually"

        host = (device.host or "").strip()
        if not host:
            return "unreachable", "Host not specified"

        is_telnet = cls.is_telnet(device)
        port = device.port or (23 if is_telnet else settings.DEFAULT_SSH_PORT or 22)

        # Check memory cache first (respecting TTL unless force_refresh requested)
        if not force_refresh:
            cached = cls.get_cached_type(host, port)
            if cached:
                return cached, f"Resolved from session cache: {cached}"

        # Resolve credentials pool / fallback candidates
        from app.services.netmiko_service import NetmikoService
        candidates = NetmikoService._resolve_credential_candidates(device)
        has_credentials = any(c.get("username") and c.get("password") for c in candidates)

        # Telnet has no SSH banner or paramiko session to look at: its own path
        if is_telnet:
            return cls._detect_over_telnet(device, host, port, candidates)

        # --- Stage 1: Pre-Auth Raw SSH Greeting Banner (< 0.1s, Zero Credentials Needed) ---
        try:
            detected_raw, reason_raw = cls._probe_raw_ssh_banner(host, port=port, timeout=0.8)
            if detected_raw:
                cls.set_cached_type(host, detected_raw, port)
                return detected_raw, reason_raw
        except Exception:
            pass

        # --- Stage 2: Web/HTTP Signature Sniffing (< 0.1s Fallback when Zero Credentials) ---
        # If no credentials were provided and raw SSH banner was generic, try Web management
        if not has_credentials:
            try:
                detected_web, reason_web = cls._probe_via_web(host, timeout=0.8)
                if detected_web:
                    cls.set_cached_type(host, detected_web, port)
                    return detected_web, reason_web
            except Exception:
                pass

        # --- Stage 3 & 4: Authenticated SSH Banner, Prompt Signature & Command Probe ---
        is_unreachable = False
        is_auth_failure = False
        err_reason = ""
        authed_cred: Optional[Dict[str, Any]] = None  # a credential that logged in but told us no vendor

        if not has_credentials:
            # When zero credentials are provided, test raw TCP port connectivity
            sock = socket.socket()
            sock.settimeout(1.0)
            try:
                sock.connect((host, port))
                sock.close()
            except Exception as net_err:
                is_unreachable = True
                err_reason = f"Host {host} unreachable on port {port}: {str(net_err)}"

        if not is_unreachable:
            for c_idx, c in enumerate(candidates, 1):
                c_user = c.get("username") or ""
                c_pass = c.get("password") or ""
                if not c_user and not c_pass:
                    continue

                try:
                    detected_ssh, reason_ssh = cls._probe_via_ssh(
                        host=host,
                        port=port,
                        username=c_user,
                        password=c_pass,
                        timeout=min(max(timeout, 6), 10)
                    )
                    if detected_ssh:
                        device.username = c_user
                        cls.set_cached_type(host, detected_ssh, port)
                        return detected_ssh, f"{reason_ssh} (via user: {c_user})"
                    # Logged in, but the banner/prompt did not name a vendor. Keep this
                    # credential for the command probe below and stop here: the remaining
                    # credentials are wrong for this device and would only pile up failed
                    # logins (and make the result look like an authentication problem).
                    authed_cred = c
                    break
                except paramiko.ssh_exception.AuthenticationException as auth_err:
                    is_auth_failure = True
                    err_reason = f"Authentication failed for {c_user}@{host}: Username or password incorrect"
                    if c_idx < len(candidates):
                        continue
                except (socket.timeout, TimeoutError, OSError) as net_err:
                    is_unreachable = True
                    err_reason = f"Device unreachable on port {port}: {str(net_err)}"
                    break
                except paramiko.ssh_exception.SSHException as ssh_err:
                    err_str = str(ssh_err).lower()
                    if "auth" in err_str or "channel" in err_str or "password" in err_str:
                        is_auth_failure = True
                        err_reason = f"Authentication or channel failed for {c_user}@{host}: {str(ssh_err)}"
                        if c_idx < len(candidates):
                            continue
                    elif any(s in err_str for s in ["timed out", "refused", "unreachable", "no route", "banner", "reset", "closed", "not connected", "protocol"]):
                        is_unreachable = True
                        err_reason = f"Connection failed on port {port}: {str(ssh_err)}"
                        break
                    else:
                        err_reason = f"SSH Protocol error: {str(ssh_err)}"
                except (EOFError, ConnectionResetError, ConnectionRefusedError, ConnectionError) as conn_err:
                    is_unreachable = True
                    err_reason = f"Connection failed on port {port}: {str(conn_err)}"
                    break
                except Exception as e:
                    err_reason = f"SSH Probe error: {str(e)}"

        # If device is unreachable, return unreachable immediately (do NOT default to huawei)
        if is_unreachable:
            return "unreachable", err_reason

        # --- Stage 4: Prioritized Fast Prober (with the credential that logged in, if any) ---
        probe_creds = [authed_cred] if authed_cred else candidates
        if (authed_cred or not is_auth_failure) and any(c.get("username") for c in probe_creds):
            for c in probe_creds:
                if not c.get("username"):
                    continue
                try:
                    probe_dev = device.copy()
                    probe_dev.username = c["username"]
                    probe_dev.password = c["password"]
                    detected_fast, reason_fast = cls._probe_prioritized_cli(probe_dev)
                    if detected_fast:
                        device.username = c["username"]
                        cls.set_cached_type(host, detected_fast, port)
                        return detected_fast, f"{reason_fast} (via user: {c['username']})"
                except Exception:
                    pass

        # --- Stage 5: Explicit status responses (NEVER default to huawei) ---
        if is_auth_failure and not authed_cred:
            return "auth_failed", f"Authentication Failed on {host}:{port} - {err_reason}"

        if authed_cred:
            return "cant_detect", (
                f"Logged in to {host}:{port} as {authed_cred.get('username')}, but the vendor could not be "
                f"identified from the banner, the prompt or a version command"
            )

        if not has_credentials:
            return "cant_detect", f"Host {host}:{port} is reachable, but credentials are required to detect vendor"

        return "cant_detect", f"Unable to determine vendor type on {host}:{port}; detection inconclusive ({err_reason})"

    @classmethod
    def _detect_over_telnet(
        cls, device: DeviceCredentials, host: str, port: int, candidates: List[Dict[str, Any]]
    ) -> Tuple[str, str]:
        """
        Telnet: read the pre-login banner (many switches name their vendor there), then
        log in with the telnet drivers and run a version command. Returns the SSH name of
        the driver (huawei, not huawei_telnet): the connection takes telnet from port 23.
        """
        try:
            banner = cls._read_telnet_banner(host, port, timeout=2.0)
        except OSError as e:
            return "unreachable", f"Host {host} unreachable on telnet port {port}: {e}"

        hit = match_login_banner(banner)
        if hit and hit[0] not in ("cisco_ios", "raisecom_roap"):
            cls.set_cached_type(host, hit[0], port)
            return hit[0], f"Detected {hit[1]} from the telnet login banner"

        # Cisco and Raisecom share the CLI, a banner naming either is free text and
        # "User Access Verification" is printed by Cisco-style clones too: these only pick
        # the driver that logs in first, and the version output decides. Only when logging
        # in names no vendor does the banner hint stand.
        if hit:
            hint = (hit[0], f"{hit[1]} named in the telnet login banner")
        elif re.search(_CISCO_TELNET_HINT, banner, re.I):
            hint = ("cisco_ios", "'User Access Verification' in the telnet login banner")
        else:
            hint = None
        # Raisecom ROS asks "Login:" where Cisco / Huawei / H3C ask "Username:"
        if hint:
            prefer = hint[0]
        elif re.search(r"(?:^|\n)\s*Login:\s*$", banner.rstrip()):
            prefer = "raisecom_roap"
        else:
            prefer = None

        def from_hint(why: str) -> Tuple[str, str]:
            cls.set_cached_type(host, hint[0], port)
            return hint[0], f"{hint[1]} ({why})"

        creds = [c for c in candidates if c.get("username") or c.get("password")]
        if not creds:
            if hint:
                return from_hint("no credentials to confirm it")
            return "cant_detect", f"Telnet {host}:{port} answered, but credentials are required to detect the vendor"

        rejected = 0
        for c in creds:
            probe_dev = device.copy()
            probe_dev.username = c.get("username") or ""
            probe_dev.password = c.get("password") or ""
            probe_dev.secret = c.get("secret") or None
            probe_dev.port = port
            detected, reason = cls._probe_prioritized_cli(probe_dev, telnet=True, prefer=prefer)
            if detected:
                detected = cls.ssh_driver(detected)
                device.username = probe_dev.username
                cls.set_cached_type(host, detected, port)
                return detected, f"{reason} (via user: {probe_dev.username})"
            if reason == _ALL_LOGINS_REJECTED:
                rejected += 1
                continue
            # Logged in but nothing matched: the other credentials would not tell us more
            if hint:
                return from_hint("no version command named another vendor")
            return "cant_detect", (
                f"Logged in to {host}:{port} over telnet as {probe_dev.username}, but no version "
                f"command named the vendor"
            )
        if rejected == len(creds):
            return "auth_failed", f"Authentication Failed on {host}:{port} (telnet) for every credential"
        if hint:
            return from_hint("login probe inconclusive")
        return "cant_detect", f"Telnet {host}:{port}: detection inconclusive"

    @staticmethod
    def _read_telnet_banner(host: str, port: int, timeout: float = 2.0) -> str:
        """
        Text a telnet server prints before the login prompt. Option negotiation is
        refused (DO -> WONT, WILL -> DONT) so the server goes on to the banner.
        Raises OSError when the port does not answer.
        """
        IAC, DONT, DO, WONT, WILL, SB, SE = 255, 254, 253, 252, 251, 250, 240
        sock = socket.create_connection((host, port), timeout=timeout)
        text = bytearray()
        try:
            sock.settimeout(0.5)
            deadline = time.time() + timeout
            while time.time() < deadline:
                try:
                    chunk = sock.recv(1024)
                except socket.timeout:
                    if text:
                        break
                    continue
                if not chunk:
                    break
                i = 0
                while i < len(chunk):
                    b = chunk[i]
                    if b == IAC and i + 1 < len(chunk):
                        cmd = chunk[i + 1]
                        if cmd in (DO, DONT, WILL, WONT) and i + 2 < len(chunk):
                            opt = chunk[i + 2]
                            if cmd == DO:
                                sock.sendall(bytes([IAC, WONT, opt]))
                            elif cmd == WILL:
                                sock.sendall(bytes([IAC, DONT, opt]))
                            i += 3
                            continue
                        if cmd == SB:
                            end = chunk.find(bytes([IAC, SE]), i)
                            i = end + 2 if end >= 0 else len(chunk)
                            continue
                        i += 2
                        continue
                    text.append(b)
                    i += 1
                if re.search(rb"(username|login|password)\s*:\s*$", bytes(text), re.I):
                    break
        finally:
            try:
                sock.close()
            except Exception:
                pass
        return clean_ansi(text.decode("utf-8", errors="ignore"))

    @classmethod
    def _probe_via_web(cls, host: str, timeout: float = 0.8) -> Tuple[Optional[str], str]:
        """Sniff Web management ports 80 and 443 for vendor headers, redirects, or login pages"""
        for port in [80, 443]:
            conn = None
            try:
                if port == 80:
                    conn = http.client.HTTPConnection(host, port=port, timeout=timeout)
                else:
                    ctx = ssl._create_unverified_context()
                    conn = http.client.HTTPSConnection(host, port=port, timeout=timeout, context=ctx)
                
                conn.request("HEAD", "/")
                res = conn.getresponse()
                loc = (res.getheader("Location") or "").strip()
                server = (res.getheader("Server") or "").strip()
                conn.close()
                conn = None

                combined = f"{loc} {server}".lower()

                # Huawei Signatures
                if "simple/view/login.html" in combined or "huawei" in combined:
                    return "huawei", f"Detected Huawei from Web management port {port} (Location: {loc})"
                
                # Cisco Signatures
                if "level/15" in combined or "cisco" in combined:
                    return "cisco_ios", f"Detected Cisco IOS from Web management port {port}"

                # Aruba / HP Signatures
                if "procurve" in combined or "aruba" in combined:
                    return "aruba_os", f"Detected Aruba/HP from Web management port {port}"

                # Juniper Signatures
                if "junos" in combined or "juniper" in combined:
                    return "juniper_junos", f"Detected Juniper JunOS from Web management port {port}"

                # MikroTik Signatures
                if "routeros" in combined or "mikrotik" in combined or "webfig" in combined:
                    return "mikrotik_routeros", f"Detected MikroTik from Web management port {port}"

                # Raisecom Signatures
                if "raisecom" in combined or "iscom" in combined:
                    return "raisecom_roap", f"Detected Raisecom from Web management port {port}"

            except Exception:
                pass
            finally:
                if conn:
                    try:
                        conn.close()
                    except Exception:
                        pass
        return None, ""

    @classmethod
    def _probe_raw_ssh_banner(cls, host: str, port: int = 22, timeout: float = 0.8) -> Tuple[Optional[str], str]:
        """Read initial SSH greeting string via raw TCP socket without needing credentials"""
        s = socket.socket()
        s.settimeout(timeout)
        try:
            s.connect((host, port))
            banner = s.recv(1024).decode("utf-8", errors="ignore").strip()
            b_lower = banner.lower()
            if re.search(r"huawei|vrp|quidway", b_lower):
                return "huawei", f"Detected Huawei from pre-auth SSH greeting: {banner}"
            if re.search(r"nx-os|nexus", b_lower):
                return "cisco_nxos", f"Detected Cisco NX-OS from pre-auth SSH greeting: {banner}"
            if re.search(r"cisco", b_lower):
                return "cisco_ios", f"Detected Cisco from pre-auth SSH greeting: {banner}"
            if re.search(r"h3c|comware", b_lower):
                return "hp_comware", f"Detected HP/H3C Comware from pre-auth SSH greeting: {banner}"
            if re.search(r"aruba|procurve", b_lower):
                return "aruba_os", f"Detected Aruba from pre-auth SSH greeting: {banner}"
            if re.search(r"juniper|junos", b_lower):
                return "juniper_junos", f"Detected Juniper JunOS from pre-auth SSH greeting: {banner}"
            if re.search(r"mikrotik|routeros", b_lower):
                return "mikrotik_routeros", f"Detected MikroTik from pre-auth SSH greeting: {banner}"
            if re.search(r"raisecom|roap", b_lower):
                return "raisecom_roap", f"Detected Raisecom from pre-auth SSH greeting: {banner}"
            if re.search(r"ubuntu|debian|raspbian|centos|redhat|alma|rocky", b_lower):
                return "linux", f"Detected Linux from pre-auth SSH greeting: {banner}"
        except Exception:
            pass
        finally:
            try:
                s.close()
            except Exception:
                pass
        return None, ""

    @staticmethod
    def _connect_noauth(host: str, port: int, username: str, timeout: int) -> Optional[paramiko.SSHClient]:
        """SSH session opened with "none" auth (login then happens in the shell), None when refused"""
        from netmiko.ssh_auth import SSHClient_noauth
        client = SSHClient_noauth()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(
                hostname=host,
                port=port,
                username=username,
                password="",
                timeout=timeout,
                banner_timeout=timeout,
                auth_timeout=timeout,
                allow_agent=False,
                look_for_keys=False,
            )
            return client
        except Exception:
            client.close()
            return None

    @staticmethod
    def _shell_login(channel, text: str, username: str, password: str) -> str:
        """
        Answer Login:/Password: asked inside the shell. Returns what the device printed;
        raises AuthenticationException when it asks again (credential rejected).
        """
        out = ""
        sent_user = sent_pass = False
        for _ in range(4):
            tail = clean_ansi(text).rstrip()
            if re.search(_SHELL_PASSWORD_PROMPT, tail, re.I):
                if sent_pass:
                    raise paramiko.ssh_exception.AuthenticationException("in-shell login rejected")
                channel.send((password or "") + "\r\n")
                sent_pass = True
            elif re.search(_SHELL_LOGIN_PROMPT, tail, re.I):
                if sent_user:
                    raise paramiko.ssh_exception.AuthenticationException("in-shell login rejected")
                channel.send((username or "") + "\r\n")
                sent_user = True
            else:
                break
            # Read until the next question or a prompt: the echoed username comes first
            text = ""
            deadline = time.time() + 4.0
            while time.time() < deadline:
                text += _read_channel_response(channel, timeout=0.6)
                t = clean_ansi(text).rstrip()
                if (re.search(_SHELL_LOGIN_PROMPT, t, re.I) or re.search(_SHELL_PASSWORD_PROMPT, t, re.I)
                        or re.search(r"[>#]$", t)):
                    break
            out += text
        if re.search(r"fail|incorrect|invalid|denied", clean_ansi(out), re.I) and not re.search(r"[>#]\s*$", clean_ansi(out)):
            raise paramiko.ssh_exception.AuthenticationException("in-shell login rejected")
        return out

    @classmethod
    def _probe_via_ssh(cls, host: str, port: int, username: str, password: str, timeout: int) -> Tuple[Optional[str], str]:
        """Probe device by opening SSH session and inspecting pre-auth / post-auth output and prompt"""
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            try:
                client.connect(
                    hostname=host,
                    port=port,
                    username=username,
                    password=password,
                    timeout=timeout,
                    banner_timeout=timeout,
                    auth_timeout=timeout,
                    allow_agent=False,
                    look_for_keys=False,
                )
            except paramiko.ssh_exception.AuthenticationException as auth_err:
                # Raisecom ROS (some releases) takes the SSH session with "none" auth and
                # asks Login: / Password: inside the shell - Netmiko's raisecom driver
                # connects the same way. Anything else still fails as a bad login.
                client.close()
                client = cls._connect_noauth(host, port, username, timeout)
                if client is None:
                    raise auth_err

            # 1. Check SSH transport banner
            transport = client.get_transport()
            if transport:
                remote_ver = (transport.remote_version or "").lower()
                if re.search(r"huawei|vrp|quidway", remote_ver):
                    client.close()
                    return "huawei", f"Detected from SSH server version: {remote_ver}"
                if re.search(r"nx-os|nexus", remote_ver):
                    client.close()
                    return "cisco_nxos", f"Detected from SSH server version: {remote_ver}"
                if re.search(r"cisco", remote_ver):
                    client.close()
                    return "cisco_ios", f"Detected from SSH server version: {remote_ver}"
                if re.search(r"h3c|comware", remote_ver):
                    client.close()
                    return "hp_comware", f"Detected from SSH server version: {remote_ver}"
                if re.search(r"aruba|procurve", remote_ver):
                    client.close()
                    return "aruba_os", f"Detected from SSH server version: {remote_ver}"
                if re.search(r"junos|juniper", remote_ver):
                    client.close()
                    return "juniper_junos", f"Detected from SSH server version: {remote_ver}"
                if re.search(r"mikrotik|routeros", remote_ver):
                    client.close()
                    return "mikrotik_routeros", f"Detected from SSH server version: {remote_ver}"
                if re.search(r"raisecom|roap", remote_ver):
                    client.close()
                    return "raisecom_roap", f"Detected from SSH server version: {remote_ver}"
                if re.search(r"ubuntu|debian|raspbian|centos|redhat|alma|rocky", remote_ver):
                    client.close()
                    return "linux", f"Detected from SSH server version: {remote_ver}"

            # 2. Open interactive shell channel to read welcome banners and prompt
            channel = client.invoke_shell(term="vt100", width=120, height=40)
            channel.settimeout(4.0)

            # Read initial buffer (Welcome banners)
            initial_buffer = _read_channel_response(channel, timeout=1.0)
            if not initial_buffer.strip():
                channel.send("\r\n")
                initial_buffer += _read_channel_response(channel, timeout=1.5)
            initial_cleaned = clean_ansi(initial_buffer)

            tail = initial_cleaned.rstrip()
            shell_login = bool(re.search(_SHELL_LOGIN_PROMPT, tail, re.I) or re.search(_SHELL_PASSWORD_PROMPT, tail, re.I))
            if shell_login:
                initial_buffer += cls._shell_login(channel, initial_cleaned, username, password)
                initial_cleaned = clean_ansi(initial_buffer)

            # Some switches (Huawei VRP with a default password, Comware) ask to change the
            # password right after login and hold the CLI until answered, so there is no prompt
            # to match yet. Decline with "N" like Netmiko does and read the real prompt.
            if re.search(r"Change now\s*\?\s*\[Y/N\]|password needs to be changed|initial password poses security risks",
                         initial_cleaned, re.I):
                channel.send("N\r\n")
                initial_buffer += _read_channel_response(channel, timeout=1.5)
                initial_cleaned = clean_ansi(initial_buffer)

            # Check initial banner text - without the prompt line (a hostname is not a vendor)
            # or the username echoed by an in-shell login
            banner_lines = [line for line in initial_cleaned.splitlines() if line.strip()][:-1]
            banner_text = "\n".join(banner_lines)
            if username:
                banner_text = re.sub(re.escape(username), " ", banner_text, flags=re.I)
            hit = match_login_banner(banner_text)
            # Cisco and Raisecom share the CLI and a MOTD is free text ("Raisecom OLT uplink"
            # on a Cisco): for those two the banner is only a hint, 'show version' decides
            banner_hint = hit if hit and hit[0] in ("cisco_ios", "raisecom_roap") else None
            if hit and not banner_hint:
                client.close()
                return hit[0], f"Detected from {hit[1]} login banner"

            # 3. Wake up prompt by sending newline
            channel.send("\r\n")
            prompt_buffer = _read_channel_response(channel, timeout=0.8)

            combined = initial_cleaned + "\n" + clean_ansi(prompt_buffer)
            lines = [line.strip() for line in combined.splitlines() if line.strip()]
            last_line = lines[-1] if lines else ""

            # Check Juniper Prompt Signature: user@host> or user@host#
            if re.search(r"[\w\.\-]+@[\w\.\-]+[>#%]", last_line):
                client.close()
                return "juniper_junos", f"Detected Juniper JunOS from prompt signature: {last_line}"

            # Check MikroTik Prompt Signature: [admin@MikroTik] > or [admin@MikroTik] /ip address>
            if re.search(r"\[.*@.*\]\s*[\/\w\s\-]*[>#]", last_line):
                client.close()
                return "mikrotik_routeros", f"Detected MikroTik RouterOS from prompt signature: {last_line}"

            # Check Linux Prompt Signature: user@host:~$ or root@host:~#
            if re.search(r"[\w\.\-]+@[\w\.\-]+:[~\w\.\-\/]+[#$]", last_line):
                client.close()
                return "linux", f"Detected Linux from prompt signature: {last_line}"

            # Check Bracket Prompt Signature: <Hostname> or [Hostname] (Shared by Huawei VRP and HP/H3C Comware)
            # Exclude '@' to prevent colliding with MikroTik/Linux prompts
            if re.search(r"^<[^>]+>$", last_line) or re.search(r"^\[[^\]@]+\]$", last_line):
                cmd_cleaned = _run_probe_command(channel, "display version", timeout=3.0)
                client.close()
                if re.search(r"H3C|Comware|HPE", cmd_cleaned, re.I):
                    return "hp_comware", f"Confirmed HP/H3C Comware via 'display version' probe (Prompt: {last_line})"
                return "huawei", f"Detected Huawei VRP from prompt signature: {last_line}"

            # 4. If prompt looks like Cisco / Generic (`>` or `#`), run Dual Active Command Probing
            if re.search(r"^[\w\.\-\(\)\/]+[>#]$", last_line):
                # Probe 1: Send Huawei command `display version`
                cmd_cleaned1 = _run_probe_command(channel, "display version", timeout=3.0)
                if re.search(r"Huawei|VRP|CloudEngine|Quidway", cmd_cleaned1, re.I):
                    client.close()
                    return "huawei", "Confirmed Huawei VRP via 'display version' probe"
                elif re.search(r"H3C|Comware", cmd_cleaned1, re.I):
                    client.close()
                    return "hp_comware", "Confirmed HP/H3C Comware via 'display version' probe"

                # Probe 2: Send Cisco command `show version`
                cmd_cleaned2 = _run_probe_command(channel, "show version", timeout=4.0)
                client.close()

                # Cisco and Raisecom share this CLI: the vendor must be named by the output.
                # Cisco IOS always prints "Cisco IOS Software" / "Cisco Internetwork Operating
                # System"; Raisecom prints "Raisecom" or at least its ROS_ version / model.
                named = match_version_output(cmd_cleaned2, prompt_hostname(last_line))
                if named == "raisecom_roap":
                    return named, "Confirmed Raisecom ROS via 'show version' probe"
                if named == "cisco_ios":
                    return named, "Confirmed Cisco IOS via 'show version' probe"
                if named:
                    return named, f"Confirmed {named} via 'show version' probe"
                if shell_login:
                    # Cisco-style CLI that asked Login:/Password: inside the SSH shell: Raisecom ROS
                    return "raisecom_roap", f"Cisco-style prompt '{last_line}' after a login inside the SSH shell (Raisecom ROS)"
                if re.search(_RAISECOM_PROMPT, last_line, re.I):
                    return "raisecom_roap", f"Raisecom factory hostname in prompt '{last_line}', 'show version' named no other vendor"
                if banner_hint:
                    return banner_hint[0], f"{banner_hint[1]} login banner, 'show version' named no other vendor"
                if not re.search(r"command not found|invalid|unknown|syntax error", cmd_cleaned2, re.I):
                    return "cisco_ios", f"Prompt '{last_line}' matched standard Cisco CLI ('show version' named no vendor)"

            client.close()
            if banner_hint:
                return banner_hint[0], f"Detected from {banner_hint[1]} login banner"
        except Exception as e:
            try:
                client.close()
            except Exception:
                pass
            raise e

        return None, "SSH probe inconclusive"

    @classmethod
    def _probe_prioritized_cli(
        cls, device: DeviceCredentials, telnet: bool = False, prefer: Optional[str] = None
    ) -> Tuple[Optional[str], str]:
        """
        Fast prioritized probe testing the top enterprise network vendors
        in direct priority (Huawei, Cisco NX-OS, Cisco IOS, Aruba, HP Comware, Juniper, Raisecom, MikroTik)
        without looping 40+ vendors; `prefer` moves one vendor to the front. The output is
        matched against every vendor, so a Raisecom answering the Cisco driver's
        'show version' is named right away. With telnet=True the telnet drivers are used (and
        the vendors without one skipped). Returns (None, _ALL_LOGINS_REJECTED) when every
        attempt failed on the login itself, so the caller can tell bad credentials apart.
        """
        from netmiko.exceptions import NetmikoAuthenticationException
        from app.services.netmiko_service import open_connection
        from netmiko.ssh_dispatcher import platforms

        # Priority test sequence: (vendor_driver, probe_command). The output decides the
        # vendor, not the driver that logged in: Cisco and Raisecom drivers log in to each other
        test_profiles = [
            ("huawei", "display version"),
            ("cisco_nxos", "show version"),
            ("cisco_ios", "show version"),
            ("aruba_os", "show version"),
            ("hp_comware", "display version"),
            ("juniper_junos", "show version"),
            ("raisecom_roap", "show version"),
            ("mikrotik_routeros", "/system resource print"),
        ]
        if prefer:
            test_profiles.sort(key=lambda p: p[0] != prefer)
        if telnet:
            test_profiles = [
                (cls.telnet_driver(v), cmd) for v, cmd in test_profiles
                if cls.telnet_driver(v).endswith("_telnet") and cls.telnet_driver(v) in platforms
            ]

        attempts = rejected = 0
        for vendor, cmd in test_profiles:
            params = {
                "device_type": vendor,
                "host": device.host,
                "port": device.port or (23 if telnet else 22),
                "username": device.username or "",
                "password": device.password or "",
                "timeout": 5,
                "fast_cli": False,
            }
            if device.secret:
                params["secret"] = device.secret

            attempts += 1
            try:
                with open_connection(**params) as conn:
                    out = conn.send_command(cmd, read_timeout=4)
                    named = match_version_output(out, getattr(conn, "base_prompt", "") or "")
                    if named:
                        named = cls.telnet_driver(named) if telnet else named
                        if named == vendor:
                            return named, f"Detected {named} via prioritized probe ({cmd})"
                        return named, f"Detected {named} from '{cmd}' output while probing as {vendor}"
            except NetmikoAuthenticationException:
                rejected += 1
                continue
            except Exception:
                continue

        if attempts and rejected == attempts:
            return None, _ALL_LOGINS_REJECTED
        return None, "Prioritized probe inconclusive"
