from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from app.schemas.device import DeviceCredentials

class SingleCommandRequest(BaseModel):
    device: DeviceCredentials
    command: str = Field(..., description="Single CLI command e.g. 'show ip int brief'")

class MultipleCommandsRequest(BaseModel):
    device: DeviceCredentials
    commands: List[str] = Field(..., description="List of show or exec commands")

class ConfigDeployRequest(BaseModel):
    device: DeviceCredentials
    config_commands: List[str] = Field(..., description="List of configuration lines to deploy")
    save_config: bool = Field(True, description="Save running-config to startup-config after deploy")

class HealthCheckRequest(BaseModel):
    device: DeviceCredentials
    check_type: Optional[str] = Field("standard", description="standard, interfaces, environment, routing, all")

class CommandResponse(BaseModel):
    host: str
    command: str
    output: str
    success: bool
    error: Optional[str] = None
    execution_time_seconds: Optional[float] = None

class MultiCommandResponse(BaseModel):
    host: str
    results: List[CommandResponse]
    success: bool
    overall_time_seconds: Optional[float] = None
    summary: Optional[Dict[str, Any]] = None
