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

class BackupConfigRequest(BaseModel):
    device: DeviceCredentials

class AdvancedDeployRequest(BaseModel):
    device: DeviceCredentials
    config_commands: List[str] = Field(..., description="List of configuration lines to deploy")
    save_config: bool = Field(True, description="Save running-config to startup-config after deploy")
    pre_check_commands: Optional[List[str]] = Field(default_factory=list, description="Commands to run prior to deployment")
    post_check_commands: Optional[List[str]] = Field(default_factory=list, description="Commands to run after deployment for verification")
    backup_before_deploy: Optional[bool] = Field(False, description="Backup running configuration prior to deploying changes")

class AdvancedDeployResponse(BaseModel):
    host: str
    command: str
    output: str
    success: bool
    error: Optional[str] = None
    execution_time_seconds: Optional[float] = None
    commands_deployed: List[str] = Field(default_factory=list)
    save_output: Optional[str] = None
    backup_config: Optional[str] = None
    pre_check_results: List[CommandResponse] = Field(default_factory=list)
    post_check_results: List[CommandResponse] = Field(default_factory=list)
    rollback_commands: List[str] = Field(default_factory=list)
    step_logs: List[Dict[str, Any]] = Field(default_factory=list)
