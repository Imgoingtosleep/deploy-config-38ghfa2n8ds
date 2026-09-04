from typing import List, Optional, Union, Dict
from pydantic import BaseModel, Field

class PlaybookCommand(BaseModel):
    id: Optional[str] = None
    name: str = Field(..., description="CLI Command string")
    huawei: Optional[str] = Field("", description="Command syntax for Huawei VRP (Primary)")
    cisco: Optional[str] = Field("", description="Command syntax for Cisco IOS/IOS-XE")
    juniper: Optional[str] = Field("", description="Command syntax for Juniper JunOS")
    nxos: Optional[str] = Field("", description="Command syntax for Cisco NX-OS")
    aruba: Optional[str] = Field("", description="Command syntax for Aruba OS-CX")
    mikrotik: Optional[str] = Field("", description="Command syntax for MikroTik RouterOS")
    comware: Optional[str] = Field("", description="Command syntax for HP Comware")
    isCustom: Optional[bool] = False

class PlaybookCreate(BaseModel):
    name: str = Field(..., description="Profile title / name")
    description: Optional[str] = Field("", description="Detailed purpose of the profile")
    category: Optional[str] = Field("custom", description="Category tag")
    primary_vendor: Optional[str] = Field("huawei", description="Source vendor for commands (default: huawei)")
    commands: List[Union[str, PlaybookCommand]] = Field(default_factory=list, description="List of CLI commands")
    huawei_commands: Optional[List[str]] = Field(default=None, description="Commands for Huawei devices (Primary)")
    cisco_commands: Optional[List[str]] = Field(default=None, description="Commands for Cisco IOS devices")
    juniper_commands: Optional[List[str]] = Field(default=None, description="Commands for Juniper devices")
    aruba_commands: Optional[List[str]] = Field(default=None, description="Commands for Aruba devices")
    mikrotik_commands: Optional[List[str]] = Field(default=None, description="Commands for MikroTik devices")
    vendor_commands: Optional[Dict[str, List[str]]] = Field(default=None, description="Commands mapped by vendor key")

class PlaybookUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    primary_vendor: Optional[str] = None
    commands: Optional[List[Union[str, PlaybookCommand]]] = None
    huawei_commands: Optional[List[str]] = None
    cisco_commands: Optional[List[str]] = None
    juniper_commands: Optional[List[str]] = None
    aruba_commands: Optional[List[str]] = None
    mikrotik_commands: Optional[List[str]] = None
    vendor_commands: Optional[Dict[str, List[str]]] = None

class PlaybookResponse(BaseModel):
    id: str
    name: str
    description: str
    category: str
    commands: List[PlaybookCommand]
    created_at: str
    updated_at: Optional[str] = None

class AutoTranslateRequest(BaseModel):
    commands: List[str]
    source_vendor: Optional[str] = "huawei"
    target_vendors: Optional[List[str]] = None

class AutoTranslateResponse(BaseModel):
    source_vendor: str
    commands: List[str]
    translations: Dict[str, List[str]]
