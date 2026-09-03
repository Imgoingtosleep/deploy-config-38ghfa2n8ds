from fastapi import APIRouter
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from app.schemas.command import (
    ConfigDeployRequest,
    CommandResponse,
    AdvancedDeployRequest,
    AdvancedDeployResponse,
    BackupConfigRequest,
    BatchBackupRequest,
    BatchBackupResponse,
    BatchDeployRequest,
    BatchDeployResponse,
)
from app.schemas.device import DeviceCredentials
from app.services.netmiko_service import NetmikoService

router = APIRouter()

def _execute_single_device_deploy(
    device: DeviceCredentials,
    clean_commands: list,
    save: bool,
    pre_check_commands: list,
    post_check_commands: list,
    backup_before: bool,
) -> AdvancedDeployResponse:
    result = NetmikoService.deploy_config_advanced(
        device=device,
        config_lines=clean_commands,
        save=save,
        pre_check_commands=pre_check_commands,
        post_check_commands=post_check_commands,
        backup_before=backup_before,
    )
    return AdvancedDeployResponse(
        host=result["host"],
        command=result["command"],
        output=result["output"],
        success=result["success"],
        error=result["error"],
        execution_time_seconds=result["execution_time_seconds"],
        commands_deployed=result.get("commands_deployed", []),
        save_output=result.get("save_output"),
        backup_config=result.get("backup_config"),
        pre_check_results=result.get("pre_check_results", []),
        post_check_results=result.get("post_check_results", []),
        rollback_commands=result.get("rollback_commands", []),
        step_logs=result.get("step_logs", []),
    )

@router.post("/push", response_model=CommandResponse)
def deploy_config(request: ConfigDeployRequest):
    """Deploy configuration commands to the switch/router and optionally save to startup-config"""
    # Clean and filter empty lines
    clean_commands = [line.strip() for line in request.config_commands if line.strip() and not line.strip().startswith("!") and not line.strip().startswith("#")]
    
    if not clean_commands:
        return CommandResponse(
            host=request.device.host,
            command="Config deployment",
            output="",
            success=False,
            error="No valid configuration commands provided.",
            execution_time_seconds=0.0,
        )

    result = NetmikoService.deploy_config(
        device=request.device,
        config_lines=clean_commands,
        save=request.save_config,
    )
    
    return CommandResponse(
        host=result["host"],
        command=result["command"],
        output=result["output"],
        success=result["success"],
        error=result["error"],
        execution_time_seconds=result["execution_time_seconds"],
    )

@router.post("/push-advanced", response_model=AdvancedDeployResponse)
def deploy_config_advanced(request: AdvancedDeployRequest):
    """Deploy configuration with pre-checks, backup, save-config, post-checks, and rollback generation"""
    clean_commands = [line.strip() for line in request.config_commands if line.strip() and not line.strip().startswith("!") and not line.strip().startswith("#")]
    
    if not clean_commands:
        return AdvancedDeployResponse(
            host=request.device.host,
            command="Config deployment",
            output="",
            success=False,
            error="No valid configuration commands provided.",
            execution_time_seconds=0.0,
            commands_deployed=[],
            save_output=None,
            backup_config=None,
            pre_check_results=[],
            post_check_results=[],
            rollback_commands=[],
            step_logs=[],
        )

    return _execute_single_device_deploy(
        device=request.device,
        clean_commands=clean_commands,
        save=request.save_config,
        pre_check_commands=request.pre_check_commands or [],
        post_check_commands=request.post_check_commands or [],
        backup_before=request.backup_before_deploy,
    )

@router.post("/push-batch", response_model=BatchDeployResponse)
def deploy_config_batch(request: BatchDeployRequest):
    """Deploy configuration concurrently across multiple devices in fleet with pre/post checks and backups"""
    start_time = time.time()
    devices = request.devices
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
        for line in request.config_commands
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

    max_workers = min(len(devices), 10)
    device_results = [None] * len(devices)

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_index = {
            executor.submit(
                _execute_single_device_deploy,
                dev,
                clean_commands,
                request.save_config,
                request.pre_check_commands or [],
                request.post_check_commands or [],
                request.backup_before_deploy,
            ): i
            for i, dev in enumerate(devices)
        }

        for future in as_completed(future_to_index):
            idx = future_to_index[future]
            try:
                device_results[idx] = future.result()
            except Exception as e:
                dev = devices[idx]
                device_results[idx] = AdvancedDeployResponse(
                    host=dev.host or "Unknown",
                    command="Batch Config Deployment",
                    output="",
                    success=False,
                    error=str(e),
                    execution_time_seconds=0.0,
                    commands_deployed=clean_commands,
                    save_output=None,
                    backup_config=None,
                    pre_check_results=[],
                    post_check_results=[],
                    rollback_commands=[],
                    step_logs=[],
                )

    success_count = sum(1 for r in device_results if r and r.success)
    failed_count = len(devices) - success_count
    elapsed = round(time.time() - start_time, 2)

    return BatchDeployResponse(
        devices_count=len(devices),
        success_count=success_count,
        failed_count=failed_count,
        overall_time_seconds=elapsed,
        results=device_results,
    )

@router.post("/backup", response_model=CommandResponse)
def backup_running_config(request: BackupConfigRequest):
    """Fetch current running configuration from device for backup preview/download"""
    result = NetmikoService.fetch_running_config(request.device)
    return CommandResponse(
        host=result["host"],
        command=result["command"],
        output=result["output"],
        success=result["success"],
        error=result["error"],
        execution_time_seconds=result["execution_time_seconds"],
    )

def _execute_single_device_backup(device: DeviceCredentials) -> CommandResponse:
    result = NetmikoService.fetch_running_config(device)
    return CommandResponse(
        host=result.get("host", device.host or "Unknown"),
        command=result.get("command", "show running-config / display current-configuration"),
        output=result.get("output", ""),
        success=result.get("success", False),
        error=result.get("error"),
        execution_time_seconds=result.get("execution_time_seconds"),
    )

@router.post("/backup-batch", response_model=BatchBackupResponse)
def backup_batch_running_config(request: BatchBackupRequest):
    """Fetch running configuration concurrently across all devices in fleet"""
    start_time = time.time()
    devices = request.devices
    if not devices:
        return BatchBackupResponse(
            devices_count=0,
            success_count=0,
            failed_count=0,
            overall_time_seconds=0.0,
            results=[],
        )

    max_workers = min(len(devices), 10)
    device_results = [None] * len(devices)

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_index = {
            executor.submit(_execute_single_device_backup, dev): i
            for i, dev in enumerate(devices)
        }

        for future in as_completed(future_to_index):
            idx = future_to_index[future]
            try:
                device_results[idx] = future.result()
            except Exception as e:
                dev = devices[idx]
                device_results[idx] = CommandResponse(
                    host=dev.host or "Unknown",
                    command="Backup Running Config",
                    output="",
                    success=False,
                    error=str(e),
                    execution_time_seconds=0.0,
                )

    success_count = sum(1 for r in device_results if r and r.success)
    failed_count = len(devices) - success_count
    elapsed = round(time.time() - start_time, 2)

    return BatchBackupResponse(
        devices_count=len(devices),
        success_count=success_count,
        failed_count=failed_count,
        overall_time_seconds=elapsed,
        results=device_results,
    )
