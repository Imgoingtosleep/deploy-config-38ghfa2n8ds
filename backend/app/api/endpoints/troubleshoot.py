from fastapi import APIRouter
from app.schemas.command import SingleCommandRequest, CommandResponse
from app.services.netmiko_service import NetmikoService

router = APIRouter()

@router.post("/execute-command", response_model=CommandResponse)
def execute_command(request: SingleCommandRequest):
    """Execute any custom show / exec / ping / traceroute command and return raw output"""
    result = NetmikoService.send_command(request.device, request.command)
    return CommandResponse(
        host=result["host"],
        command=result["command"],
        output=result["output"],
        success=result["success"],
        error=result["error"],
        execution_time_seconds=result["execution_time_seconds"],
    )
