from fastapi import APIRouter
from app.schemas.command import (
    ConfigDeployRequest,
    CommandResponse,
    AdvancedDeployRequest,
    AdvancedDeployResponse,
    BackupConfigRequest,
)
from app.services.netmiko_service import NetmikoService

router = APIRouter()

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

    result = NetmikoService.deploy_config_advanced(
        device=request.device,
        config_lines=clean_commands,
        save=request.save_config,
        pre_check_commands=request.pre_check_commands,
        post_check_commands=request.post_check_commands,
        backup_before=request.backup_before_deploy,
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
