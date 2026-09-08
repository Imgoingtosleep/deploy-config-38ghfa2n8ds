from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class DeviceCredentials(BaseModel):
    id: Optional[str] = Field(None, description="Client-side unique device ID")
    name: Optional[str] = Field(None, description="Device friendly name e.g. SW-Huawei")
    profile_id: Optional[str] = Field(None, description="Linked Credential Profile ID")
    # Connection mode: 'network' (SSH/Telnet) or 'serial' (Console Cable)

    connection_mode: str = Field("network", description="'network' or 'serial'")
    
    # Network fields (SSH / Telnet)
    host: Optional[str] = Field("192.168.1.1", description="IP Address or hostname")
    port: Optional[int] = Field(None, description="Port (Default 22 for SSH, 23 for Telnet)")
    
    # Serial / Console fields
    serial_port: Optional[str] = Field("/dev/ttyUSB0", description="Serial port e.g. /dev/ttyUSB0 or COM3")
    baud_rate: Optional[int] = Field(9600, description="Serial baudrate e.g. 9600, 115200")
    
    # Common Credentials
    username: Optional[str] = Field("", description="Username (Optional)")
    password: Optional[str] = Field("", description="Password (Optional)")
    secret: Optional[str] = Field(None, description="Enable / Secret password (if required)")
    device_type: str = Field("huawei", description="Netmiko device type e.g. huawei, cisco_ios")

    # Priority-based Multi-Credential Fallback Pool (Priority 1 -> 2 -> 3)
    credential_pool: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="Ordered list of credential sets to try sequentially: [{username, password, secret, name, device_type}, ...]"
    )
    fallback_profile_ids: Optional[List[str]] = Field(
        None,
        description="Ordered list of Profile IDs to probe: [id_prio1, id_prio2, id_prio3]"
    )
    active_credential_name: Optional[str] = Field(
        None,
        description="Name or indicator of the credential that successfully authenticated"
    )

class DeviceTestResult(BaseModel):
    host: str
    status: str
    connected: bool
    message: str
    device_prompt: Optional[str] = None
    authenticated_credential: Optional[str] = None
    attempt_logs: Optional[List[str]] = None
