from typing import Optional
from pydantic import BaseModel, Field

class DeviceCredentials(BaseModel):
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

class DeviceTestResult(BaseModel):
    host: str
    status: str
    connected: bool
    message: str
    device_prompt: Optional[str] = None
