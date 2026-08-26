import time
from typing import List, Dict, Any, Tuple
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
            raw_type = device.device_type or "cisco_ios"
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
        params = cls._build_netmiko_dict(device)
        target_name = device.serial_port if device.connection_mode == "serial" else device.host
        try:
            with ConnectHandler(**params) as net_connect:
                cls._prepare_session(net_connect, device)
                prompt = net_connect.find_prompt()
                return True, f"Successfully connected to device on {target_name}", prompt
        except NetmikoAuthenticationException as e:
            return False, f"Authentication failed: {str(e)}", ""
        except NetmikoTimeoutException as e:
            return False, f"Connection timed out on {target_name}: {str(e)}", ""
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
                elapsed = round(time.time() - start_time, 2)
                return {
                    "host": target_name,
                    "command": f"Config deployment ({len(config_lines)} lines)",
                    "output": full_output,
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
