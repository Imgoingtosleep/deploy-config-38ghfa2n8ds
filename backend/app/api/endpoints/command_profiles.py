import re

from fastapi import APIRouter, HTTPException
from typing import Any, List, Optional
from app.schemas.command_profile import (
    CommandProfile,
    CommandProfileCreate,
    CommandProfileReorder,
    CommandProfileUpdate,
    CustomRegexResult,
    CustomRegexTest,
    PARSERS,
    SampleOutputRequest,
    SampleOutputResult,
)
from app.services.command_profile_service import CommandProfileService

router = APIRouter()


def _check_regexes(regexes: Optional[Any]) -> None:
    """A pattern that does not compile would break every sweep using this profile"""
    if not regexes:
        return
    values = regexes if isinstance(regexes, dict) else regexes.dict()
    for field, pattern in values.items():
        if not pattern:
            continue
        try:
            re.compile(pattern)
        except re.error as e:
            raise HTTPException(status_code=400, detail=f"Invalid regex for '{field}': {e}")


def _check_custom_parser(profile: dict) -> None:
    """A 'custom' profile is only its regexes: refuse one that could never read a neighbor"""
    problem = CommandProfileService.custom_parser_problem(profile)
    if problem:
        raise HTTPException(status_code=400, detail=problem)


@router.get("", response_model=List[CommandProfile])
def list_command_profiles():
    """All LLDP command profiles in sweep order (priority 1 first)"""
    return CommandProfileService.get_profiles()


@router.get("/{profile_id}", response_model=CommandProfile)
def get_command_profile(profile_id: str):
    profile = CommandProfileService.get_profile_by_id(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Command profile not found")
    return profile


@router.post("", response_model=CommandProfile)
def create_command_profile(request: CommandProfileCreate):
    """Create a command profile, e.g. an Aruba set reusing the cisco parser"""
    if not request.name.strip():
        raise HTTPException(status_code=400, detail="Profile name is required")
    if request.parser and request.parser not in PARSERS:
        raise HTTPException(status_code=400, detail=f"parser must be one of {PARSERS}")
    _check_regexes(request.regexes)
    _check_custom_parser(request.dict())
    return CommandProfileService.create_profile(request.dict())


@router.put("/{profile_id}", response_model=CommandProfile)
def update_command_profile(profile_id: str, request: CommandProfileUpdate):
    if request.parser and request.parser not in PARSERS:
        raise HTTPException(status_code=400, detail=f"parser must be one of {PARSERS}")
    _check_regexes(request.regexes)
    existing = CommandProfileService.get_profile_by_id(profile_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Command profile not found")
    changes = {k: v for k, v in request.dict(exclude_unset=True).items() if v is not None}
    _check_custom_parser({**existing, **changes})
    updated = CommandProfileService.update_profile(profile_id, request.dict(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Command profile not found")
    return updated


@router.delete("/{profile_id}")
def delete_command_profile(profile_id: str):
    if not CommandProfileService.get_profile_by_id(profile_id):
        raise HTTPException(status_code=404, detail="Command profile not found")
    if not CommandProfileService.delete_profile(profile_id):
        raise HTTPException(status_code=400, detail="Cannot delete the last remaining command profile")
    return {"message": "Command profile deleted successfully", "id": profile_id}


@router.post("/test-regex", response_model=CustomRegexResult)
def test_custom_regex(request: CustomRegexTest):
    """Neighbors a 'custom' parser regex reads from sample output, exactly as the scan would.
    Python regex (named groups are (?P<name>...)), so the page cannot test it itself."""
    from app.services.command_profile_service import CUSTOM_GROUPS
    from app.services.lldp_service import LldpService
    if not request.pattern.strip():
        return CustomRegexResult(error="Enter a regex")
    try:
        rx = re.compile(request.pattern)
    except re.error as e:
        return CustomRegexResult(error=f"Invalid regex: {e}")
    groups = list(rx.groupindex)
    unknown = [g for g in groups if g not in CUSTOM_GROUPS]
    error = None
    if unknown:
        error = f"Unknown group(s) {', '.join(unknown)}: use {', '.join(CUSTOM_GROUPS)}"
    elif "local_port" not in groups and not request.default_local_port:
        error = "Add a (?P<local_port>...) group"
    rows = LldpService.parse_custom(request.output, request.pattern, request.default_local_port or None)
    return CustomRegexResult(rows=rows, groups=groups, error=error)


@router.post("/sample-output", response_model=SampleOutputResult)
def get_sample_output(request: SampleOutputRequest):
    """Run one command, as written, on a fleet device: sample output to write a regex against"""
    from app.services.autodetect_service import AutoDetectService, is_driver
    from app.services.netmiko_service import NetmikoService
    device = request.device
    driver = (request.driver or "").strip().lower()
    if is_driver(driver):
        device.device_type = driver
    else:
        device.device_type, _ = AutoDetectService.resolve_driver(device)
    result = NetmikoService.send_command(device, request.command)
    return SampleOutputResult(
        output=result.get("output") or "",
        success=bool(result.get("success")),
        error=result.get("error"),
    )


@router.post("/reorder", response_model=List[CommandProfile])
def reorder_command_profiles(request: CommandProfileReorder):
    """Set the sweep order: first ID becomes priority 1, e.g. Huawei then Cisco"""
    return CommandProfileService.reorder(request.ordered_ids)
