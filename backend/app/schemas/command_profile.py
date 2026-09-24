from typing import Optional, List
from pydantic import BaseModel, Field

# Parsers available for LLDP output. The command set is editable, but the parser
# that reads the output has to be implemented in code, so it is a fixed choice.
PARSERS = ["huawei", "cisco", "raisecom"]


class CommandSet(BaseModel):
    pager_disable: str = Field("", description="Command that turns paging off, e.g. 'screen-length 0 temporary'")
    sysname: str = Field("", description="Command that prints the device sysname / hostname")
    version: str = Field("", description="Command that prints the version banner (used for the model)")
    lldp_brief: str = Field("", description="Command that lists LLDP neighbors")
    lldp_detail: str = Field("", description="Per-interface LLDP detail; '{intf}' is replaced by the local port")
    lldp_full: str = Field("", description="Full LLDP detail for every port, used when per-interface output is missing")


class RegexSet(BaseModel):
    """
    Optional regex per command, applied to that command's output before the parser runs.
    A pattern with a capture group pulls the value out (group 1), one without keeps only the
    matching lines. Matching is case-insensitive and per line (MULTILINE). An empty pattern,
    or one that matches nothing, leaves the built-in parser in charge.
    """
    sysname: str = Field("", description=r"Reads the device name, e.g. ^\s*sysname\s+(\S+)")
    version: str = Field("", description=r"Reads the model from the version output, e.g. (S\d{4}\S*)")
    lldp_brief: str = Field("", description="Keeps only the neighbor rows of the LLDP list")
    lldp_detail: str = Field("", description="Keeps only the wanted lines of the per-port LLDP detail")
    lldp_full: str = Field("", description="Keeps only the wanted lines of the full LLDP detail")


class CommandProfile(BaseModel):
    id: str = Field(..., description="Unique command profile identifier")
    name: str = Field(..., description="Display name e.g. Huawei VRP")
    description: Optional[str] = Field("", description="Optional remarks")
    parser: str = Field("huawei", description=f"Output parser to use, one of {PARSERS}")
    priority: int = Field(1, description="Sweep order: 1 is tried first, then 2, ...")
    enabled: bool = Field(True, description="Skip this profile when false")
    commands: CommandSet = Field(default_factory=CommandSet)
    regexes: RegexSet = Field(default_factory=RegexSet, description="Optional regex per command output")
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class CommandProfileCreate(BaseModel):
    name: str = Field(..., description="Display name")
    description: Optional[str] = ""
    parser: Optional[str] = Field("huawei", description=f"One of {PARSERS}")
    priority: Optional[int] = None
    enabled: Optional[bool] = True
    commands: Optional[CommandSet] = None
    regexes: Optional[RegexSet] = None


class CommandProfileUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parser: Optional[str] = None
    priority: Optional[int] = None
    enabled: Optional[bool] = None
    commands: Optional[CommandSet] = None
    regexes: Optional[RegexSet] = None


class CommandProfileReorder(BaseModel):
    ordered_ids: List[str] = Field(..., description="Profile IDs in the wanted sweep order (first = priority 1)")
