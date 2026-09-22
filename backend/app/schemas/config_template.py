from typing import Optional
from pydantic import BaseModel, Field


class ConfigTemplate(BaseModel):
    id: str
    name: str
    vendor: str = Field(..., description="huawei, cisco_ios, aruba_os or juniper_junos")
    category: str = "My Templates"
    description: str = ""
    config: str = Field(..., description="CLI config lines; {{NAME}} marks a value asked on insert")
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ConfigTemplateCreate(BaseModel):
    name: str
    vendor: str
    category: Optional[str] = ""
    description: Optional[str] = ""
    config: str


class ConfigTemplateUpdate(BaseModel):
    name: Optional[str] = None
    vendor: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    config: Optional[str] = None


class BuiltinHideRequest(BaseModel):
    key: str = Field(..., description="'<vendor>:<title>' of a built-in template")
