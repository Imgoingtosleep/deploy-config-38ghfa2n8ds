from typing import List, Optional
from fastapi import APIRouter, HTTPException
from app.schemas.playbook import (
    PlaybookCreate,
    PlaybookUpdate,
    PlaybookResponse,
    AutoTranslateRequest,
    AutoTranslateResponse,
)
from app.services.playbook_service import PlaybookService
from app.services.command_translator import CommandTranslator

router = APIRouter()

@router.get("", response_model=List[PlaybookResponse])
def list_playbooks():
    """List all permanently saved command playbooks and test suite profiles"""
    return PlaybookService.get_all()

@router.get("/{playbook_id}", response_model=PlaybookResponse)
def get_playbook(playbook_id: str):
    """Get details of a specific playbook profile by ID"""
    pb = PlaybookService.get_by_id(playbook_id)
    if not pb:
        raise HTTPException(status_code=404, detail=f"Playbook {playbook_id} not found")
    return pb

@router.post("/auto-translate", response_model=AutoTranslateResponse)
def auto_translate_commands(request: AutoTranslateRequest):
    """
    Auto-translate commands from Huawei (primary) or any vendor
    to all target vendors (Cisco, Juniper, Aruba, MikroTik, Comware).
    """
    clean_cmds = [c.strip() for c in request.commands if c.strip()]
    translations = CommandTranslator.translate_batch(
        commands=clean_cmds,
        source_vendor=request.source_vendor or "huawei",
        target_vendors=request.target_vendors,
    )
    return AutoTranslateResponse(
        source_vendor=request.source_vendor or "huawei",
        commands=clean_cmds,
        translations=translations,
    )

@router.post("", response_model=PlaybookResponse)
def create_playbook(request: PlaybookCreate):
    """Create and persist a new test playbook profile"""
    if not request.name.strip():
        raise HTTPException(status_code=400, detail="Playbook name cannot be empty")
    return PlaybookService.create(request.model_dump())

@router.put("/{playbook_id}", response_model=PlaybookResponse)
def update_playbook(playbook_id: str, request: PlaybookUpdate):
    """Update an existing test playbook profile (rename, modify commands, etc.)"""
    updated = PlaybookService.update(playbook_id, request.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail=f"Playbook {playbook_id} not found")
    return updated

@router.delete("/{playbook_id}")
def delete_playbook(playbook_id: str):
    """Permanently delete a playbook profile"""
    success = PlaybookService.delete(playbook_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Playbook {playbook_id} not found")
    return {"status": "deleted", "id": playbook_id, "message": "Playbook profile deleted successfully."}
