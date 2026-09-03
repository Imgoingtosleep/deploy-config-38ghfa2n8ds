from typing import List, Optional, Union
from pydantic import BaseModel, Field

class PlaybookCommand(BaseModel):
    id: Optional[str] = None
    name: str = Field(..., description="CLI Command string")
    cisco: Optional[str] = Field("", description="Command syntax for Cisco IOS/IOS-XE")
    huawei: Optional[str] = Field("", description="Command syntax for Huawei VRP")
    isCustom: Optional[bool] = False

class PlaybookCreate(BaseModel):
    name: str = Field(..., description="Profile title / name")
    description: Optional[str] = Field("", description="Detailed purpose of the profile")
    category: Optional[str] = Field("custom", description="Category tag")
    commands: List[Union[str, PlaybookCommand]] = Field(default_factory=list, description="List of CLI commands (strings or command objects)")
    cisco_commands: Optional[List[str]] = Field(default=None, description="Full CLI commands specifically for Cisco devices")
    huawei_commands: Optional[List[str]] = Field(default=None, description="Full CLI commands specifically for Huawei devices")

class PlaybookUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    commands: Optional[List[Union[str, PlaybookCommand]]] = None
    cisco_commands: Optional[List[str]] = None
    huawei_commands: Optional[List[str]] = None



class PlaybookResponse(BaseModel):
    id: str
    name: str
    description: str
    category: str
    commands: List[PlaybookCommand]
    created_at: str
    updated_at: Optional[str] = None
