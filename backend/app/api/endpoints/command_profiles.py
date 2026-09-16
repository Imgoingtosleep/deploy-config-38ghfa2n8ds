from fastapi import APIRouter, HTTPException
from typing import List
from app.schemas.command_profile import (
    CommandProfile,
    CommandProfileCreate,
    CommandProfileReorder,
    CommandProfileUpdate,
    PARSERS,
)
from app.services.command_profile_service import CommandProfileService

router = APIRouter()


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
    return CommandProfileService.create_profile(request.dict())


@router.put("/{profile_id}", response_model=CommandProfile)
def update_command_profile(profile_id: str, request: CommandProfileUpdate):
    if request.parser and request.parser not in PARSERS:
        raise HTTPException(status_code=400, detail=f"parser must be one of {PARSERS}")
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


@router.post("/reorder", response_model=List[CommandProfile])
def reorder_command_profiles(request: CommandProfileReorder):
    """Set the sweep order: first ID becomes priority 1, e.g. Huawei then Cisco"""
    return CommandProfileService.reorder(request.ordered_ids)
