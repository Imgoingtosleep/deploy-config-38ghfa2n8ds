from typing import Optional, List, Dict
from pydantic import BaseModel, Field

from app.schemas.device import DeviceCredentials

# Parsers available for LLDP output. huawei / cisco / raisecom are implemented in code;
# 'custom' reads the output with the profile's own regexes (named groups, see RegexSet),
# so a vendor whose output none of the built-in parsers can read needs no code change.
PARSERS = ["huawei", "cisco", "raisecom", "custom"]


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

    With the 'custom' parser the three LLDP patterns are the parser: every match is one
    neighbor, read from the named groups local_port (required), remote_device, remote_port,
    remote_ip and remote_model. lldp_brief is required; lldp_detail / lldp_full are optional
    and fill in what the brief output lacks.
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
    driver: str = Field("", description="Netmiko driver a 'custom' parser profile logs in with, e.g. huawei")
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
    driver: Optional[str] = Field("", description="Netmiko driver, 'custom' parser only")
    priority: Optional[int] = None
    enabled: Optional[bool] = True
    commands: Optional[CommandSet] = None
    regexes: Optional[RegexSet] = None


class CommandProfileUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parser: Optional[str] = None
    driver: Optional[str] = None
    priority: Optional[int] = None
    enabled: Optional[bool] = None
    commands: Optional[CommandSet] = None
    regexes: Optional[RegexSet] = None


class CommandProfileReorder(BaseModel):
    ordered_ids: List[str] = Field(..., description="Profile IDs in the wanted sweep order (first = priority 1)")


class CustomRegexTest(BaseModel):
    """Try a 'custom' parser regex on sample output before saving the profile"""
    output: str = Field("", description="Sample output of the LLDP command")
    pattern: str = Field("", description="The regex with named groups")
    default_local_port: Optional[str] = Field(None, description="Port a per-interface detail command ran for")


class CustomRegexResult(BaseModel):
    rows: List[Dict[str, str]] = Field(default_factory=list, description="Neighbors the regex reads, as the scan would")
    groups: List[str] = Field(default_factory=list, description="Named groups in the pattern")
    error: Optional[str] = Field(None, description="Why the pattern cannot be used, None when it can")


class SampleOutputRequest(BaseModel):
    device: DeviceCredentials
    driver: Optional[str] = Field(None, description="Driver to log in with; the device's own when empty")
    command: str = Field(..., description="Command to run exactly as written (no vendor translation)")


class SampleOutputResult(BaseModel):
    output: str = ""
    success: bool = False
    error: Optional[str] = None
