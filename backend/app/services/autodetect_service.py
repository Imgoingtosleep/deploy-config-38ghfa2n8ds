import re
import time
import socket
import http.client
import ssl
import paramiko
from typing import Dict, Any, Optional, Tuple, List
from app.schemas.device import DeviceCredentials
from app.core.config import settings


def clean_ansi(text: str) -> str:
    """Strip VT100/ANSI escape sequences, color codes, and cursor movements from CLI buffers."""
    if not text:
        return ""
    ansi_regex = re.compile(r'\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_regex.sub('', text)


class AutoDetectService:
    """
    Intelligent Multi-Stage Network Device Auto-Detection Service.
    Detects whether an IP is Huawei VRP, Cisco IOS/XE, Aruba, Juniper, etc.
    using:
      Stage 1: Web/HTTP Signature Sniffing (0.05s - ultra fast, zero credentials needed)
      Stage 2: SSH Server Version & Pre-Auth Banner Sniffing (< 1s)
      Stage 3: Interactive Shell with ANSI-Cleaned Prompt Matching (~2s)
      Stage 4: Dual-Vendor Active Command Probing (`display version` vs `show version`)
      Stage 5: Prioritized Fast Fallback Probing
    """
    _cache: Dict[str, str] = {}

    @classmethod
    def get_cached_type(cls, host: str) -> Optional[str]:
        return cls._cache.get(host)

    @classmethod
    def set_cached_type(cls, host: str, device_type: str):
        if host and device_type and device_type not in ["autodetect", "auto"]:
            cls._cache[host] = device_type

    @classmethod
    def clear_cache(cls):
        cls._cache.clear()

    @classmethod
    def detect_device_type(cls, device: DeviceCredentials, timeout: int = 10) -> Tuple[str, str]:
        """
        Detect device type for given credentials.
        Returns: (detected_type, details_reason)
        e.g. ("huawei", "Detected from prompt signature: <Huawei-Core>")
        """
        host = (device.host or "").strip()
        if not host:
            fallback = "huawei" if "huawei" in (settings.DEFAULT_DEVICE_TYPE or "").lower() else "cisco_ios"
            return fallback, "Host not specified; default fallback"

        # Check memory cache first
        if host in cls._cache:
            cached = cls._cache[host]
            return cached, f"Resolved from session cache: {cached}"

        port = device.port or settings.DEFAULT_SSH_PORT or 22
        username = device.username or ""
        password = device.password or ""

        # --- Stage 1: Ultra-Fast Web/HTTP Signature Sniffing (< 0.1s) ---
        # Many enterprise switches (e.g. Huawei EasyOperation, Cisco Web UI) expose HTTP/HTTPS
        try:
            detected_web, reason_web = cls._probe_via_web(host, timeout=0.8)
            if detected_web:
                cls._cache[host] = detected_web
                return detected_web, reason_web
        except Exception:
            pass

        # --- Stage 2: Pre-Auth Raw SSH Greeting Banner (< 0.1s, Zero Credentials Needed) ---
        try:
            detected_raw, reason_raw = cls._probe_raw_ssh_banner(host, port=port, timeout=0.8)
            if detected_raw:
                cls._cache[host] = detected_raw
                return detected_raw, reason_raw
        except Exception:
            pass

        # --- Stage 3 & 4: Authenticated SSH Banner, Prompt Signature & Command Probe ---
        from app.services.netmiko_service import NetmikoService
        candidates = NetmikoService._resolve_credential_candidates(device)

        is_unreachable = False
        is_auth_failure = False
        err_reason = ""

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
                    cls._cache[host] = detected_ssh
                    return detected_ssh, f"{reason_ssh} (via user: {c_user})"
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
                if "auth" in err_str or "channel" in err_str:
                    is_auth_failure = True
                    err_reason = f"Authentication or channel failed for {c_user}@{host}: {str(ssh_err)}"
                    if c_idx < len(candidates):
                        continue
                elif "timed out" in err_str or "refused" in err_str or "unreachable" in err_str or "no route" in err_str:
                    is_unreachable = True
                    err_reason = f"Connection failed on port {port}: {str(ssh_err)}"
                    break
                else:
                    err_reason = f"SSH Protocol error: {str(ssh_err)}"
            except Exception as e:
                err_reason = f"SSH Probe error: {str(e)}"

        # If device is unreachable, return immediately with reason
        if is_unreachable:
            fallback = "huawei" if "huawei" in (settings.DEFAULT_DEVICE_TYPE or "").lower() else "cisco_ios"
            return fallback, err_reason

        # --- Stage 4: Prioritized Fast Prober (If not auth failure and credentials exist) ---
        if not is_auth_failure and any(c.get("username") for c in candidates):
            for c in candidates:
                if not c.get("username"):
                    continue
                try:
                    probe_dev = device.copy()
                    probe_dev.username = c["username"]
                    probe_dev.password = c["password"]
                    detected_fast, reason_fast = cls._probe_prioritized_cli(probe_dev)
                    if detected_fast:
                        device.username = c["username"]
                        cls._cache[host] = detected_fast
                        return detected_fast, f"{reason_fast} (via user: {c['username']})"
                except Exception:
                    pass

        # --- Stage 5: Fallback with clear explanation ---
        fallback = "huawei" if "huawei" in (settings.DEFAULT_DEVICE_TYPE or "").lower() else "cisco_ios"
        if is_auth_failure:
            return fallback, f"Authentication Failed (Defaulting to {fallback}): {err_reason}"
        
        return fallback, f"Unable to determine vendor with certainty; default fallback: {fallback}"

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
            if re.search(r"cisco", b_lower):
                return "cisco_ios", f"Detected Cisco from pre-auth SSH greeting: {banner}"
            if re.search(r"aruba|procurve", b_lower):
                return "aruba_os", f"Detected Aruba from pre-auth SSH greeting: {banner}"
            if re.search(r"juniper|junos", b_lower):
                return "juniper_junos", f"Detected Juniper JunOS from pre-auth SSH greeting: {banner}"
            if re.search(r"mikrotik|routeros", b_lower):
                return "mikrotik_routeros", f"Detected MikroTik from pre-auth SSH greeting: {banner}"
        except Exception:
            pass
        finally:
            try:
                s.close()
            except Exception:
                pass
        return None, ""

    @classmethod
    def _probe_via_ssh(cls, host: str, port: int, username: str, password: str, timeout: int) -> Tuple[Optional[str], str]:
        """Probe device by opening SSH session and inspecting pre-auth / post-auth output and prompt"""
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

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

            # 1. Check SSH transport banner
            transport = client.get_transport()
            if transport:
                remote_ver = (transport.remote_version or "").lower()
                if re.search(r"huawei|vrp|quidway", remote_ver):
                    client.close()
                    return "huawei", f"Detected from SSH server version: {remote_ver}"
                if re.search(r"cisco", remote_ver):
                    client.close()
                    return "cisco_ios", f"Detected from SSH server version: {remote_ver}"
                if re.search(r"aruba|procurve", remote_ver):
                    client.close()
                    return "aruba_os", f"Detected from SSH server version: {remote_ver}"
                if re.search(r"junos|juniper", remote_ver):
                    client.close()
                    return "juniper_junos", f"Detected from SSH server version: {remote_ver}"
                if re.search(r"mikrotik|routeros", remote_ver):
                    client.close()
                    return "mikrotik_routeros", f"Detected from SSH server version: {remote_ver}"

            # 2. Open interactive shell channel to read welcome banners and prompt
            channel = client.invoke_shell(term="vt100", width=120, height=40)
            channel.settimeout(4.0)

            # Read initial buffer (Welcome banners)
            time.sleep(1.0)
            initial_buffer = ""
            while channel.recv_ready():
                initial_buffer += channel.recv(4096).decode("utf-8", errors="ignore")

            initial_cleaned = clean_ansi(initial_buffer)

            # Check initial banner text
            if re.search(r"Huawei Versatile Routing Platform|VRP \(R\) Software|Huawei Technologies|Quidway|CloudEngine", initial_cleaned, re.I):
                client.close()
                return "huawei", "Detected from Huawei VRP login banner"
            if re.search(r"Cisco IOS Software|Cisco Nexus|IOS-XE|Cisco Systems", initial_cleaned, re.I):
                client.close()
                return "cisco_ios", "Detected from Cisco IOS login banner"
            if re.search(r"H3C Comware|HPE Comware", initial_cleaned, re.I):
                client.close()
                return "hp_comware", "Detected from H3C Comware login banner"
            if re.search(r"ArubaOS|ProCurve", initial_cleaned, re.I):
                client.close()
                return "aruba_os", "Detected from Aruba OS login banner"
            if re.search(r"JUNOS", initial_cleaned, re.I):
                client.close()
                return "juniper_junos", "Detected from Juniper JunOS login banner"
            if re.search(r"MikroTik|RouterOS", initial_cleaned, re.I):
                client.close()
                return "mikrotik_routeros", "Detected from MikroTik RouterOS login banner"

            # 3. Wake up prompt by sending newline
            channel.send("\r\n")
            time.sleep(0.8)
            prompt_buffer = ""
            while channel.recv_ready():
                prompt_buffer += channel.recv(4096).decode("utf-8", errors="ignore")

            combined = initial_cleaned + "\n" + clean_ansi(prompt_buffer)
            lines = [line.strip() for line in combined.splitlines() if line.strip()]
            last_line = lines[-1] if lines else ""

            # Check Huawei Prompt Signature: <Hostname> or [Hostname]
            if re.search(r"^<[^>]+>$", last_line) or re.search(r"^\[[^\]]+\]$", last_line):
                client.close()
                return "huawei", f"Detected Huawei VRP from prompt signature: {last_line}"

            # Check Juniper Prompt Signature: user@host> or user@host#
            if re.search(r"[\w\.\-]+@[\w\.\-]+[>#%]", last_line):
                client.close()
                return "juniper_junos", f"Detected Juniper JunOS from prompt signature: {last_line}"

            # Check MikroTik Prompt Signature: [admin@MikroTik] >
            if re.search(r"\[.*@.*\]\s*>", last_line):
                client.close()
                return "mikrotik_routeros", f"Detected MikroTik RouterOS from prompt signature: {last_line}"

            # Check Linux Prompt Signature: user@host:~$ or root@host:~#
            if re.search(r"[\w\.\-]+@[\w\.\-]+:[~\w\.\-\/]+[#$]", last_line):
                client.close()
                return "linux", f"Detected Linux from prompt signature: {last_line}"

            # 4. If prompt looks like Cisco / Generic (`>` or `#`), run Dual Active Command Probing
            if re.search(r"^[\w\.\-\(\)\/]+[>#]$", last_line):
                # Probe 1: Send Huawei command `display version`
                channel.send("display version\r\n")
                time.sleep(1.0)
                cmd_out1 = ""
                while channel.recv_ready():
                    cmd_out1 += channel.recv(4096).decode("utf-8", errors="ignore")
                
                cmd_cleaned1 = clean_ansi(cmd_out1)
                if re.search(r"Huawei|VRP|CloudEngine|Quidway", cmd_cleaned1, re.I):
                    client.close()
                    return "huawei", "Confirmed Huawei VRP via 'display version' probe"
                elif re.search(r"H3C|Comware", cmd_cleaned1, re.I):
                    client.close()
                    return "hp_comware", "Confirmed HP/H3C Comware via 'display version' probe"

                # Probe 2: Send Cisco command `show version`
                channel.send("show version\r\n")
                time.sleep(1.0)
                cmd_out2 = ""
                while channel.recv_ready():
                    cmd_out2 += channel.recv(4096).decode("utf-8", errors="ignore")
                
                cmd_cleaned2 = clean_ansi(cmd_out2)
                client.close()

                if re.search(r"NX-OS|Nexus", cmd_cleaned2, re.I):
                    return "cisco_nxos", "Confirmed Cisco NX-OS via 'show version' probe"
                elif re.search(r"Cisco|IOS-XE|Cisco IOS", cmd_cleaned2, re.I):
                    return "cisco_ios", "Confirmed Cisco IOS via 'show version' probe"
                elif re.search(r"Aruba|ProCurve", cmd_cleaned2, re.I):
                    return "aruba_os", "Confirmed Aruba/ProCurve via 'show version' probe"
                elif re.search(r"JUNOS|Juniper", cmd_cleaned2, re.I):
                    return "juniper_junos", "Confirmed Juniper JunOS via 'show version' probe"
                elif re.search(r"Huawei|VRP", cmd_cleaned2, re.I):
                    return "huawei", "Detected Huawei VRP from command output"
                else:
                    return "cisco_ios", f"Prompt '{last_line}' matched standard Cisco CLI"

            client.close()
        except Exception as e:
            try:
                client.close()
            except Exception:
                pass
            raise e

        return None, "SSH probe inconclusive"

    @classmethod
    def _probe_prioritized_cli(cls, device: DeviceCredentials) -> Tuple[Optional[str], str]:
        """
        Fast prioritized probe testing the top enterprise network vendors
        in direct priority (Huawei, Cisco IOS, Cisco NX-OS, Aruba, HP Comware, Juniper, MikroTik)
        without looping 40+ vendors.
        """
        from netmiko import ConnectHandler

        # Priority test sequence: (vendor_driver, probe_command, match_pattern)
        test_profiles = [
            ("huawei", "display version", r"Huawei|VRP \(R\)|CloudEngine"),
            ("cisco_nxos", "show version", r"NX-OS|Nexus"),
            ("cisco_ios", "show version", r"Cisco IOS Software|Cisco Systems|IOS-XE"),
            ("aruba_os", "show version", r"ArubaOS|ProCurve"),
            ("hp_comware", "display version", r"H3C|Comware|HPE Comware"),
            ("juniper_junos", "show version", r"JUNOS"),
            ("mikrotik_routeros", "/system resource print", r"RouterOS|MikroTik"),
        ]

        for vendor, cmd, pattern in test_profiles:
            params = {
                "device_type": vendor,
                "host": device.host,
                "port": device.port or 22,
                "username": device.username or "",
                "password": device.password or "",
                "timeout": 5,
                "fast_cli": False,
            }
            if device.secret:
                params["secret"] = device.secret

            try:
                with ConnectHandler(**params) as conn:
                    out = conn.send_command(cmd, read_timeout=4)
                    if re.search(pattern, out, re.I):
                        return vendor, f"Detected {vendor} via prioritized probe ({cmd})"
            except Exception:
                continue

        return None, "Prioritized probe inconclusive"
