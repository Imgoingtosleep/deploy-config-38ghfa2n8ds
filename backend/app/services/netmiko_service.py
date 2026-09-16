import time
import threading
from contextlib import contextmanager
from typing import List, Dict, Any, Tuple, Optional, Union

# Apply global SSH algorithm compatibility (KEX + public key preferences)
from app.services.ssh_compat import file_lock, device_name_map  # noqa: F401
import paramiko

from netmiko import ConnectHandler
from netmiko.ssh_dispatcher import platforms as NETMIKO_PLATFORMS
from netmiko.exceptions import (
    NetmikoTimeoutException,
    NetmikoAuthenticationException,
    SSHException,
)
from app.schemas.device import DeviceCredentials
from app.core.config import settings

class NetmikoService:
    @staticmethod
    def _resolve_serial_port(port_str: str) -> str:
        if not port_str:
            return "/dev/ttyUSB0"
        import re
        cleaned = port_str.strip()
        # Handle COM3, com3, /dev/COM3, \Device\Serial3
        match = re.search(r"com(\d+)", cleaned, re.IGNORECASE)
        if match:
            com_num = match.group(1)
            return f"/dev/ttyS{com_num}"
        return cleaned

    @staticmethod
    def extract_device_sysname(output_text: str = "", prompt: str = "") -> str:
        """
        Extract switch/router system name (sysname/hostname) from CLI prompt or output.
        """
        import re
        if prompt:
            p = prompt.strip()
            m = re.match(r"^[<\[]([A-Za-z0-9_\-\.]+)[>\]]", p)
            if m:
                return m.group(1).strip()
            m = re.match(r"(?:.*@)?([A-Za-z0-9_\-\.]+)[>#\]]", p)
            if m:
                return m.group(1).strip()
            m = re.match(r"^([A-Za-z0-9_\-\.]+)(?:\([^\)]+\))?[#>]", p)
            if m:
                return m.group(1).strip()

        if not output_text:
            return ""

        cfg_match = re.search(r"^\s*(?:sysname|hostname|host-name)\s+[\"']?([A-Za-z0-9_\-\.]+)[\"']?", output_text, re.MULTILINE | re.IGNORECASE)
        if cfg_match:
            cand = cfg_match.group(1).strip()
            if cand.lower() not in ["none", "default", "null"]:
                return cand

        hw_match = re.search(r"^[<\[]([A-Za-z0-9_\-\.]+)[>\]]", output_text, re.MULTILINE)
        if hw_match:
            return hw_match.group(1).strip()

        cisco_match = re.search(r"^([A-Za-z0-9_\-\.]+)(?:\([^\)]+\))?[#>]", output_text, re.MULTILINE)
        if cisco_match:
            cand = cisco_match.group(1).strip()
            if cand.lower() not in ["error", "invalid", "info", "warning", "note"]:
                return cand

        return ""

    @classmethod
    def _build_netmiko_dict(cls, device: DeviceCredentials) -> Dict[str, Any]:
        if device.connection_mode == "serial":
            dev_type = "cisco_ios_serial"
            if device.device_type == "furukawa_fitelnet_serial":
                dev_type = "furukawa_fitelnet_serial"

            resolved_port = cls._resolve_serial_port(device.serial_port)

            device_dict: Dict[str, Any] = {
                "device_type": dev_type,
                "serial_settings": {
                    "port": resolved_port,
                    "baudrate": device.baud_rate or 9600,
                    "bytesize": 8,
                    "parity": "N",
                    "stopbits": 1,
                },
                "timeout": settings.DEFAULT_TIMEOUT,
                "global_delay_factor": settings.GLOBAL_DELAY_FACTOR,
                "fast_cli": False,
            }
        else:
            is_telnet = "telnet" in (device.device_type or "").lower()
            default_port = 23 if is_telnet else settings.DEFAULT_SSH_PORT
            port = device.port if device.port and device.port > 0 else default_port

            raw_type = (device.device_type or "").lower().strip()
            if not raw_type or raw_type in ["autodetect", "auto"]:
                try:
                    from app.services.autodetect_service import AutoDetectService
                    detected_type, _ = AutoDetectService.detect_device_type(device)
                    device.device_type = detected_type
                    raw_type = detected_type
                except Exception:
                    raw_type = "huawei" if "huawei" in (settings.DEFAULT_DEVICE_TYPE or "").lower() else "cisco_ios"

            if raw_type not in NETMIKO_PLATFORMS:
                dev_type = "cisco_ios_telnet" if is_telnet else "cisco_ios"
            else:
                dev_type = raw_type

            device_dict = {
                "device_type": dev_type,
                "host": device.host or "127.0.0.1",
                "port": port,
                "timeout": settings.DEFAULT_TIMEOUT,
                "global_delay_factor": settings.GLOBAL_DELAY_FACTOR,
            }

        if device.username:
            device_dict["username"] = device.username
        if device.password:
            device_dict["password"] = device.password
        if device.secret:
            device_dict["secret"] = device.secret
            
        return device_dict

    @staticmethod
    def _prepare_session(net_connect, device: DeviceCredentials):
        """Prepare session: wake up serial console, enter enable mode, and ensure paging is disabled"""
        if device.connection_mode == "serial":
            try:
                net_connect.write_channel("\r\n")
                time.sleep(0.5)
                try:
                    net_connect.disable_paging()
                except Exception:
                    pass
            except Exception:
                pass

        if device.secret:
            try:
                net_connect.enable()
                try:
                    net_connect.disable_paging()
                except Exception:
                    pass
            except Exception:
                pass

    @classmethod
    def _resolve_credential_candidates(cls, device: DeviceCredentials) -> List[Dict[str, Any]]:
        """Resolve ordered list of credential candidates for priority fallback (Priority 1 -> 2 -> 3)"""
        candidates = []
        seen = set()

        # 1. Check if device is linked to a Credential Profile (which contains multi-tier prioritized credentials)
        prof = None
        if device.profile_id:
            try:
                from app.services.profile_service import ProfileService
                prof = ProfileService.get_profile_by_id(device.profile_id)
            except Exception:
                pass
        elif not device.username and not device.password:
            try:
                from app.services.profile_service import ProfileService
                all_p = ProfileService.get_profiles()
                prof = next((p for p in all_p if p.get("is_default")), (all_p[0] if all_p else None))
            except Exception:
                pass

        if prof and prof.get("credentials"):
            sorted_creds = sorted(prof["credentials"], key=lambda x: int(x.get("priority", 999)))
            for c in sorted_creds:
                u = (c.get("username") or "").strip()
                p = c.get("password") or ""
                # Driver is part of the key: the same user/password on a Huawei profile and a
                # Cisco profile are two distinct attempts, not a duplicate
                key = (u, p, prof.get("device_type") or device.device_type)
                if key not in seen and (u or p):
                    lbl = c.get("label") or f"Priority {c.get('priority', len(candidates) + 1)}"
                    candidates.append({
                        "name": f"{prof.get('name', 'Profile')} - {lbl}",
                        "username": u,
                        "password": p,
                        "secret": c.get("secret") or "",
                        "device_type": prof.get("device_type") or device.device_type,
                        "port": prof.get("port") or device.port,
                    })
                    seen.add(key)

        # 2. Directly supplied credential_pool dicts (explicit multi-priority pool)
        if device.credential_pool:
            sorted_pool = sorted(device.credential_pool, key=lambda x: int(x.get("priority", 999)))
            for idx, c in enumerate(sorted_pool, start=len(candidates) + 1):
                u = (c.get("username") or "").strip()
                p = c.get("password") or ""
                key = (u, p, c.get("device_type") or device.device_type)
                if key not in seen and (u or p):
                    lbl = c.get("label") or c.get("name") or f"Priority {c.get('priority', idx)}"
                    candidates.append({
                        "name": lbl,
                        "username": u,
                        "password": p,
                        "secret": c.get("secret") or "",
                        "device_type": c.get("device_type") or device.device_type,
                        "port": c.get("port") or device.port,
                    })
                    seen.add(key)

        # 3. Direct device fields (if not already captured from profile or pool)
        if device.username or device.password:
            key = (device.username or "", device.password or "", device.device_type or "autodetect")
            if key not in seen:
                label = device.active_credential_name or f"Direct Device Credentials"
                # If candidates already had items from profile, this serves as extra candidate, or insert at front if no profile
                if not candidates:
                    candidates.append({
                        "name": label,
                        "username": device.username or "",
                        "password": device.password or "",
                        "secret": device.secret or "",
                        "device_type": device.device_type or "autodetect",
                        "port": device.port,
                    })
                    seen.add(key)
                else:
                    candidates.append({
                        "name": label,
                        "username": device.username or "",
                        "password": device.password or "",
                        "secret": device.secret or "",
                        "device_type": device.device_type or "autodetect",
                        "port": device.port,
                    })
                    seen.add(key)

        # 4. Additional Fallback Profile IDs (referenced from ProfileService)
        if device.fallback_profile_ids:
            try:
                from app.services.profile_service import ProfileService
                all_profiles = {prof["id"]: prof for prof in ProfileService.get_profiles()}
                for pid in device.fallback_profile_ids:
                    if pid in all_profiles:
                        prof = all_profiles[pid]
                        # Unpack all prioritized credentials within this profile
                        if prof.get("credentials"):
                            sorted_creds = sorted(prof["credentials"], key=lambda x: int(x.get("priority", 999)))
                            for c in sorted_creds:
                                u = (c.get("username") or "").strip()
                                p = c.get("password") or ""
                                key = (u, p, prof.get("device_type") or device.device_type)
                                if key not in seen and (u or p):
                                    lbl = c.get("label") or f"Priority {c.get('priority', len(candidates) + 1)}"
                                    candidates.append({
                                        "name": f"{prof.get('name', 'Profile')} - {lbl}",
                                        "username": u,
                                        "password": p,
                                        "secret": c.get("secret") or "",
                                        "device_type": prof.get("device_type") or device.device_type,
                                        "port": prof.get("port") or device.port,
                                    })
                                    seen.add(key)
                        else:
                            u = prof.get("username") or ""
                            p = prof.get("password") or ""
                            key = (u, p, prof.get("device_type") or device.device_type)
                            if key not in seen:
                                candidates.append({
                                    "name": prof.get("name") or f"Profile ({u})",
                                    "username": u,
                                    "password": p,
                                    "secret": prof.get("secret") or "",
                                    "device_type": prof.get("device_type") or device.device_type,
                                    "port": prof.get("port") or device.port,
                                })
                                seen.add(key)
            except Exception:
                pass

        # Fallback default if empty
        if not candidates:
            candidates.append({
                "name": "Default Credentials",
                "username": device.username or "",
                "password": device.password or "",
                "secret": device.secret or "",
                "device_type": device.device_type or "autodetect",
                "port": device.port,
            })

        return candidates

    @classmethod
    @contextmanager
    def connect_with_fallback(cls, device: DeviceCredentials):
        """
        Connect to device with Priority-based Multi-Credential Fallback (Priority 1 -> 2 -> 3).
        Cycles through credential sets sequentially until authentication succeeds.
        Yields (net_connect, winning_credential_label, attempt_logs).
        """
        candidates = cls._resolve_credential_candidates(device)
        attempt_logs = []
        target_name = device.serial_port if device.connection_mode == "serial" else (device.host or "127.0.0.1")
        
        last_auth_error = None
        for idx, cred in enumerate(candidates, 1):
            u_name = cred.get("username") or ""
            raw_label = cred.get("name") or f"Priority {idx}"
            if u_name and f"(User: {u_name})" not in raw_label:
                cred_label = f"{raw_label} (User: {u_name})"
            else:
                cred_label = raw_label
            
            attempt_device = device.copy()
            attempt_device.username = cred["username"]
            attempt_device.password = cred["password"]
            attempt_device.secret = cred.get("secret")
            if cred.get("device_type") and cred["device_type"] != "autodetect":
                attempt_device.device_type = cred["device_type"]
            if cred.get("port"):
                attempt_device.port = cred["port"]

            params = cls._build_netmiko_dict(attempt_device)
            net_connect = None
            try:
                net_connect = ConnectHandler(**params)
                cls._prepare_session(net_connect, attempt_device)
                
                # Update device state with working credentials
                device.username = attempt_device.username
                device.password = attempt_device.password
                device.secret = attempt_device.secret
                device.device_type = attempt_device.device_type
                if attempt_device.port:
                    device.port = attempt_device.port
                device.active_credential_name = cred_label
                
                attempt_logs.append(f"Priority {idx} [{cred_label}]: Success")
                try:
                    yield net_connect, cred_label, attempt_logs
                finally:
                    try:
                        net_connect.disconnect()
                    except Exception:
                        pass
                return
            except (NetmikoAuthenticationException, paramiko.ssh_exception.AuthenticationException) as auth_err:
                last_auth_error = auth_err
                attempt_logs.append(f"Priority {idx} [{cred_label}]: Auth Failed")
                if net_connect:
                    try:
                        net_connect.disconnect()
                    except Exception:
                        pass
                if idx < len(candidates):
                    continue
                else:
                    summary = " -> ".join(attempt_logs)
                    raise NetmikoAuthenticationException(
                        f"Authentication failed across all {len(candidates)} credential sets on {target_name}. [{summary}]"
                    )
            except Exception as e:
                if net_connect:
                    try:
                        net_connect.disconnect()
                    except Exception:
                        pass
                err_lower = str(e).lower()
                is_auth_or_channel_issue = (
                    "auth fail" in err_lower
                    or "authentication to device failed" in err_lower
                    or "permission denied" in err_lower
                    or "unable to open channel" in err_lower
                    or "channel" in err_lower
                    or "administratively prohibited" in err_lower
                )
                if is_auth_or_channel_issue:
                    last_auth_error = e
                    attempt_logs.append(f"Priority {idx} [{cred_label}]: Auth/Channel Failed ({str(e)})")
                    if idx < len(candidates):
                        continue
                    else:
                        summary = " -> ".join(attempt_logs)
                        raise NetmikoAuthenticationException(
                            f"Authentication or channel allocation failed across all {len(candidates)} credential sets on {target_name}. [{summary}]"
                        )
                # Wrong driver (e.g. Cisco setup commands sent to a Huawei VRP) fails on the
                # prompt / setup stage, not on auth. Retry when a later priority uses a
                # different driver, so a Huawei-first / Cisco-second pool still connects.
                next_drivers = {c.get("device_type") for c in candidates[idx:]}
                if next_drivers - {cred.get("device_type")}:
                    attempt_logs.append(f"Priority {idx} [{cred_label}]: Failed on driver '{cred.get('device_type')}' ({str(e)})")
                    continue
                raise e

    @classmethod
    def test_connection(cls, device: DeviceCredentials) -> Tuple[bool, str, str, Optional[str], List[str], Optional[str]]:
        """Test SSH or Serial connectivity with priority-based credential fallback"""
        detected_info = ""
        was_auto = (device.device_type or "").lower() in ["autodetect", "auto", ""]
        target_name = device.serial_port if device.connection_mode == "serial" else device.host
        if was_auto and device.device_type:
            detected_info = f" (Auto-Detected: {device.device_type})"

        try:
            with cls.connect_with_fallback(device) as (net_connect, winning_cred, attempt_logs):
                prompt = net_connect.find_prompt()
                winning_user = device.username or None
                prio_note = f" (via {winning_cred})" if winning_cred else ""
                msg = f"Successfully connected to device on {target_name}{detected_info}{prio_note}"
                return True, msg, prompt, winning_cred, attempt_logs, winning_user
        except NetmikoAuthenticationException as e:
            return False, f"Authentication failed: {str(e)}", "", None, [str(e)], None
        except NetmikoTimeoutException as e:
            err_str = str(e)
            if "terminal width 511" in err_str.lower():
                return False, f"Device Type Mismatch on {target_name}: Netmiko attempted Cisco IOS setup command ('terminal width 511') on a non-Cisco device (e.g. Huawei VRP). Please select Huawei VRP or run Auto Detect.", "", None, [err_str], None
            return False, f"Connection timed out on {target_name}: {err_str}", "", None, [err_str], None
        except SSHException as e:
            return False, f"SSH error: {str(e)}", "", None, [str(e)], None
        except Exception as e:
            return False, f"Connection error: {str(e)}", "", None, [str(e)], None

    @classmethod
    def send_command(cls, device: DeviceCredentials, command: str) -> Dict[str, Any]:
        """Execute a single show/exec command with priority credential fallback"""
        start_time = time.time()
        target_name = device.serial_port if device.connection_mode == "serial" else device.host
        try:
            with cls.connect_with_fallback(device) as (net_connect, winning_cred, logs):
                raw_output = net_connect.send_command(command, read_timeout=settings.DEFAULT_TIMEOUT)
                output = cls.clean_cli_output(raw_output)

                detected_sysname = ""
                try:
                    dev_type = (device.device_type or "").lower()
                    sys_cmd = "show running-config | include hostname" if "cisco" in dev_type else "display current-configuration | include sysname"
                    raw_sys = net_connect.send_command(sys_cmd, read_timeout=settings.DEFAULT_TIMEOUT)
                    detected_sysname = cls.extract_device_sysname(raw_sys)
                    if not detected_sysname and "cisco" not in dev_type:
                        raw_cisco = net_connect.send_command("show running-config | include hostname", read_timeout=settings.DEFAULT_TIMEOUT)
                        detected_sysname = cls.extract_device_sysname(raw_cisco)
                except Exception:
                    pass
                if not detected_sysname:
                    try:
                        p = net_connect.find_prompt()
                        detected_sysname = cls.extract_device_sysname(prompt=p)
                    except Exception:
                        pass

                elapsed = round(time.time() - start_time, 2)
                return {
                    "host": target_name,
                    "command": command,
                    "output": output,
                    "sysname_device": detected_sysname,
                    "success": True,
                    "error": None,
                    "execution_time_seconds": elapsed,
                    "authenticated_credential": winning_cred,
                    "authenticated_username": device.username,
                }
        except Exception as e:
            elapsed = round(time.time() - start_time, 2)
            return {
                "host": target_name,
                "command": command,
                "output": "",
                "success": False,
                "error": str(e),
                "execution_time_seconds": elapsed,
                "authenticated_credential": None,
                "authenticated_username": None,
            }

    @classmethod
    def send_multiple_commands(
        cls,
        device: DeviceCredentials,
        commands: List[str],
        command_regexes: Optional[Union[Dict[str, Any], List[Optional[str]]]] = None,
    ) -> Dict[str, Any]:
        """Execute multiple show commands sequentially over a single connection with priority credential fallback and per-command regex"""
        import re
        start_time = time.time()
        results = []
        target_name = device.serial_port if device.connection_mode == "serial" else device.host
        try:
            with cls.connect_with_fallback(device) as (net_connect, winning_cred, logs):
                for cmd_idx, cmd in enumerate(commands):
                    cmd_start = time.time()
                    cmd_regex = None
                    regex_output = None
                    matched_lines = None
                    if command_regexes:
                        raw_pat = None
                        idx_str = str(cmd_idx)
                        if isinstance(command_regexes, (list, tuple)):
                            if cmd_idx < len(command_regexes):
                                raw_pat = command_regexes[cmd_idx]
                        elif isinstance(command_regexes, dict):
                            # Priority 1: Check by exact command index (allows identical commands to have distinct regexes)
                            if idx_str in command_regexes:
                                raw_pat = command_regexes[idx_str]
                            elif cmd_idx in command_regexes:
                                raw_pat = command_regexes[cmd_idx]
                            else:
                                # Priority 2: Fallback to command string only if index is not explicitly defined
                                raw_pat = (
                                    command_regexes.get(cmd)
                                    or command_regexes.get(cmd.strip())
                                    or command_regexes.get(cmd.lower())
                                    or command_regexes.get(cmd.strip().lower())
                                )

                        if raw_pat and str(raw_pat).strip():
                            cmd_regex = str(raw_pat).strip()

                    try:
                        raw_output = net_connect.send_command(cmd, read_timeout=settings.DEFAULT_TIMEOUT)
                        output = cls.clean_cli_output(raw_output)

                        if cmd_regex:
                            try:
                                rx = re.compile(cmd_regex, re.MULTILINE | re.IGNORECASE)
                                lines = output.splitlines()
                                matched = [l for l in lines if rx.search(l)]
                                regex_output = "\n".join(matched)
                                matched_lines = len(matched)
                            except Exception as rx_err:
                                regex_output = f"[Regex Syntax Error: {str(rx_err)}]\n{output}"
                                matched_lines = 0

                        results.append({
                            "index": cmd_idx + 1,
                            "host": target_name,
                            "command": cmd,
                            "output": output,
                            "regex": cmd_regex,
                            "regex_output": regex_output,
                            "matched_lines": matched_lines,
                            "success": True,
                            "error": None,
                            "execution_time_seconds": round(time.time() - cmd_start, 2),
                        })
                    except Exception as cmd_err:
                        results.append({
                            "index": cmd_idx + 1,
                            "host": target_name,
                            "command": cmd,
                            "output": "",
                            "regex": cmd_regex,
                            "regex_output": None,
                            "matched_lines": 0,
                            "success": False,
                            "error": str(cmd_err),
                            "execution_time_seconds": round(time.time() - cmd_start, 2),
                        })
                detected_sysname = ""
                try:
                    dev_type = (device.device_type or "").lower()
                    sys_cmd = "show running-config | include hostname" if "cisco" in dev_type else "display current-configuration | include sysname"
                    raw_sys = net_connect.send_command(sys_cmd, read_timeout=settings.DEFAULT_TIMEOUT)
                    detected_sysname = cls.extract_device_sysname(raw_sys)
                    if not detected_sysname and "cisco" not in dev_type:
                        raw_cisco = net_connect.send_command("show running-config | include hostname", read_timeout=settings.DEFAULT_TIMEOUT)
                        detected_sysname = cls.extract_device_sysname(raw_cisco)
                except Exception:
                    pass
                if not detected_sysname:
                    try:
                        p = net_connect.find_prompt()
                        detected_sysname = cls.extract_device_sysname(prompt=p)
                    except Exception:
                        pass

                elapsed = round(time.time() - start_time, 2)
                is_all_success = all(r.get("success", False) for r in results)
                error_msg = None
                if not is_all_success:
                    failed_items = [
                        f"Command #{r.get('index', '?')} '{r.get('command', '')}' failed: {r.get('error') or 'Execution failed'}"
                        for r in results if not r.get("success")
                    ]
                    error_msg = " | ".join(failed_items) if failed_items else "One or more commands failed"

                return {
                    "host": target_name,
                    "results": results,
                    "sysname_device": detected_sysname,
                    "success": is_all_success,
                    "error": error_msg,
                    "overall_time_seconds": elapsed,
                    "authenticated_credential": winning_cred,
                    "authenticated_username": device.username,
                }
        except Exception as e:
            elapsed = round(time.time() - start_time, 2)
            return {
                "host": target_name,
                "results": results,
                "success": False,
                "error": str(e),
                "overall_time_seconds": elapsed,
                "authenticated_credential": None,
                "authenticated_username": None,
            }

    @staticmethod
    def _get_show_run_cmd(device_type: str) -> str:
        dev_type = (device_type or "").lower()
        if "huawei" in dev_type or "comware" in dev_type:
            return "display current-configuration"
        elif "juniper" in dev_type:
            return "show configuration"
        elif "mikrotik" in dev_type or "routeros" in dev_type:
            return "/export"
        elif "hp" in dev_type or "aruba" in dev_type:
            return "show running-config"
        else:
            return "show running-config"

    @staticmethod
    def mask_sensitive_data(text: str) -> str:
        if not text or not isinstance(text, str):
            return text
        import re
        # Huawei: local-user <user> password (irreversible-cipher|cipher|simple) <pass>
        masked = re.sub(
            r"(local-user\s+\S+\s+password\s+(?:irreversible-cipher|cipher|simple)\s+)(\S+)",
            r"\g<1>*****",
            text,
            flags=re.IGNORECASE,
        )
        # Huawei: local-user <user> password <pass>
        masked = re.sub(
            r"(local-user\s+\S+\s+password\s+)(?!(?:irreversible-cipher|cipher|simple)\b)(\S+)",
            r"\g<1>*****",
            masked,
            flags=re.IGNORECASE,
        )
        # Cisco: username <user> [privilege <num>] (secret|password) [0-9]? <pass>
        masked = re.sub(
            r"(username\s+\S+(?:\s+privilege\s+\d+)?\s+(?:secret|password)(?:\s+\d+)?\s+)(\S+)",
            r"\g<1>*****",
            masked,
            flags=re.IGNORECASE,
        )
        # Enable secret / password: enable (secret|password) [0-9]? <pass>
        masked = re.sub(
            r"(enable\s+(?:secret|password)(?:\s+\d+)?\s+)(\S+)",
            r"\g<1>*****",
            masked,
            flags=re.IGNORECASE,
        )
        # Set authentication password / super password
        masked = re.sub(
            r"((?:set\s+authentication\s+password|super\s+password)(?:\s+level\s+\d+)?(?:\s+(?:cipher|simple))?\s+)(\S+)",
            r"\g<1>*****",
            masked,
            flags=re.IGNORECASE,
        )
        # Standalone password line: password (0|7|cipher|simple)? <pass>
        masked = re.sub(
            r"(^\s*password(?:\s+(?:0|7|cipher|simple))?\s+)(\S+)",
            r"\g<1>*****",
            masked,
            flags=re.IGNORECASE | re.MULTILINE,
        )
        # SNMP community
        masked = re.sub(
            r"(snmp-server\s+community\s+)(\S+)",
            r"\g<1>*****",
            masked,
            flags=re.IGNORECASE,
        )
        masked = re.sub(
            r"(snmp-agent\s+community\s+(?:read|write)(?:\s+(?:cipher|simple))?\s+)(\S+)",
            r"\g<1>*****",
            masked,
            flags=re.IGNORECASE,
        )
        return masked

    @classmethod
    def clean_cli_output(cls, text: str) -> str:
        """
        Clean CLI output across all network vendors:
        1. Remove ANSI VT100/Xterm escape codes (color codes, cursor positions, screen clears)
        2. Remove backspace control characters (\x08)
        3. Strip residual pagination artifacts (--More--, ---- More ----, [More], etc.)
        4. Standardize newlines (\r\r\n / \r\n -> \n)
        5. Mask sensitive passwords and SNMP community strings
        """
        if not text or not isinstance(text, str):
            return text or ""
        import re

        # 1. Strip ANSI escape codes
        cleaned = re.sub(r"\x1b\[[0-9;]*[a-zA-Z]|\x1b[=>]|\x1b\([a-zA-Z]", "", text)

        # 2. Strip backspaces
        cleaned = cleaned.replace("\x08", "")

        # 3. Strip standalone vendor pagination lines
        pager_line_patterns = [
            r"^\s*----?\s*More(?:\s*\([^\)]*\))?\s*----?\s*$",   # Huawei VRP / HP Comware
            r"^\s*--\s*More\s*--\s*$",                           # Cisco IOS / NX-OS
            r"^\s*--\s*MORE\s*--[^\r\n]*$",                      # Aruba / HP ProCurve
            r"^\s*---\(more(?:\s+\d+%)?\s*\)---\s*$",            # Juniper Junos
            r"^\s*\[\s*More\s*\]\s*$",                           # Juniper [More]
            r"^\s*<---\s*More\s*--->\s*$",                       # Extreme / other switches
        ]
        for pat in pager_line_patterns:
            cleaned = re.sub(pat, "", cleaned, flags=re.MULTILINE | re.IGNORECASE)

        # Also strip residual inline pager prompts
        cleaned = re.sub(r"----?\s*More(?:\s*\([^\)]*\))?\s*----?", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"--\s*MORE\s*--,\s*next page:[^\r\n]*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"--\s*More\s*--", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"---\(more(?:\s+\d+%)?\s*\)---", "", cleaned, flags=re.IGNORECASE)

        # 4. Standardize newlines and collapse excess empty lines
        cleaned = cleaned.replace("\r\r\n", "\n").replace("\r\n", "\n").replace("\r", "\n")
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)

        # 5. Mask sensitive passwords & secrets
        return cls.mask_sensitive_data(cleaned.strip())

    @staticmethod
    def generate_rollback(config_lines: List[str], device_type: str) -> List[str]:
        dev_type = (device_type or "").lower()
        is_huawei = "huawei" in dev_type
        prefix = "undo " if is_huawei else "no "
        
        rollback = []
        for line in reversed(config_lines):
            trimmed = line.strip()
            if not trimmed or trimmed.startswith("!") or trimmed.startswith("#"):
                continue
            lower = trimmed.lower()
            if lower.startswith("interface ") or lower.startswith("sysname ") or lower.startswith("hostname "):
                continue
            if lower.startswith("undo "):
                rollback.append(trimmed[5:].strip())
            elif lower.startswith("no "):
                rollback.append(trimmed[3:].strip())
            elif lower == "shutdown":
                rollback.append("undo shutdown" if is_huawei else "no shutdown")
            elif lower in ["undo shutdown", "no shutdown"]:
                rollback.append("shutdown")
            else:
                rollback.append(f"{prefix}{trimmed}")
        return rollback

    @classmethod
    def fetch_running_config(cls, device: DeviceCredentials) -> Dict[str, Any]:
        """Fetch running configuration for backup with priority credential fallback"""
        start_time = time.time()
        target_name = device.serial_port if device.connection_mode == "serial" else device.host
        cmd = cls._get_show_run_cmd(device.device_type)
        try:
            with cls.connect_with_fallback(device) as (net_connect, winning_cred, logs):
                raw_output = net_connect.send_command(cmd, read_timeout=settings.DEFAULT_TIMEOUT)
                output = cls.clean_cli_output(raw_output)
                elapsed = round(time.time() - start_time, 2)
                return {
                    "host": target_name,
                    "command": cmd,
                    "output": output,
                    "success": True,
                    "error": None,
                    "execution_time_seconds": elapsed,
                    "authenticated_credential": winning_cred,
                }
        except Exception as e:
            elapsed = round(time.time() - start_time, 2)
            return {
                "host": target_name,
                "command": cmd,
                "output": "",
                "success": False,
                "error": str(e),
                "execution_time_seconds": elapsed,
                "authenticated_credential": None,
            }

    @classmethod
    def deploy_config(cls, device: DeviceCredentials, config_lines: List[str], save: bool = True) -> Dict[str, Any]:
        """Deploy configuration set to the device with priority credential fallback"""
        start_time = time.time()
        target_name = device.serial_port if device.connection_mode == "serial" else device.host
        try:
            with cls.connect_with_fallback(device) as (net_connect, winning_cred, logs):
                output = net_connect.send_config_set(config_lines)
                save_output = ""
                if save:
                    try:
                        save_output = net_connect.save_config()
                    except Exception as se:
                        save_output = f"Config deployed but save failed: {str(se)}"
                
                full_output = f"{output}\n\n[Save Config Status]:\n{save_output}" if save else output
                masked_output = cls.clean_cli_output(full_output)
                elapsed = round(time.time() - start_time, 2)
                return {
                    "host": target_name,
                    "command": f"Config deployment ({len(config_lines)} lines)",
                    "output": masked_output,
                    "success": True,
                    "error": None,
                    "execution_time_seconds": elapsed,
                    "authenticated_credential": winning_cred,
                    "authenticated_username": device.username,
                }
        except Exception as e:
            elapsed = round(time.time() - start_time, 2)
            return {
                "host": target_name,
                "command": f"Config deployment ({len(config_lines)} lines)",
                "output": "",
                "success": False,
                "error": str(e),
                "execution_time_seconds": elapsed,
                "authenticated_credential": None,
                "authenticated_username": None,
            }

    @classmethod
    def deploy_config_advanced(
        cls,
        device: DeviceCredentials,
        config_lines: List[str],
        save: bool = True,
        pre_check_commands: List[str] = None,
        post_check_commands: List[str] = None,
        backup_before: bool = False,
    ) -> Dict[str, Any]:
        """Advanced deployment with pre-check, backup, config deployment, save, post-check, rollback, and priority fallback"""
        start_time = time.time()
        target_name = device.serial_port if device.connection_mode == "serial" else device.host
        pre_check_commands = pre_check_commands or []
        post_check_commands = post_check_commands or []
        
        pre_results = []
        post_results = []
        backup_output = None
        step_logs = []
        
        try:
            with cls.connect_with_fallback(device) as (net_connect, winning_cred, logs):
                # 1. Optional pre-deployment backup
                if backup_before:
                    backup_cmd = cls._get_show_run_cmd(device.device_type)
                    step_logs.append({"step": "backup", "title": f"Fetching Backup ({backup_cmd})", "status": "running"})
                    try:
                        raw_backup = net_connect.send_command(backup_cmd, read_timeout=settings.DEFAULT_TIMEOUT)
                        backup_output = cls.clean_cli_output(raw_backup)
                        step_logs[-1]["status"] = "success"
                    except Exception as be:
                        backup_output = f"Backup failed: {str(be)}"
                        step_logs[-1]["status"] = "failed"
                        step_logs[-1]["error"] = str(be)

                # 2. Pre-check commands
                from app.services.command_translator import CommandTranslator
                for cmd in pre_check_commands:
                    cmd_start = time.time()
                    actual_pre = CommandTranslator.translate_command(cmd, target_vendor=device.device_type)
                    try:
                        raw_pre = net_connect.send_command(actual_pre, read_timeout=settings.DEFAULT_TIMEOUT)
                        out = cls.clean_cli_output(raw_pre)
                        pre_results.append({
                            "host": target_name,
                            "command": actual_pre,
                            "output": out,
                            "success": True,
                            "error": None,
                            "execution_time_seconds": round(time.time() - cmd_start, 2),
                        })
                    except Exception as pe:
                        pre_results.append({
                            "host": target_name,
                            "command": actual_pre,
                            "output": "",
                            "success": False,
                            "error": str(pe),
                            "execution_time_seconds": round(time.time() - cmd_start, 2),
                        })

                # 3. Deploy configuration lines
                step_logs.append({"step": "deploy", "title": f"Pushing {len(config_lines)} Config Commands", "status": "running"})
                deploy_output = net_connect.send_config_set(config_lines)
                step_logs[-1]["status"] = "success"

                # 4. Save to Startup / NVRAM if enabled
                save_output = ""
                if save:
                    step_logs.append({"step": "save", "title": "Saving Config to NVRAM (save/write mem)", "status": "running"})
                    try:
                        save_output = net_connect.save_config()
                        step_logs[-1]["status"] = "success"
                    except Exception as se:
                        save_output = f"Config deployed but save failed: {str(se)}"
                        step_logs[-1]["status"] = "failed"
                        step_logs[-1]["error"] = str(se)

                # 5. Post-check commands
                for cmd in post_check_commands:
                    cmd_start = time.time()
                    actual_post = CommandTranslator.translate_command(cmd, target_vendor=device.device_type)
                    try:
                        raw_post = net_connect.send_command(actual_post, read_timeout=settings.DEFAULT_TIMEOUT)
                        out = cls.clean_cli_output(raw_post)
                        post_results.append({
                            "host": target_name,
                            "command": actual_post,
                            "output": out,
                            "success": True,
                            "error": None,
                            "execution_time_seconds": round(time.time() - cmd_start, 2),
                        })
                    except Exception as pe:
                        post_results.append({
                            "host": target_name,
                            "command": actual_post,
                            "output": "",
                            "success": False,
                            "error": str(pe),
                            "execution_time_seconds": round(time.time() - cmd_start, 2),
                        })

                # 6. Generate rollback commands
                rollback_cmds = cls.generate_rollback(config_lines, device.device_type)

                elapsed = round(time.time() - start_time, 2)
                full_output = f"{deploy_output}\n\n[Save Config Status]:\n{save_output}" if save and save_output else deploy_output
                masked_full_output = cls.clean_cli_output(full_output)

                return {
                    "host": target_name,
                    "command": f"Advanced Config Deployment ({len(config_lines)} commands)",
                    "output": masked_full_output,
                    "success": True,
                    "error": None,
                    "execution_time_seconds": elapsed,
                    "commands_deployed": config_lines,
                    "save_output": save_output if save else None,
                    "backup_config": backup_output,
                    "pre_check_results": pre_results,
                    "post_check_results": post_results,
                    "rollback_commands": rollback_cmds,
                    "step_logs": step_logs,
                    "authenticated_credential": winning_cred,
                    "authenticated_username": device.username,
                }
        except Exception as e:
            elapsed = round(time.time() - start_time, 2)
            rollback_cmds = cls.generate_rollback(config_lines, device.device_type)
            return {
                "host": target_name,
                "command": f"Advanced Config Deployment ({len(config_lines)} commands)",
                "output": "",
                "success": False,
                "error": str(e),
                "execution_time_seconds": elapsed,
                "commands_deployed": config_lines,
                "save_output": None,
                "backup_config": backup_output,
                "pre_check_results": pre_results,
                "post_check_results": post_results,
                "rollback_commands": rollback_cmds,
                "step_logs": step_logs,
                "authenticated_credential": None,
                "authenticated_username": None,
            }
