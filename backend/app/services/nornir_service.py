"""
Nornir Service for Enterprise-Scale Multi-Device Concurrent Automation.
Provides dynamic in-memory inventory management and high-concurrency tasks
powered by Nornir 3.x and nornir-netmiko.
"""
import time
import re
import threading
import paramiko
from typing import List, Dict, Any, Optional

# --- 1. SSH Algorithm Compatibility & Global Lock ---
paramiko.Transport._preferred_kex = (
    "diffie-hellman-group14-sha1",
    "diffie-hellman-group1-sha1",
    "diffie-hellman-group-exchange-sha256",
)
paramiko.common.pref_public_keys = ["rsa-sha2-512", "rsa-sha2-256", "rsa"]

file_lock = threading.Lock()
device_name_map = {}

from nornir import InitNornir
from nornir.core.inventory import Host, Hosts, Inventory, Defaults, ConnectionOptions
from nornir.core.plugins.inventory import InventoryPluginRegister
from nornir.core.task import Task
from nornir_netmiko.tasks import netmiko_send_command, netmiko_send_config, netmiko_save_config

from app.schemas.device import DeviceCredentials
from app.schemas.command import (
    CommandResponse,
    BatchCommandResponse,
    AdvancedDeployResponse,
    BatchDeployResponse,
    BatchBackupResponse,
)
from app.services.netmiko_service import NetmikoService
from app.core.config import settings

class DynamicDictInventory:
    """In-memory inventory plugin for Nornir to load devices dynamically without writing YAML to disk."""
    def __init__(self, host_dict: Dict[str, Any] = None):
        self.host_dict = host_dict or {}

    def load(self) -> Inventory:
        hosts = Hosts()
        for name, data in self.host_dict.items():
            conn_opts = {
                "netmiko": ConnectionOptions(
                    hostname=data.get("hostname", name),
                    port=data.get("port", 22),
                    username=data.get("username", ""),
                    password=data.get("password", ""),
                    platform=data.get("platform", "cisco_ios"),
                    extras=data.get("extras", {}),
                )
            }
            hosts[name] = Host(
                name=name,
                hostname=data.get("hostname", name),
                port=data.get("port", 22),
                username=data.get("username", ""),
                password=data.get("password", ""),
                platform=data.get("platform", "cisco_ios"),
                data=data.get("data", {}),
                connection_options=conn_opts,
            )
        return Inventory(hosts=hosts, groups={}, defaults=Defaults())

# Register in-memory inventory plugin if not already registered
try:
    InventoryPluginRegister.register("DynamicDictInventory", DynamicDictInventory)
except Exception:
    pass

class NornirService:
    @staticmethod
    def _map_platform(device_type: str) -> str:
        dev_type = (device_type or "cisco_ios").lower().strip()
        if "cisco_nxos" in dev_type or "nxos" in dev_type:
            return "cisco_nxos"
        elif "cisco_ios_telnet" in dev_type or ("cisco" in dev_type and "telnet" in dev_type):
            return "cisco_ios_telnet"
        elif "cisco" in dev_type:
            return "cisco_ios"
        elif "huawei" in dev_type:
            return "huawei_telnet" if "telnet" in dev_type else "huawei"
        elif "hp_comware" in dev_type or "comware" in dev_type:
            return "hp_comware"
        elif "aruba" in dev_type or "procurve" in dev_type:
            return "aruba_os"
        elif "juniper" in dev_type or "junos" in dev_type:
            return "juniper_junos"
        elif "mikrotik" in dev_type or "routeros" in dev_type:
            return "mikrotik_routeros"
        elif "linux" in dev_type:
            return "linux"
        return dev_type

    @staticmethod
    def _get_show_run_cmd(platform: str) -> str:
        dev = (platform or "").lower()
        if "huawei" in dev or "comware" in dev:
            return "display current-configuration"
        elif "juniper" in dev:
            return "show configuration"
        elif "mikrotik" in dev:
            return "/export"
        else:
            return "show running-config"

    @staticmethod
    def _extract_exception(multi_result: Any) -> Any:
        if hasattr(multi_result, "__iter__"):
            for r in multi_result:
                if getattr(r, "exception", None):
                    return r.exception
        return getattr(multi_result, "exception", None) or "Execution failed on device"

    @staticmethod
    def _format_failure_reason(exc: Any, host_name: str = "") -> str:
        """Format detailed human-readable explanation of why a device failed"""
        err_str = str(exc or "")
        err_lower = err_str.lower()
        if "authentication failed" in err_lower or "auth fail" in err_lower or "bad authentication" in err_lower or "authentication to device failed" in err_lower:
            return f"Authentication Failed on {host_name}: Username, password, or enable secret is incorrect."
        elif "terminal width 511" in err_lower or "pattern not detected: 'terminal width 511'" in err_lower:
            return f"Device Type Mismatch on {host_name}: Netmiko attempted Cisco IOS setup command ('terminal width 511') on a non-Cisco switch (e.g. Huawei VRP, HP, Linux). Please select the correct Device Type (e.g. Huawei VRP) or run Auto Detect."
        elif "tcp connection to device failed" in err_lower or "timed-out" in err_lower or "timed out" in err_lower or "timeout" in err_lower:
            return f"Connection Timeout on {host_name}: Device did not respond within timeout (Switch is down, IP unreachable, or firewall is dropping port 22/23)."
        elif "connection refused" in err_lower:
            return f"Connection Refused on {host_name}: Port 22/23 is closed. SSH/Telnet service might be disabled on the switch."
        elif "no route to host" in err_lower or "unreachable" in err_lower:
            return f"Network Unreachable on {host_name}: No IP route to host from automation server."
        elif "incompatible ssh peer" in err_lower or "kex" in err_lower or "cipher" in err_lower:
            return f"SSH Algorithm/Cipher Mismatch on {host_name}: Switch rejected key exchange ciphers."
        elif "invalid input" in err_lower or "unrecognized command" in err_lower or "syntax error" in err_lower or "error:" in err_lower:
            return f"CLI Syntax Error on {host_name}: {err_str}"
        return f"Execution Error on {host_name}: {err_str}"

    @classmethod
    def resolve_vendor_command(cls, command: str, device_type: str) -> str:
        """Resolve generic commands to vendor-specific syntax across major vendors"""
        cmd = command.strip()
        dev_type = (device_type or "").lower()
        is_huawei = "huawei" in dev_type or "comware" in dev_type
        is_juniper = "juniper" in dev_type or "junos" in dev_type
        is_mikrotik = "mikrotik" in dev_type or "routeros" in dev_type

        if is_huawei:
            cisco_to_huawei = {
                "show ip interface brief": "display ip interface brief",
                "show ip int brief": "display ip interface brief",
                "show interfaces brief": "display interface brief",
                "show int brief": "display interface brief",
                "show running-config": "display current-configuration",
                "show run": "display current-configuration",
                "show version": "display version",
                "show ver": "display version",
                "show vlan": "display vlan",
                "show ip route": "display ip routing-table",
                "show mac address-table": "display mac-address",
                "show arp": "display arp",
                "show logging": "display logbuffer",
            }
            return cisco_to_huawei.get(cmd.lower(), cmd)

        if is_juniper:
            cisco_to_juniper = {
                "show ip interface brief": "show interfaces terse",
                "show ip int brief": "show interfaces terse",
                "show interfaces brief": "show interfaces terse",
                "show int brief": "show interfaces terse",
                "show running-config": "show configuration",
                "show run": "show configuration",
                "show version": "show version",
                "show ver": "show version",
                "show ip route": "show route",
                "show arp": "show arp",
                "show logging": "show log messages",
            }
            return cisco_to_juniper.get(cmd.lower(), cmd)

        if is_mikrotik:
            cisco_to_mikrotik = {
                "show ip interface brief": "/ip address print",
                "show ip int brief": "/ip address print",
                "show interfaces brief": "/interface print",
                "show int brief": "/interface print",
                "show running-config": "/export",
                "show run": "/export",
                "show version": "/system resource print",
                "show ver": "/system resource print",
                "show ip route": "/ip route print",
                "show arp": "/ip arp print",
                "show logging": "/log print",
            }
            return cisco_to_mikrotik.get(cmd.lower(), cmd)

        return cmd

    @classmethod
    def init_nornir(cls, devices: List[DeviceCredentials], num_workers: int = None) -> Any:
        """Initialize Nornir instance with in-memory dynamic inventory (up to 100 concurrent workers)"""
        if not num_workers:
            max_workers = getattr(settings, "DEFAULT_NUM_WORKERS", 100)
            num_workers = min(max(len(devices), 1), max_workers)

        host_dict = {}
        for idx, dev in enumerate(devices):
            host_key = dev.host.strip() if dev.host and dev.host.strip() else f"device_{idx+1}"
            raw = (dev.device_type or "").lower().strip()
            if not raw or raw in ["autodetect", "auto"]:
                try:
                    from app.services.autodetect_service import AutoDetectService
                    detected, _ = AutoDetectService.detect_device_type(dev)
                    dev.device_type = detected
                except Exception:
                    dev.device_type = "huawei" if "huawei" in (settings.DEFAULT_DEVICE_TYPE or "").lower() else "cisco_ios"
            platform = cls._map_platform(dev.device_type)

            
            extras = {
                "timeout": settings.DEFAULT_TIMEOUT,
                "global_delay_factor": settings.GLOBAL_DELAY_FACTOR,
                "fast_cli": False,
            }
            if dev.secret:
                extras["secret"] = dev.secret

            host_dict[host_key] = {
                "hostname": dev.host or "127.0.0.1",
                "port": dev.port or (23 if "telnet" in platform else 22),
                "username": dev.username or "",
                "password": dev.password or "",
                "platform": platform,
                "extras": extras,
                "data": {
                    "original_device": dev,
                    "index": idx,
                }
            }

        nr = InitNornir(
            runner={
                "plugin": "threaded",
                "options": {
                    "num_workers": num_workers,
                },
            },
            inventory={
                "plugin": "DynamicDictInventory",
                "options": {
                    "host_dict": host_dict,
                },
            },
        )
        return nr

    @classmethod
    def run_batch_command(
        cls,
        devices: List[DeviceCredentials],
        command: str,
        vendor_resolve: bool = True,
        vendor_commands: Dict[str, str] = None,
        huawei_command: str = None,
        cisco_command: str = None,
    ) -> BatchCommandResponse:
        """Run CLI command across all devices in fleet using Nornir Engine"""
        start_time = time.time()
        if not devices:
            return BatchCommandResponse(
                devices_count=0,
                success_count=0,
                failed_count=0,
                overall_time_seconds=0.0,
                results=[],
            )

        nr = cls.init_nornir(devices)

        def _nornir_cmd_task(task: Task) -> Dict[str, Any]:
            t_start = time.time()
            dev_type = task.host.platform or "cisco_ios"
            vendor = "huawei" if "huawei" in dev_type else "cisco_ios"

            # Check if specific vendor override was given
            if vendor_commands and vendor in vendor_commands and vendor_commands[vendor]:
                actual_cmd = vendor_commands[vendor]
            elif huawei_command and vendor == "huawei":
                actual_cmd = huawei_command
            elif cisco_command and vendor == "cisco_ios":
                actual_cmd = cisco_command
            elif vendor_resolve:
                actual_cmd = cls.resolve_vendor_command(command, dev_type)
            else:
                actual_cmd = command or ""

            res = task.run(
                task=netmiko_send_command,
                command_string=actual_cmd,
                read_timeout=settings.DEFAULT_TIMEOUT,
            )
            t_elapsed = round(time.time() - t_start, 2)
            masked = NetmikoService.mask_sensitive_data(res.result or "")
            return {
                "command": actual_cmd,
                "output": masked,
                "execution_time_seconds": t_elapsed,
            }

        agg_result = nr.run(task=_nornir_cmd_task)

        results = [None] * len(devices)
        for host_name, multi_result in agg_result.items():
            host_obj = nr.inventory.hosts[host_name]
            idx = host_obj.data.get("index", 0)

            if multi_result.failed:
                exc = cls._extract_exception(multi_result)
                results[idx] = CommandResponse(
                    host=host_name,
                    command=command,
                    output="",
                    success=False,
                    error=cls._format_failure_reason(exc, host_name),
                    execution_time_seconds=0.0,
                )
            else:
                task_data = multi_result[0].result
                results[idx] = CommandResponse(
                    host=host_name,
                    command=task_data.get("command", command),
                    output=task_data.get("output", ""),
                    success=True,
                    error=None,
                    execution_time_seconds=task_data.get("execution_time_seconds", 0.0),
                )

        # Fill any missing entries safely
        for i, dev in enumerate(devices):
            if results[i] is None:
                results[i] = CommandResponse(
                    host=dev.host or "Unknown",
                    command=command,
                    output="",
                    success=False,
                    error="Host unreached",
                    execution_time_seconds=0.0,
                )

        success_count = sum(1 for r in results if r and r.success)
        failed_count = len(devices) - success_count
        elapsed = round(time.time() - start_time, 2)

        return BatchCommandResponse(
            devices_count=len(devices),
            success_count=success_count,
            failed_count=failed_count,
            overall_time_seconds=elapsed,
            results=results,
        )

    @classmethod
    def run_batch_deploy(
        cls,
        devices: List[DeviceCredentials],
        config_commands: List[str],
        save_config: bool = True,
        pre_check_commands: List[str] = None,
        post_check_commands: List[str] = None,
        backup_before_deploy: bool = False,
    ) -> BatchDeployResponse:
        """Run advanced configuration deployment across fleet using Nornir Engine"""
        start_time = time.time()
        if not devices:
            return BatchDeployResponse(
                devices_count=0,
                success_count=0,
                failed_count=0,
                overall_time_seconds=0.0,
                results=[],
            )

        clean_commands = [
            line.strip()
            for line in config_commands
            if line.strip() and not line.strip().startswith("!") and not line.strip().startswith("#")
        ]

        if not clean_commands:
            return BatchDeployResponse(
                devices_count=len(devices),
                success_count=0,
                failed_count=len(devices),
                overall_time_seconds=0.0,
                results=[],
            )

        nr = cls.init_nornir(devices)

        def _nornir_deploy_task(task: Task) -> Dict[str, Any]:
            t_start = time.time()
            dev_type = task.host.platform or "cisco_ios"
            backup_output = None
            pre_res_list = []
            post_res_list = []
            step_logs = []

            # 1. Pre-Deployment Backup
            if backup_before_deploy:
                show_run = cls._get_show_run_cmd(dev_type)
                step_logs.append({"step": "backup", "title": f"Fetching Backup ({show_run})", "status": "running"})
                try:
                    b_res = task.run(task=netmiko_send_command, command_string=show_run, read_timeout=settings.DEFAULT_TIMEOUT)
                    backup_output = b_res.result
                    step_logs[-1]["status"] = "success"
                except Exception as be:
                    backup_output = f"Backup failed: {str(be)}"
                    step_logs[-1]["status"] = "failed"
                    step_logs[-1]["error"] = str(be)

            # 2. Pre-Checks
            for cmd in (pre_check_commands or []):
                cmd_st = time.time()
                try:
                    c_res = task.run(task=netmiko_send_command, command_string=cmd, read_timeout=settings.DEFAULT_TIMEOUT)
                    pre_res_list.append(CommandResponse(
                        host=task.host.name,
                        command=cmd,
                        output=c_res.result or "",
                        success=True,
                        execution_time_seconds=round(time.time() - cmd_st, 2),
                    ))
                except Exception as pe:
                    pre_res_list.append(CommandResponse(
                        host=task.host.name,
                        command=cmd,
                        output="",
                        success=False,
                        error=str(pe),
                        execution_time_seconds=round(time.time() - cmd_st, 2),
                    ))

            # 3. Config Deployment Set
            step_logs.append({"step": "deploy", "title": f"Pushing {len(clean_commands)} Config Commands", "status": "running"})
            cfg_res = task.run(task=netmiko_send_config, config_commands=clean_commands, read_timeout=settings.DEFAULT_TIMEOUT)
            deploy_output = cfg_res.result or ""
            step_logs[-1]["status"] = "success"

            # 4. Save to Startup / NVRAM
            save_output = None
            if save_config:
                step_logs.append({"step": "save", "title": "Saving Config to NVRAM", "status": "running"})
                try:
                    s_res = task.run(task=netmiko_save_config)
                    save_output = s_res.result
                    step_logs[-1]["status"] = "success"
                except Exception as se:
                    save_output = f"Save failed: {str(se)}"
                    step_logs[-1]["status"] = "failed"
                    step_logs[-1]["error"] = str(se)

            # 5. Post-Checks
            for cmd in (post_check_commands or []):
                cmd_st = time.time()
                try:
                    c_res = task.run(task=netmiko_send_command, command_string=cmd, read_timeout=settings.DEFAULT_TIMEOUT)
                    post_res_list.append(CommandResponse(
                        host=task.host.name,
                        command=cmd,
                        output=c_res.result or "",
                        success=True,
                        execution_time_seconds=round(time.time() - cmd_st, 2),
                    ))
                except Exception as pe:
                    post_res_list.append(CommandResponse(
                        host=task.host.name,
                        command=cmd,
                        output="",
                        success=False,
                        error=str(pe),
                        execution_time_seconds=round(time.time() - cmd_st, 2),
                    ))

            # 6. Auto-generate rollback
            rollback_cmds = NetmikoService.generate_rollback(clean_commands, dev_type)

            full_terminal_output = deploy_output
            if save_output:
                full_terminal_output += f"\n\n[Save Config Status]:\n{save_output}"

            t_elapsed = round(time.time() - t_start, 2)
            return {
                "deploy_output": NetmikoService.mask_sensitive_data(full_terminal_output),
                "save_output": save_output,
                "backup_output": backup_output,
                "pre_check_results": pre_res_list,
                "post_check_results": post_res_list,
                "rollback_commands": rollback_cmds,
                "step_logs": step_logs,
                "execution_time_seconds": t_elapsed,
            }

        agg_result = nr.run(task=_nornir_deploy_task)

        results = [None] * len(devices)
        for host_name, multi_result in agg_result.items():
            host_obj = nr.inventory.hosts[host_name]
            idx = host_obj.data.get("index", 0)

            if multi_result.failed:
                exc = cls._extract_exception(multi_result)
                results[idx] = AdvancedDeployResponse(
                    host=host_name,
                    command=f"Nornir Config Deployment ({len(clean_commands)} lines)",
                    output="",
                    success=False,
                    error=cls._format_failure_reason(exc, host_name),
                    execution_time_seconds=0.0,
                    commands_deployed=clean_commands,
                    save_output=None,
                    backup_config=None,
                    pre_check_results=[],
                    post_check_results=[],
                    rollback_commands=[],
                    step_logs=[],
                )
            else:
                task_data = multi_result[0].result
                results[idx] = AdvancedDeployResponse(
                    host=host_name,
                    command=f"Nornir Config Deployment ({len(clean_commands)} lines)",
                    output=task_data.get("deploy_output", ""),
                    success=True,
                    error=None,
                    execution_time_seconds=task_data.get("execution_time_seconds", 0.0),
                    commands_deployed=clean_commands,
                    save_output=task_data.get("save_output"),
                    backup_config=task_data.get("backup_output"),
                    pre_check_results=task_data.get("pre_check_results", []),
                    post_check_results=task_data.get("post_check_results", []),
                    rollback_commands=task_data.get("rollback_commands", []),
                    step_logs=task_data.get("step_logs", []),
                )

        # Fill any missing entries safely
        for i, dev in enumerate(devices):
            if results[i] is None:
                results[i] = AdvancedDeployResponse(
                    host=dev.host or "Unknown",
                    command="Nornir Deployment",
                    output="",
                    success=False,
                    error=f"Connection Failure: Host {dev.host} was unreachable or aborted.",
                    execution_time_seconds=0.0,
                    commands_deployed=clean_commands,
                    save_output=None,
                    backup_config=None,
                    pre_check_results=[],
                    post_check_results=[],
                    rollback_commands=[],
                    step_logs=[],
                )

        success_count = sum(1 for r in results if r and r.success)
        failed_count = len(devices) - success_count
        elapsed = round(time.time() - start_time, 2)

        return BatchDeployResponse(
            devices_count=len(devices),
            success_count=success_count,
            failed_count=failed_count,
            overall_time_seconds=elapsed,
            results=results,
        )

    @classmethod
    def run_batch_backup(cls, devices: List[DeviceCredentials]) -> BatchBackupResponse:
        """Pull running-configuration snapshots across fleet using Nornir Engine"""
        start_time = time.time()
        if not devices:
            return BatchBackupResponse(
                devices_count=0,
                success_count=0,
                failed_count=0,
                overall_time_seconds=0.0,
                results=[],
            )

        nr = cls.init_nornir(devices)

        def _nornir_backup_task(task: Task) -> Dict[str, Any]:
            t_start = time.time()
            dev_type = task.host.platform or "cisco_ios"
            cmd = cls._get_show_run_cmd(dev_type)
            res = task.run(
                task=netmiko_send_command,
                command_string=cmd,
                read_timeout=settings.DEFAULT_TIMEOUT,
            )
            t_elapsed = round(time.time() - t_start, 2)
            return {
                "command": cmd,
                "output": res.result or "",
                "execution_time_seconds": t_elapsed,
            }

        agg_result = nr.run(task=_nornir_backup_task)

        results = [None] * len(devices)
        for host_name, multi_result in agg_result.items():
            host_obj = nr.inventory.hosts[host_name]
            idx = host_obj.data.get("index", 0)

            if multi_result.failed:
                exc = cls._extract_exception(multi_result)
                results[idx] = CommandResponse(
                    host=host_name,
                    command="Backup Running Config",
                    output="",
                    success=False,
                    error=cls._format_failure_reason(exc, host_name),
                    execution_time_seconds=0.0,
                )
            else:
                task_data = multi_result[0].result
                results[idx] = CommandResponse(
                    host=host_name,
                    command=task_data.get("command", "show running-config"),
                    output=task_data.get("output", ""),
                    success=True,
                    error=None,
                    execution_time_seconds=task_data.get("execution_time_seconds", 0.0),
                )

        for i, dev in enumerate(devices):
            if results[i] is None:
                results[i] = CommandResponse(
                    host=dev.host or "Unknown",
                    command="Backup Running Config",
                    output="",
                    success=False,
                    error="Host unreached",
                    execution_time_seconds=0.0,
                )

        success_count = sum(1 for r in results if r and r.success)
        failed_count = len(devices) - success_count
        elapsed = round(time.time() - start_time, 2)

        return BatchBackupResponse(
            devices_count=len(devices),
            success_count=success_count,
            failed_count=failed_count,
            overall_time_seconds=elapsed,
            results=results,
        )
