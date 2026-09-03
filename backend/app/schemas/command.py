from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from app.schemas.device import DeviceCredentials

class JobSubmitResponse(BaseModel):
    job_id: str
    job_type: str
    status: str
    total_devices: int
    created_at: str
    message: str

class JobStatusResponse(BaseModel):
    job_id: str
    job_type: str
    status: str
    total_devices: int
    completed_devices: int
    success_count: int
    failed_count: int
    progress_percent: float
    elapsed_seconds: float
    is_completed: bool
    error: Optional[str] = None

class JobPaginatedResultsResponse(BaseModel):
    job_id: str
    total_items: int
    page: int
    page_size: int
    total_pages: int
    success_count: int
    failed_count: int
    results: List[Any]

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
    device_name: Optional[str] = None
    results: List[CommandResponse]
    success: bool
    error: Optional[str] = None
    overall_time_seconds: Optional[float] = None
    summary: Optional[Dict[str, Any]] = None

class BatchHealthCheckRequest(BaseModel):
    devices: List[DeviceCredentials]
    check_type: Optional[str] = Field("standard", description="standard, interfaces, environment, routing, logs, all")

class BatchHealthCheckResponse(BaseModel):
    devices_count: int
    success_count: int
    failed_count: int
    overall_time_seconds: float
    results: List[MultiCommandResponse]

class BatchCommandRequest(BaseModel):
    devices: List[DeviceCredentials]
    command: Optional[str] = Field(None, description="Default command to execute across devices")
    vendor_commands: Optional[Dict[str, str]] = Field(default_factory=dict, description="Vendor specific commands e.g. {'huawei': 'display ...', 'cisco_ios': 'show ...'}")
    huawei_command: Optional[str] = Field(None, description="Command override for Huawei")
    cisco_command: Optional[str] = Field(None, description="Command override for Cisco")

class BatchCommandResponse(BaseModel):
    devices_count: int
    success_count: int
    failed_count: int
    overall_time_seconds: float
    results: List[CommandResponse]

class BackupConfigRequest(BaseModel):
    device: DeviceCredentials

class BatchBackupRequest(BaseModel):
    devices: List[DeviceCredentials]

class BatchBackupResponse(BaseModel):
    devices_count: int
    success_count: int
    failed_count: int
    overall_time_seconds: float
    results: List[CommandResponse]

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

class BatchDeployRequest(BaseModel):
    devices: List[DeviceCredentials]
    config_commands: List[str] = Field(..., description="List of configuration lines to deploy across fleet")
    save_config: bool = Field(True, description="Save running-config to startup-config after deploy")
    pre_check_commands: Optional[List[str]] = Field(default_factory=list, description="Commands to run prior to deployment")
    post_check_commands: Optional[List[str]] = Field(default_factory=list, description="Commands to run after deployment for verification")
    backup_before_deploy: Optional[bool] = Field(False, description="Backup running configuration prior to deploying changes")

class BatchDeployResponse(BaseModel):
    devices_count: int
    success_count: int
    failed_count: int
    overall_time_seconds: float
    results: List[AdvancedDeployResponse]
