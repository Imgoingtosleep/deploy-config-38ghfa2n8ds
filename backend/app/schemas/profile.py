from typing import Optional, List
from pydantic import BaseModel, Field

class ProfileCredentialItem(BaseModel):
    priority: int = Field(1, description="Sequential priority attempt order (1, 2, 3...)")
    username: str = Field("", description="SSH/Telnet username")
    password: str = Field("", description="SSH/Telnet password")
    secret: Optional[str] = Field("", description="Enable / Super secret password")
    label: Optional[str] = Field("", description="Optional label (e.g. Primary TACACS, Local Admin, Factory Default)")

class CredentialProfile(BaseModel):
    id: str = Field(..., description="Unique profile identifier")
    name: str = Field(..., description="Profile display name e.g. Huawei Core Pool")
    description: Optional[str] = Field("", description="Optional description or remarks")
    device_type: Optional[str] = Field("autodetect", description="Default device driver e.g. huawei, cisco_ios")
    port: Optional[int] = Field(22, description="Port (Default 22 for SSH, 23 for Telnet)")
    is_default: bool = Field(False, description="Whether this is the default profile")
    credentials: List[ProfileCredentialItem] = Field(
        default_factory=list,
        description="Ordered list of prioritized credentials (Priority 1 -> 2 -> 3)"
    )
    # Backward compatibility fields (synced with Priority 1)
    username: Optional[str] = Field("", description="Primary username")
    password: Optional[str] = Field("", description="Primary password")
    secret: Optional[str] = Field("", description="Primary secret")
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class CredentialProfileCreate(BaseModel):
    name: str = Field(..., description="Profile display name")
    description: Optional[str] = Field("", description="Optional description")
    device_type: Optional[str] = Field("autodetect", description="Default device driver")
    port: Optional[int] = Field(22, description="Port")
    is_default: Optional[bool] = Field(False, description="Whether this is the default profile")
    credentials: Optional[List[ProfileCredentialItem]] = Field(
        None,
        description="List of credentials arranged by priority"
    )
    username: Optional[str] = Field("", description="Primary fallback username")
    password: Optional[str] = Field("", description="Primary fallback password")
    secret: Optional[str] = Field("", description="Primary fallback secret")

class CredentialProfileUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    device_type: Optional[str] = None
    port: Optional[int] = None
    is_default: Optional[bool] = None
    credentials: Optional[List[ProfileCredentialItem]] = None
    username: Optional[str] = None
    password: Optional[str] = None
    secret: Optional[str] = None
