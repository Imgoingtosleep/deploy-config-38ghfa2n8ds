from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from app.schemas.device import DeviceCredentials
from app.services.lldp_service import LldpService

router = APIRouter()


class LldpDiscoverRequest(BaseModel):
    devices: List[DeviceCredentials]
    num_workers: Optional[int] = Field(None, ge=1, le=100)
    recursive: bool = Field(False, description="SSH into discovered neighbors via LLDP management address")
    max_depth: int = Field(3, ge=1, le=10)


class LldpExportRequest(BaseModel):
    neighbors: List[Dict[str, Any]] = []
    hosts: List[Dict[str, Any]] = []


@router.post("/discover")
def discover_lldp(request: LldpDiscoverRequest):
    """SSH -> 'display lldp neighbor brief' -> loop 'display lldp neighbor interface <if>' on every neighbor port"""
    if not request.devices:
        raise HTTPException(status_code=400, detail="No devices supplied")
    return LldpService.discover(
        devices=request.devices,
        num_workers=request.num_workers,
        recursive=request.recursive,
        max_depth=request.max_depth,
    )


@router.post("/export-excel")
def export_lldp_excel(request: LldpExportRequest):
    """Build lldp_detailed_report.xlsx (LLDP_Inventory, Execution_Summary, Raw_Logs)"""
    content = LldpService.build_excel(request.neighbors, request.hosts)
    filename = f"lldp_detailed_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
