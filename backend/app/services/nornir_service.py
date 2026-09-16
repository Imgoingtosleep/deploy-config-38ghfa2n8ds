"""
Nornir Service for Enterprise-Scale Multi-Device Concurrent Automation.
Provides dynamic in-memory inventory management and high-concurrency tasks
powered by Nornir 3.x and nornir-netmiko.
"""
import time
import re
import threading
from typing import List, Dict, Any, Optional

# Apply global SSH algorithm compatibility (KEX + public key preferences)
from app.services.ssh_compat import file_lock, device_name_map  # noqa: F401
import paramiko

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
        err_str = str(exc or "").strip()
        err_lower = err_str.lower()
        h_prefix = f"on {host_name}: " if host_name else ""

        if "unable to open channel" in err_lower or "channel closed" in err_lower or "channel request failed" in err_lower or "administratively prohibited" in err_lower:
            return (
                f"SSH Channel Error {h_prefix}Switch rejected SSH session channel (Unable to open channel). "
                f"Common causes: 1) Switch VTY terminal lines are full or hung (check 'display users' / 'show users'), "
                f"2) User account lacks terminal/shell permissions, or 3) Concurrency limit exceeded."
            )
        elif "authentication failed" in err_lower or "auth fail" in err_lower or "bad authentication" in err_lower or "authentication to device failed" in err_lower:
            return (
                f"Authentication Failed {h_prefix}Username, password, or enable secret is incorrect. "
                f"Please verify device credentials or adjust the fallback profile priority order."
            )
        elif "terminal width 511" in err_lower or "pattern not detected: 'terminal width 511'" in err_lower:
            return (
                f"Device Type Mismatch {h_prefix}Netmiko sent Cisco IOS setup command ('terminal width 511') to a non-Cisco switch (e.g. Huawei VRP, HP, Linux). "
                f"Please select the correct Device Type (e.g. Huawei VRP) or run Auto Detect."
            )
        elif "pattern not detected" in err_lower:
            return (
                f"Prompt Detection Timeout {h_prefix}Connected but device CLI prompt was not recognized within timeout. "
                f"Check device_type setting or inspect for unexpected interactive banners/prompts."
            )
        elif "tcp connection to device failed" in err_lower or "timed-out" in err_lower or "timed out" in err_lower or "timeout" in err_lower:
            return (
                f"Connection Timeout {h_prefix}Device did not respond within timeout on port 22/23. "
                f"Common causes: Switch is powered off, IP address unreachable, or firewall/ACL is dropping TCP traffic."
            )
        elif "connection refused" in err_lower:
            return (
                f"Connection Refused {h_prefix}Port 22/23 is closed. "
                f"SSH/Telnet service might be disabled on the switch or blocked by access-list."
            )
        elif "no route to host" in err_lower or "network is unreachable" in err_lower or "unreachable" in err_lower:
            return (
                f"Network Unreachable {h_prefix}No IP route to host from automation server, or gateway dropped packets."
            )
        elif "host unreached" in err_lower:
            return (
                f"Network Unreachable {h_prefix}Host was unreachable or aborted before connection could be established."
            )
        elif "incompatible ssh peer" in err_lower or "kex" in err_lower or "cipher" in err_lower:
            return (
                f"SSH Cipher/Algorithm Mismatch {h_prefix}Switch rejected key exchange ciphers (Legacy switch firmware requires older cipher suite)."
            )
        elif "invalid input" in err_lower or "unrecognized command" in err_lower or "syntax error" in err_lower or "error:" in err_lower:
            return f"CLI Syntax Error {h_prefix}{err_str}"
        elif err_str:
            return f"Execution Error {h_prefix}{err_str}"
        return f"Execution Failed {h_prefix}Connection aborted without returning error output."

    @classmethod
    def resolve_vendor_command(cls, command: str, device_type: str, source_vendor: str = "auto") -> str:
        """Resolve generic, Huawei, or Cisco commands to vendor-specific syntax across major vendors"""
        from app.services.command_translator import CommandTranslator
        cmd = command.strip()
        if not cmd:
            return ""
        return CommandTranslator.translate_command(cmd, source_vendor=source_vendor, target_vendor=device_type)


    @classmethod
    def init_nornir(cls, devices: List[DeviceCredentials], num_workers: int = None) -> Any:
        """Initialize Nornir instance with in-memory dynamic inventory (min 1, max 100 concurrent workers)"""
        if num_workers is None:
            workers_setting = getattr(settings, "DEFAULT_NUM_WORKERS", 10)
        else:
            workers_setting = num_workers
        workers_count = max(1, min(int(workers_setting), 100))
        runner_workers = min(max(len(devices), 1), workers_count)

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

            
            candidates = NetmikoService._resolve_credential_candidates(dev)
            p1_user = candidates[0]["username"] if candidates else (dev.username or "")
            p1_pass = candidates[0]["password"] if candidates else (dev.password or "")
            p1_secret = candidates[0].get("secret") if candidates else (dev.secret or "")

            extras = {
                "timeout": settings.DEFAULT_TIMEOUT,
                "global_delay_factor": settings.GLOBAL_DELAY_FACTOR,
                "fast_cli": False,
            }
            if p1_secret:
                extras["secret"] = p1_secret

            host_dict[host_key] = {
                "hostname": dev.host or "127.0.0.1",
                "port": dev.port or (23 if "telnet" in platform else 22),
                "username": p1_user,
                "password": p1_pass,
                "platform": platform,
                "extras": extras,
                "data": {
                    "original_device": dev,
                    "index": idx,
                    "credential_candidates": candidates,
                }
            }

        nr = InitNornir(
            runner={
                "plugin": "threaded",
                "options": {
                    "num_workers": runner_workers,
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
        num_workers: int = None,
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

        nr = cls.init_nornir(devices, num_workers=num_workers)

        def _nornir_cmd_task(task: Task) -> Dict[str, Any]:
            t_start = time.time()
            dev_type = task.host.platform or "cisco_ios"
            from app.services.command_translator import CommandTranslator
            driver_group = CommandTranslator._normalize_driver_group(dev_type)

            short_aliases = {
                "cisco_ios": "cisco",
                "cisco_nxos": "nxos",
                "juniper_junos": "juniper",
                "aruba_os": "aruba",
                "hp_comware": "comware",
                "mikrotik_routeros": "mikrotik",
                "huawei": "huawei",
            }
            short = short_aliases.get(driver_group, "")

            # Check if specific vendor override was given
            actual_cmd = None
            if vendor_commands:
                actual_cmd = (
                    vendor_commands.get(driver_group)
                    or vendor_commands.get(dev_type)
                    or vendor_commands.get(short)
                )

            if not actual_cmd:
                if huawei_command and driver_group == "huawei":
                    actual_cmd = huawei_command
                elif cisco_command and driver_group == "cisco_ios":
                    actual_cmd = cisco_command
                elif vendor_resolve:
                    actual_cmd = cls.resolve_vendor_command(command, dev_type)
                else:
                    actual_cmd = command or ""

            candidates = task.host.data.get("credential_candidates") or []
            res = None
            for c_idx, cred in enumerate(candidates or [{}], 1):
                if cred:
                    task.host.username = cred.get("username", "")
                    task.host.password = cred.get("password", "")
                    task.host.connection_options["netmiko"].username = cred.get("username", "")
                    task.host.connection_options["netmiko"].password = cred.get("password", "")
                    if cred.get("secret"):
                        task.host.connection_options["netmiko"].extras["secret"] = cred["secret"]
                try:
                    res = task.run(
                        task=netmiko_send_command,
                        command_string=actual_cmd,
                        read_timeout=settings.DEFAULT_TIMEOUT,
                    )
                    break
                except Exception as ce:
                    err_l = str(ce).lower()
                    is_cred_err = (
                        "auth" in err_l
                        or "password" in err_l
                        or "login" in err_l
                        or "permission" in err_l
                        or "unable to open channel" in err_l
                        or "channel" in err_l
                        or "administratively prohibited" in err_l
                    )
                    if is_cred_err and c_idx < len(candidates):
                        try:
                            task.host.close_connection("netmiko")
                        except Exception:
                            pass
                        continue
                    raise ce
            detected_sysname = ""
            try:
                plat_l = (task.host.platform or "").lower()
                sys_cmd = "show running-config | include hostname" if "cisco" in plat_l else "display current-configuration | include sysname"
                sys_res = task.run(
                    task=netmiko_send_command,
                    command_string=sys_cmd,
                    read_timeout=settings.DEFAULT_TIMEOUT,
                )
                detected_sysname = NetmikoService.extract_device_sysname(sys_res.result or "")
                if not detected_sysname and "cisco" not in plat_l:
                    sys_res_c = task.run(
                        task=netmiko_send_command,
                        command_string="show running-config | include hostname",
                        read_timeout=settings.DEFAULT_TIMEOUT,
                    )
                    detected_sysname = NetmikoService.extract_device_sysname(sys_res_c.result or "")
            except Exception:
                pass

            t_elapsed = round(time.time() - t_start, 2)
            masked = NetmikoService.clean_cli_output(res.result or "")
            winning_user = task.host.username or (cred.get("username") if cred else "")
            winning_label = cred.get("name") if cred else None
            return {
                "command": actual_cmd,
                "output": masked,
                "sysname_device": detected_sysname,
                "execution_time_seconds": t_elapsed,
                "authenticated_username": winning_user,
                "authenticated_credential": winning_label,
            }

        agg_result = nr.run(task=_nornir_cmd_task)

        results = [None] * len(devices)
        for host_name, multi_result in agg_result.items():
            host_obj = nr.inventory.hosts[host_name]
            idx = host_obj.data.get("index", 0)
            orig_dev = host_obj.data.get("original_device")
            dev_name = getattr(orig_dev, "name", None) or ""

            if multi_result.failed:
                exc = cls._extract_exception(multi_result)
                results[idx] = CommandResponse(
                    host=host_name,
                    hostname_import=dev_name,
                    sysname_device="",
                    command=command,
                    output="",
                    success=False,
                    error=cls._format_failure_reason(exc, host_name),
                    execution_time_seconds=0.0,
                )
            else:
                task_data = multi_result[0].result
                output_txt = task_data.get("output", "")
                sysname = task_data.get("sysname_device") or NetmikoService.extract_device_sysname(output_txt)
                results[idx] = CommandResponse(
                    host=host_name,
                    hostname_import=dev_name,
                    sysname_device=sysname,
                    command=task_data.get("command", command),
                    output=output_txt,
                    success=True,
                    error=None,
                    execution_time_seconds=task_data.get("execution_time_seconds", 0.0),
                    authenticated_username=task_data.get("authenticated_username"),
                    authenticated_credential=task_data.get("authenticated_credential"),
                )

        # Fill any missing entries safely
        for i, dev in enumerate(devices):
            if results[i] is None:
                results[i] = CommandResponse(
                    host=dev.host or "Unknown",
                    hostname_import=getattr(dev, "name", None) or "",
                    sysname_device="",
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
        num_workers: int = None,
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

        nr = cls.init_nornir(devices, num_workers=num_workers)

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
                    backup_output = NetmikoService.clean_cli_output(b_res.result or "")
                    step_logs[-1]["status"] = "success"
                except Exception as be:
                    backup_output = f"Backup failed: {str(be)}"
                    step_logs[-1]["status"] = "failed"
                    step_logs[-1]["error"] = str(be)

            # 2. Pre-Checks
            for cmd in (pre_check_commands or []):
                cmd_st = time.time()
                actual_pre = cls.resolve_vendor_command(cmd, dev_type)
                try:
                    c_res = task.run(task=netmiko_send_command, command_string=actual_pre, read_timeout=settings.DEFAULT_TIMEOUT)
                    pre_res_list.append(CommandResponse(
                        host=task.host.name,
                        command=actual_pre,
                        output=c_res.result or "",
                        success=True,
                        execution_time_seconds=round(time.time() - cmd_st, 2),
                    ))
                except Exception as pe:
                    pre_res_list.append(CommandResponse(
                        host=task.host.name,
                        command=actual_pre,
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
                actual_post = cls.resolve_vendor_command(cmd, dev_type)
                try:
                    c_res = task.run(task=netmiko_send_command, command_string=actual_post, read_timeout=settings.DEFAULT_TIMEOUT)
                    post_res_list.append(CommandResponse(
                        host=task.host.name,
                        command=actual_post,
                        output=c_res.result or "",
                        success=True,
                        execution_time_seconds=round(time.time() - cmd_st, 2),
                    ))
                except Exception as pe:
                    post_res_list.append(CommandResponse(
                        host=task.host.name,
                        command=actual_post,
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

            # Fetch device sysname via 'display current-configuration | include sysname'
            detected_sysname = ""
            try:
                plat_l = (task.host.platform or "").lower()
                sys_cmd = "show running-config | include hostname" if "cisco" in plat_l else "display current-configuration | include sysname"
                sys_res = task.run(
                    task=netmiko_send_command,
                    command_string=sys_cmd,
                    read_timeout=settings.DEFAULT_TIMEOUT,
                )
                detected_sysname = NetmikoService.extract_device_sysname(sys_res.result or "")
                if not detected_sysname and "cisco" not in plat_l:
                    sys_res_c = task.run(
                        task=netmiko_send_command,
                        command_string="show running-config | include hostname",
                        read_timeout=settings.DEFAULT_TIMEOUT,
                    )
                    detected_sysname = NetmikoService.extract_device_sysname(sys_res_c.result or "")
            except Exception:
                pass

            t_elapsed = round(time.time() - t_start, 2)
            return {
                "deploy_output": NetmikoService.clean_cli_output(full_terminal_output),
                "sysname_device": detected_sysname,
                "save_output": save_output,
                "backup_output": backup_output,
                "pre_check_results": pre_res_list,
                "post_check_results": post_res_list,
                "rollback_commands": rollback_cmds,
                "step_logs": step_logs,
                "execution_time_seconds": t_elapsed,
                "authenticated_username": task.host.username,
            }

        agg_result = nr.run(task=_nornir_deploy_task)

        results = [None] * len(devices)
        for host_name, multi_result in agg_result.items():
            host_obj = nr.inventory.hosts[host_name]
            idx = host_obj.data.get("index", 0)
            orig_dev = host_obj.data.get("original_device")
            dev_name = getattr(orig_dev, "name", None) or ""

            if multi_result.failed:
                exc = cls._extract_exception(multi_result)
                results[idx] = AdvancedDeployResponse(
                    host=host_name,
                    hostname_import=dev_name,
                    sysname_device="",
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
                deploy_out = task_data.get("deploy_output", "")
                sysname = task_data.get("sysname_device") or NetmikoService.extract_device_sysname(deploy_out)
                results[idx] = AdvancedDeployResponse(
                    host=host_name,
                    hostname_import=dev_name,
                    sysname_device=sysname,
                    command=f"Nornir Config Deployment ({len(clean_commands)} lines)",
                    output=deploy_out,
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
                    authenticated_username=task_data.get("authenticated_username") or task.host.username,
                )

        # Fill any missing entries safely
        for i, dev in enumerate(devices):
            if results[i] is None:
                results[i] = AdvancedDeployResponse(
                    host=dev.host or "Unknown",
                    hostname_import=getattr(dev, "name", None) or "",
                    sysname_device="",
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
    def run_batch_backup(cls, devices: List[DeviceCredentials], num_workers: int = None) -> BatchBackupResponse:
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

        nr = cls.init_nornir(devices, num_workers=num_workers)

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
                "output": NetmikoService.clean_cli_output(res.result or ""),
                "execution_time_seconds": t_elapsed,
            }

        agg_result = nr.run(task=_nornir_backup_task)

        results = [None] * len(devices)
        for host_name, multi_result in agg_result.items():
            host_obj = nr.inventory.hosts[host_name]
            idx = host_obj.data.get("index", 0)
            orig_dev = host_obj.data.get("original_device")
            dev_name = getattr(orig_dev, "name", None) or ""

            if multi_result.failed:
                exc = cls._extract_exception(multi_result)
                results[idx] = CommandResponse(
                    host=host_name,
                    hostname_import=dev_name,
                    sysname_device="",
                    command="Backup Running Config",
                    output="",
                    success=False,
                    error=cls._format_failure_reason(exc, host_name),
                    execution_time_seconds=0.0,
                )
            else:
                task_data = multi_result[0].result
                out_txt = task_data.get("output", "")
                sysname = NetmikoService.extract_device_sysname(out_txt)
                results[idx] = CommandResponse(
                    host=host_name,
                    hostname_import=dev_name,
                    sysname_device=sysname,
                    command=task_data.get("command", "show running-config"),
                    output=out_txt,
                    success=True,
                    error=None,
                    execution_time_seconds=task_data.get("execution_time_seconds", 0.0),
                )

        for i, dev in enumerate(devices):
            if results[i] is None:
                results[i] = CommandResponse(
                    host=dev.host or "Unknown",
                    hostname_import=getattr(dev, "name", None) or "",
                    sysname_device="",
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
