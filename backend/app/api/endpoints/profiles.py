from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.schemas.profile import CredentialProfile, CredentialProfileCreate, CredentialProfileUpdate
from app.services.profile_service import ProfileService
from app.api.endpoints.auth import get_current_username

router = APIRouter()

@router.get("", response_model=List[CredentialProfile])
def list_profiles(username: str = Depends(get_current_username)):
    """Retrieve all saved SSH/Telnet credential profiles"""
    return ProfileService.get_profiles(username)

@router.get("/{profile_id}", response_model=CredentialProfile)
def get_profile(profile_id: str, username: str = Depends(get_current_username)):
    """Retrieve a specific credential profile by ID"""
    profile = ProfileService.get_profile_by_id(profile_id, username)
    if not profile:
        raise HTTPException(status_code=404, detail="Credential profile not found")
    return profile

@router.post("", response_model=CredentialProfile)
def create_profile(request: CredentialProfileCreate, username: str = Depends(get_current_username)):
    """Create a new credential profile for quick device login"""
    if not request.name.strip():
        raise HTTPException(status_code=400, detail="Profile name is required")

    return ProfileService.create_profile(request.dict(), username)

@router.put("/{profile_id}", response_model=CredentialProfile)
def update_profile(profile_id: str, request: CredentialProfileUpdate, username: str = Depends(get_current_username)):
    """Update an existing credential profile"""
    updated = ProfileService.update_profile(profile_id, request.dict(exclude_unset=True), username)
    if not updated:
        raise HTTPException(status_code=404, detail="Credential profile not found")
    return updated

@router.delete("/{profile_id}")
def delete_profile(profile_id: str, username: str = Depends(get_current_username)):
    """Delete a credential profile"""
    deleted = ProfileService.delete_profile(profile_id, username)
    if not deleted:
        raise HTTPException(status_code=404, detail="Credential profile not found")
    return {"message": "Credential profile deleted successfully", "id": profile_id}

@router.post("/{profile_id}/default", response_model=CredentialProfile)
def set_default_profile(profile_id: str, username: str = Depends(get_current_username)):
    """Set a profile as the default credential profile"""
    profile = ProfileService.set_default_profile(profile_id, username)
    if not profile:
        raise HTTPException(status_code=404, detail="Credential profile not found")
    return profile
