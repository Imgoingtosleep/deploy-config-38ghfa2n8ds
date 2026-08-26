from fastapi import APIRouter
from app.schemas.command import ConfigDeployRequest, CommandResponse
from app.services.netmiko_service import NetmikoService

router = APIRouter()

@router.post("/push", response_model=CommandResponse)
def deploy_config(request: ConfigDeployRequest):
    """Deploy configuration commands to the switch/router and optionally save to startup-config"""
    # Clean and filter empty lines
    clean_commands = [line.strip() for line in request.config_commands if line.strip() and not line.strip().startswith("!")]
    
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
