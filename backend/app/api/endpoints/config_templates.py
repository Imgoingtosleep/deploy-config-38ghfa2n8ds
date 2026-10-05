from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from app.schemas.config_template import (
    BuiltinHideRequest, ConfigTemplate, ConfigTemplateCreate, ConfigTemplateUpdate,
)
from app.services.config_template_service import ConfigTemplateError, ConfigTemplateService

router = APIRouter()


@router.get("", response_model=List[ConfigTemplate])
def list_config_templates(vendor: Optional[str] = Query(None, description="Filter by vendor")):
    """User-made Deploy Config templates, newest first"""
    return ConfigTemplateService.get_templates(vendor=vendor)


@router.get("/builtins/hidden", response_model=List[str])
def list_hidden_builtins():
    """Keys of the built-in templates the user deleted from the page"""
    return ConfigTemplateService.get_hidden_builtins()


@router.post("/builtins/hide", response_model=List[str])
def hide_builtin(request: BuiltinHideRequest):
    try:
        return ConfigTemplateService.hide_builtin(request.key)
    except ConfigTemplateError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("", response_model=ConfigTemplate)
def create_config_template(request: ConfigTemplateCreate):
    try:
        return ConfigTemplateService.create_template(request.dict())
    except ConfigTemplateError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{template_id}", response_model=ConfigTemplate)
def update_config_template(template_id: str, request: ConfigTemplateUpdate):
    try:
        updated = ConfigTemplateService.update_template(template_id, request.dict(exclude_unset=True))
    except ConfigTemplateError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not updated:
        raise HTTPException(status_code=404, detail="Config template not found")
    return updated


@router.delete("/{template_id}")
def delete_config_template(template_id: str):
    if not ConfigTemplateService.delete_template(template_id):
        raise HTTPException(status_code=404, detail="Config template not found")
    return {"message": "Config template deleted", "id": template_id}
