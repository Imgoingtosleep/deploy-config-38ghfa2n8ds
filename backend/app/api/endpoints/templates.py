from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from app.schemas.template import CommandTemplate, TemplateCreateRequest, TemplateExecuteRequest
from app.schemas.command import MultiCommandResponse
from app.services.template_service import TemplateService
from app.services.netmiko_service import NetmikoService

router = APIRouter()

@router.get("", response_model=List[CommandTemplate])
def list_templates(vendor: Optional[str] = Query(None, description="Filter by vendor")):
    """Get all saved command templates (Level 1 & Level 2 accessible)"""
    return TemplateService.get_templates(vendor=vendor)

@router.get("/{template_id}", response_model=CommandTemplate)
def get_template(template_id: str):
    """Get a specific template by ID"""
    tpl = TemplateService.get_template_by_id(template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tpl

@router.post("", response_model=CommandTemplate)
def create_template(request: TemplateCreateRequest):
    """Create and save a new template from tested CLI commands or regex filters"""
    if not request.name.strip():
        raise HTTPException(status_code=400, detail="Template name is required")

    return TemplateService.create_template(
        name=request.name,
        commands=request.commands or [],
        vendor=request.vendor or "all",
        description=request.description or "",
        regex=request.regex,
    )

@router.put("/{template_id}", response_model=CommandTemplate)
def update_template(template_id: str, request: TemplateCreateRequest):
    """Update an existing template (Level 2 Engineer only)"""
    updated = TemplateService.update_template(
        template_id=template_id,
        name=request.name,
        commands=request.commands,
        vendor=request.vendor or "huawei",
        description=request.description or "",
        regex=request.regex,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Template not found")
    return updated

@router.delete("/{template_id}")
def delete_template(template_id: str):
    """Delete a template (Level 2 Engineer only)"""
    deleted = TemplateService.delete_template(template_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted successfully"}

@router.post("/execute", response_model=MultiCommandResponse)
def execute_template(request: TemplateExecuteRequest):
    """Execute a saved template against target device (Level 1 Operator or Level 2 Engineer)"""
    commands_to_run = []
    
    if request.template_id:
        tpl = TemplateService.get_template_by_id(request.template_id)
        if not tpl:
            raise HTTPException(status_code=404, detail="Selected template not found")
        commands_to_run = tpl.get("commands", [])
    elif request.commands:
        commands_to_run = request.commands

    if not commands_to_run:
        raise HTTPException(status_code=400, detail="No commands specified to execute")

    result = NetmikoService.send_multiple_commands(request.device, commands_to_run)
    return MultiCommandResponse(
        host=result["host"],
        results=result.get("results", []),
        success=result.get("success", False),
        overall_time_seconds=result.get("overall_time_seconds"),
    )
