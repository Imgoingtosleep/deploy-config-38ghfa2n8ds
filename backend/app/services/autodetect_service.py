import re
import time
import socket
import paramiko
from typing import Dict, Any, Optional, Tuple
from netmiko.ssh_autodetect import SSHDetect
from app.schemas.device import DeviceCredentials
from app.core.config import settings

class AutoDetectService:
    """
    Intelligent Multi-Stage Network Device Auto-Detection Service.
    Detects whether an IP is Huawei VRP, Cisco IOS/XE, Aruba, Juniper, etc.
    using SSH Banner, Prompt Signatures, and Command Probes.
    """
    _cache: Dict[str, str] = {}

    @classmethod
    def get_cached_type(cls, host: str) -> Optional[str]:
        return cls._cache.get(host)

    @classmethod
    def set_cached_type(cls, host: str, device_type: str):
        if host and device_type and device_type != "autodetect":
            cls._cache[host] = device_type

    @classmethod
    def detect_device_type(cls, device: DeviceCredentials, timeout: int = 10) -> Tuple[str, str]:
        """
        Detect device type for given credentials.
        Returns: (detected_type, details_reason)
        e.g. ("huawei", "Detected from prompt signature: <Huawei-Core>")
        """
        host = device.host
        if not host:
            return "cisco_ios", "Host not specified; fallback to default"

        # Check memory cache first
        if host in cls._cache:
            cached = cls._cache[host]
            return cached, f"Resolved from session cache: {cached}"

        port = device.port or 22
        username = device.username or ""
        password = device.password or ""

        # Step 1: Probe via Paramiko SSH (Banner & Prompt Signature)
        is_unreachable = False
        try:
            detected, reason = cls._probe_via_ssh(host, port, username, password, timeout=min(timeout, 4))
            if detected and detected != "autodetect":
                cls._cache[host] = detected
                return detected, reason
        except (socket.timeout, TimeoutError, OSError, paramiko.ssh_exception.SSHException) as net_err:
            err_msg = str(net_err).lower()
            if "timed out" in err_msg or "refused" in err_msg or "unreachable" in err_msg or "no route" in err_msg:
                is_unreachable = True
                fallback = "huawei" if "huawei" in (settings.DEFAULT_DEVICE_TYPE or "").lower() else "cisco_ios"
                return fallback, f"Device unreachable on port {port}: {str(net_err)}"
        except Exception:
            pass

        # Step 2: Fallback to Netmiko SSHDetect
        if not is_unreachable:
            try:
                detected, reason = cls._probe_via_netmiko_detect(device)
                if detected and detected != "autodetect":
                    cls._cache[host] = detected
                    return detected, reason
            except Exception:
                pass

        # Default fallback if detection cannot resolve
        fallback = "huawei" if "huawei" in (settings.DEFAULT_DEVICE_TYPE or "").lower() else "cisco_ios"
        return fallback, f"Unable to determine vendor with certainty; default fallback: {fallback}"


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

            # Check SSH transport banner
            transport = client.get_transport()
            if transport:
                remote_ver = transport.remote_version or ""
                # Some equipment announces in remote_version e.g. SSH-2.0-Huawei
                if re.search(r"huawei|vrp|quidway", remote_ver, re.I):
                    client.close()
                    return "huawei", f"Detected from SSH server version string: {remote_ver}"
                if re.search(r"cisco", remote_ver, re.I):
                    client.close()
                    return "cisco_ios", f"Detected from SSH server version string: {remote_ver}"

            # Open interactive shell channel to read prompt
            channel = client.invoke_shell(term="vt100", width=120, height=40)
            channel.settimeout(5.0)

            # Read initial output (Welcome banners)
            time.sleep(1.0)
            initial_buffer = ""
            while channel.recv_ready():
                initial_buffer += channel.recv(4096).decode("utf-8", errors="ignore")

            # Check initial banner text
            if re.search(r"Huawei Versatile Routing Platform|VRP \(R\) Software|Huawei Technologies|Quidway|CloudEngine", initial_buffer, re.I):
                client.close()
                return "huawei", "Detected from Huawei VRP login banner"
            if re.search(r"Cisco IOS Software|Cisco Nexus|IOS-XE|Cisco Systems", initial_buffer, re.I):
                client.close()
                return "cisco_ios", "Detected from Cisco IOS login banner"
            if re.search(r"H3C Comware|HPE Comware", initial_buffer, re.I):
                client.close()
                return "hp_comware", "Detected from H3C Comware login banner"
            if re.search(r"ArubaOS|ProCurve", initial_buffer, re.I):
                client.close()
                return "aruba_os", "Detected from Aruba OS login banner"
            if re.search(r"JUNOS", initial_buffer, re.I):
                client.close()
                return "juniper_junos", "Detected from Juniper JunOS login banner"

            # Wake up prompt by sending newline
            channel.send("\r\n")
            time.sleep(0.8)
            prompt_buffer = ""
            while channel.recv_ready():
                prompt_buffer += channel.recv(4096).decode("utf-8", errors="ignore")

            combined = initial_buffer + "\n" + prompt_buffer
            lines = [line.strip() for line in combined.splitlines() if line.strip()]
            last_line = lines[-1] if lines else ""

            # Check Huawei Prompt Signature: <Hostname> or [Hostname] (supports interfaces, vlans, etc.)
            if re.search(r"^<[^>]+>$", last_line) or re.search(r"^\[[^\]]+\]$", last_line):
                client.close()
                return "huawei", f"Detected Huawei VRP from prompt signature: {last_line}"

            # Check Juniper Prompt Signature: user@host>
            if re.search(r"[\w\.\-]+@[\w\.\-]+[>#%]", last_line):
                client.close()
                return "juniper_junos", f"Detected Juniper JunOS from prompt signature: {last_line}"

            # Check Cisco Prompt Signature: Hostname> or Hostname# or Hostname(config)#
            if re.search(r"^[\w\.\-\(\)\/]+[>#]$", last_line):
                # Prompt looks like Cisco, send lightweight probe to confirm
                channel.send("show version\r\n")
                time.sleep(1.0)
                cmd_out = ""
                while channel.recv_ready():
                    cmd_out += channel.recv(4096).decode("utf-8", errors="ignore")

                client.close()
                if re.search(r"Cisco|IOS", cmd_out, re.I):
                    return "cisco_ios", "Confirmed Cisco IOS via 'show version' probe"
                elif re.search(r"VRP|Huawei", cmd_out, re.I):
                    return "huawei", "Detected Huawei VRP"
                else:
                    return "cisco_ios", f"Prompt signature '{last_line}' matches standard Cisco CLI"


            client.close()
        except Exception as e:
            try:
                client.close()
            except Exception:
                pass
            raise e

        return None, "SSH probe inconclusive"

    @classmethod
    def _probe_via_netmiko_detect(cls, device: DeviceCredentials) -> Tuple[Optional[str], str]:
        """Fallback to Netmiko SSHDetect engine"""
        netmiko_dict = {
            "device_type": "autodetect",
            "host": device.host,
            "port": device.port or 22,
            "username": device.username or "",
            "password": device.password or "",
            "timeout": 10,
        }
        if device.secret:
            netmiko_dict["secret"] = device.secret

        guesser = SSHDetect(**netmiko_dict)
        best_match = guesser.autodetect()
        if best_match:
            return best_match, f"Detected by Netmiko SSHDetect engine: {best_match}"
        return None, "Netmiko SSHDetect returned no match"
