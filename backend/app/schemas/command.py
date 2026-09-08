from typing import List, Optional, Dict, Any, Union
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
    vendor_commands: Optional[Dict[str, str]] = Field(default=None, description="Optional vendor-specific command overrides")

class MultipleCommandsRequest(BaseModel):
    device: DeviceCredentials
    commands: List[str] = Field(..., description="List of show or exec commands")

class ConfigDeployRequest(BaseModel):
    device: DeviceCredentials
    config_commands: List[str] = Field(..., description="List of configuration lines to deploy")
    save_config: bool = Field(True, description="Save running-config to startup-config after deploy")

class HealthCheckRequest(BaseModel):
    device: DeviceCredentials
    check_type: Optional[str] = Field("standard", description="standard, interfaces, transceiver, environment, routing, logs, custom")
    commands: Optional[List[str]] = Field(default_factory=list, description="Optional custom list of CLI commands to execute")
    vendor_commands: Optional[Dict[str, List[str]]] = Field(default_factory=dict, description="Optional vendor-specific command overrides")
    suite_name: Optional[str] = Field(None, description="Optional custom test suite/playbook name")

class CommandResponse(BaseModel):
    host: str
    command: str
    output: str
    regex: Optional[str] = None
    regex_output: Optional[str] = None
    matched_lines: Optional[int] = None
    success: bool
    error: Optional[str] = None
    execution_time_seconds: Optional[float] = None
    authenticated_username: Optional[str] = None
    authenticated_credential: Optional[str] = None

class MultiCommandResponse(BaseModel):
    host: str
    device_name: Optional[str] = None
    results: List[CommandResponse]
    success: bool
    error: Optional[str] = None
    overall_time_seconds: Optional[float] = None
    summary: Optional[Dict[str, Any]] = None
    authenticated_username: Optional[str] = None
    authenticated_credential: Optional[str] = None

class BatchHealthCheckRequest(BaseModel):
    devices: List[DeviceCredentials]
    check_type: Optional[str] = Field("standard", description="standard, interfaces, transceiver, environment, routing, logs, custom")
    commands: Optional[List[str]] = Field(default_factory=list, description="Optional custom list of CLI commands to execute across fleet")
    command_regexes: Optional[Union[Dict[str, Any], List[Optional[str]]]] = Field(default_factory=dict, description="Optional regex pattern per command")
    vendor_commands: Optional[Dict[str, List[str]]] = Field(default_factory=dict, description="Optional vendor-specific command lists")
    suite_name: Optional[str] = Field(None, description="Optional custom test suite/playbook name")
    num_workers: Optional[int] = Field(None, ge=10, le=100, description="Nornir concurrent workers count (min 10, max 100)")

class BatchHealthCheckResponse(BaseModel):
    devices_count: int
    success_count: int
    failed_count: int
    overall_time_seconds: float
    results: List[MultiCommandResponse]

class BatchCommandRequest(BaseModel):
    devices: List[DeviceCredentials]
    command: Optional[str] = Field(None, description="Default command to execute across devices")
    commands: Optional[List[str]] = Field(default_factory=list, description="List of commands to execute")
    command_regexes: Optional[Union[Dict[str, Any], List[Optional[str]]]] = Field(default_factory=dict, description="Optional regex pattern per command")
    vendor_commands: Optional[Dict[str, str]] = Field(default_factory=dict, description="Vendor specific commands e.g. {'huawei': 'display ...', 'cisco_ios': 'show ...'}")
    huawei_command: Optional[str] = Field(None, description="Command override for Huawei")
    cisco_command: Optional[str] = Field(None, description="Command override for Cisco")
    num_workers: Optional[int] = Field(None, ge=10, le=100, description="Nornir concurrent workers count (min 10, max 100)")

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
    num_workers: Optional[int] = Field(None, ge=10, le=100, description="Nornir concurrent workers count (min 10, max 100)")

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
    authenticated_username: Optional[str] = None
    authenticated_credential: Optional[str] = None

class BatchDeployRequest(BaseModel):
    devices: List[DeviceCredentials]
    config_commands: List[str] = Field(..., description="List of configuration lines to deploy across fleet")
    save_config: bool = Field(True, description="Save running-config to startup-config after deploy")
    pre_check_commands: Optional[List[str]] = Field(default_factory=list, description="Commands to run prior to deployment")
    post_check_commands: Optional[List[str]] = Field(default_factory=list, description="Commands to run after deployment for verification")
    backup_before_deploy: Optional[bool] = Field(False, description="Backup running configuration prior to deploying changes")
    num_workers: Optional[int] = Field(None, ge=10, le=100, description="Nornir concurrent workers count (min 10, max 100)")

class BatchDeployResponse(BaseModel):
    devices_count: int
    success_count: int
    failed_count: int
    overall_time_seconds: float
    results: List[AdvancedDeployResponse]

class WorkersSettingsResponse(BaseModel):
    num_workers: int = Field(..., description="Current active Nornir concurrent workers")
    min_workers: int = Field(10, description="Minimum allowed Nornir workers")
    max_workers: int = Field(100, description="Maximum allowed Nornir workers")
    default_workers: int = Field(10, description="Default starting Nornir workers")

class WorkersSettingsUpdate(BaseModel):
    num_workers: int = Field(..., ge=10, le=100, description="New Nornir concurrent workers count (min 10, max 100)")
