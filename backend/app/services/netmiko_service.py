import time
import threading
import paramiko
from typing import List, Dict, Any, Tuple

# --- SSH Algorithm Compatibility & Global Lock ---
paramiko.Transport._preferred_kex = (
    "diffie-hellman-group14-sha1",
    "diffie-hellman-group1-sha1",
    "diffie-hellman-group-exchange-sha256",
)
paramiko.common.pref_public_keys = ["rsa-sha2-512", "rsa-sha2-256", "rsa"]

file_lock = threading.Lock()
device_name_map = {}

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

    @classmethod
    def _build_netmiko_dict(cls, device: DeviceCredentials) -> Dict[str, Any]:
        if device.connection_mode == "serial":
            # Serial / Console Cable mode
            # Netmiko uses 'cisco_ios_serial' for generic/cisco serial console connections
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
            # Network mode (SSH / Telnet)
            is_telnet = "telnet" in (device.device_type or "").lower()
            default_port = 23 if is_telnet else settings.DEFAULT_SSH_PORT
            port = device.port if device.port and device.port > 0 else default_port

            # Ensure device_type is a valid Netmiko platform
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
                # Fallback to standard cisco_ios or cisco_ios_telnet
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
        """Prepare session: wake up serial console or enter enable mode"""
        if device.connection_mode == "serial":
            try:
                net_connect.write_channel("\r\n")
                time.sleep(0.5)
            except Exception:
                pass

        if device.secret:
            try:
                net_connect.enable()
            except Exception:
                pass

    @classmethod
    def test_connection(cls, device: DeviceCredentials) -> Tuple[bool, str, str]:
        """Test SSH or Serial connectivity and return (is_connected, message, prompt)"""
        detected_info = ""
        was_auto = (device.device_type or "").lower() in ["autodetect", "auto", ""]
        params = cls._build_netmiko_dict(device)
        target_name = device.serial_port if device.connection_mode == "serial" else device.host
        if was_auto and device.device_type:
            detected_info = f" (Auto-Detected: {device.device_type})"

        try:
            with ConnectHandler(**params) as net_connect:
                cls._prepare_session(net_connect, device)
                prompt = net_connect.find_prompt()
                return True, f"Successfully connected to device on {target_name}{detected_info}", prompt
        except NetmikoAuthenticationException as e:
            return False, f"Authentication failed: {str(e)}", ""
        except NetmikoTimeoutException as e:
            err_str = str(e)
            if "terminal width 511" in err_str.lower():
                return False, f"Device Type Mismatch on {target_name}: Netmiko attempted Cisco IOS setup command ('terminal width 511') on a non-Cisco device (e.g. Huawei VRP). Please select Huawei VRP or run Auto Detect.", ""
            return False, f"Connection timed out on {target_name}: {err_str}", ""
        except SSHException as e:
            return False, f"SSH error: {str(e)}", ""
        except Exception as e:
            return False, f"Connection error: {str(e)}", ""


    @classmethod
    def send_command(cls, device: DeviceCredentials, command: str) -> Dict[str, Any]:
        """Execute a single show/exec command"""
        start_time = time.time()
        params = cls._build_netmiko_dict(device)
        target_name = device.serial_port if device.connection_mode == "serial" else device.host
        try:
            with ConnectHandler(**params) as net_connect:
                cls._prepare_session(net_connect, device)
                output = net_connect.send_command(command, read_timeout=settings.DEFAULT_TIMEOUT)
                elapsed = round(time.time() - start_time, 2)
                return {
                    "host": target_name,
                    "command": command,
                    "output": output,
                    "success": True,
                    "error": None,
                    "execution_time_seconds": elapsed,
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
            }

    @classmethod
    def send_multiple_commands(cls, device: DeviceCredentials, commands: List[str]) -> Dict[str, Any]:
        """Execute multiple show commands sequentially over a single connection"""
        start_time = time.time()
        results = []
        params = cls._build_netmiko_dict(device)
        target_name = device.serial_port if device.connection_mode == "serial" else device.host
        try:
            with ConnectHandler(**params) as net_connect:
                cls._prepare_session(net_connect, device)
                for cmd in commands:
                    cmd_start = time.time()
                    try:
                        output = net_connect.send_command(cmd, read_timeout=settings.DEFAULT_TIMEOUT)
                        results.append({
                            "host": target_name,
                            "command": cmd,
                            "output": output,
                            "success": True,
                            "error": None,
                            "execution_time_seconds": round(time.time() - cmd_start, 2),
                        })
                    except Exception as cmd_err:
                        results.append({
                            "host": target_name,
                            "command": cmd,
                            "output": "",
                            "success": False,
                            "error": str(cmd_err),
                            "execution_time_seconds": round(time.time() - cmd_start, 2),
                        })
            elapsed = round(time.time() - start_time, 2)
            return {
                "host": target_name,
                "results": results,
                "success": all(r["success"] for r in results),
                "overall_time_seconds": elapsed,
            }
        except Exception as e:
            elapsed = round(time.time() - start_time, 2)
            return {
                "host": target_name,
                "results": results,
                "success": False,
                "error": str(e),
                "overall_time_seconds": elapsed,
            }

    @staticmethod
    def _get_show_run_cmd(device_type: str) -> str:
        dev_type = (device_type or "").lower()
        if "huawei" in dev_type:
            return "display current-configuration"
        elif "juniper" in dev_type:
            return "show configuration"
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
        """Fetch running configuration for backup"""
        start_time = time.time()
        params = cls._build_netmiko_dict(device)
        target_name = device.serial_port if device.connection_mode == "serial" else device.host
        cmd = cls._get_show_run_cmd(device.device_type)
        try:
            with ConnectHandler(**params) as net_connect:
                cls._prepare_session(net_connect, device)
                output = net_connect.send_command(cmd, read_timeout=settings.DEFAULT_TIMEOUT)
                elapsed = round(time.time() - start_time, 2)
                return {
                    "host": target_name,
                    "command": cmd,
                    "output": output,
                    "success": True,
                    "error": None,
                    "execution_time_seconds": elapsed,
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
            }

    @classmethod
    def deploy_config(cls, device: DeviceCredentials, config_lines: List[str], save: bool = True) -> Dict[str, Any]:
        """Deploy configuration set to the device"""
        start_time = time.time()
        params = cls._build_netmiko_dict(device)
        target_name = device.serial_port if device.connection_mode == "serial" else device.host
        try:
            with ConnectHandler(**params) as net_connect:
                cls._prepare_session(net_connect, device)
                output = net_connect.send_config_set(config_lines)
                save_output = ""
                if save:
                    try:
                        save_output = net_connect.save_config()
                    except Exception as se:
                        save_output = f"Config deployed but save failed: {str(se)}"
                
                full_output = f"{output}\n\n[Save Config Status]:\n{save_output}" if save else output
                masked_output = cls.mask_sensitive_data(full_output)
                elapsed = round(time.time() - start_time, 2)
                return {
                    "host": target_name,
                    "command": f"Config deployment ({len(config_lines)} lines)",
                    "output": masked_output,
                    "success": True,
                    "error": None,
                    "execution_time_seconds": elapsed,
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
        """Advanced deployment with pre-check, backup, config deployment, save, post-check, and rollback generation"""
        start_time = time.time()
        params = cls._build_netmiko_dict(device)
        target_name = device.serial_port if device.connection_mode == "serial" else device.host
        pre_check_commands = pre_check_commands or []
        post_check_commands = post_check_commands or []
        
        pre_results = []
        post_results = []
        backup_output = None
        step_logs = []
        
        try:
            with ConnectHandler(**params) as net_connect:
                cls._prepare_session(net_connect, device)
                
                # 1. Optional pre-deployment backup
                if backup_before:
                    backup_cmd = cls._get_show_run_cmd(device.device_type)
                    step_logs.append({"step": "backup", "title": f"Fetching Backup ({backup_cmd})", "status": "running"})
                    try:
                        backup_output = net_connect.send_command(backup_cmd, read_timeout=settings.DEFAULT_TIMEOUT)
                        step_logs[-1]["status"] = "success"
                    except Exception as be:
                        backup_output = f"Backup failed: {str(be)}"
                        step_logs[-1]["status"] = "failed"
                        step_logs[-1]["error"] = str(be)

                # 2. Pre-check commands
                for cmd in pre_check_commands:
                    cmd_start = time.time()
                    try:
                        out = net_connect.send_command(cmd, read_timeout=settings.DEFAULT_TIMEOUT)
                        pre_results.append({
                            "host": target_name,
                            "command": cmd,
                            "output": out,
                            "success": True,
                            "error": None,
                            "execution_time_seconds": round(time.time() - cmd_start, 2),
                        })
                    except Exception as pe:
                        pre_results.append({
                            "host": target_name,
                            "command": cmd,
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
                    try:
                        out = net_connect.send_command(cmd, read_timeout=settings.DEFAULT_TIMEOUT)
                        post_results.append({
                            "host": target_name,
                            "command": cmd,
                            "output": out,
                            "success": True,
                            "error": None,
                            "execution_time_seconds": round(time.time() - cmd_start, 2),
                        })
                    except Exception as pe:
                        post_results.append({
                            "host": target_name,
                            "command": cmd,
                            "output": "",
                            "success": False,
                            "error": str(pe),
                            "execution_time_seconds": round(time.time() - cmd_start, 2),
                        })

                # 6. Generate rollback commands
                rollback_cmds = cls.generate_rollback(config_lines, device.device_type)

                elapsed = round(time.time() - start_time, 2)
                full_output = f"{deploy_output}\n\n[Save Config Status]:\n{save_output}" if save and save_output else deploy_output
                masked_full_output = cls.mask_sensitive_data(full_output)

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
            }
