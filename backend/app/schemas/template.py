from typing import List, Optional
from pydantic import BaseModel, Field
from app.schemas.device import DeviceCredentials

class CommandTemplate(BaseModel):
    id: Optional[str] = None
    name: str = Field(..., description="Template title e.g. 'Huawei Port Check'")
    vendor: str = Field("huawei", description="huawei, cisco_ios, or all")
    description: Optional[str] = Field("", description="Purpose of this template")
    author: Optional[str] = Field("Level 2 Engineer", description="Author role")
    created_at: Optional[str] = None
    commands: List[str] = Field(..., description="Ordered list of show/display CLI commands")
    regex: Optional[str] = Field(None, description="Optional regex pattern or filter expression for Lv1 output")

class TemplateCreateRequest(BaseModel):
    name: str
    vendor: Optional[str] = "all"
    description: Optional[str] = ""
    commands: Optional[List[str]] = Field(default_factory=list)
    regex: Optional[str] = None

class TemplateExecuteRequest(BaseModel):
    device: DeviceCredentials
    template_id: Optional[str] = None
    commands: Optional[List[str]] = None
