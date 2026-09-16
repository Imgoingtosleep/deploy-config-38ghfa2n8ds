from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from app.schemas.device import DeviceCredentials
from app.services.job_service import JobService
from app.services.lldp_service import LldpService
from app.services.lldp_scan_service import LldpScanService, expand_targets
from app.services.topology_import_service import MAX_IMPORT_BYTES, TopologyImportError, import_topology_file

router = APIRouter()


class LldpTargetPreviewRequest(BaseModel):
    targets: List[str] = Field(..., description="CIDR / range / IP e.g. 10.0.0.0/24, 10.0.1.10-50, 10.0.2.1")
    exclude: List[str] = []


class LldpSubnetScanRequest(LldpTargetPreviewRequest):
    profile_id: Optional[str] = Field(None, description="Credential profile; empty + no username = default profile")
    fallback_profile_ids: Optional[List[str]] = Field(
        None,
        description="Ordered profile priority pool, e.g. ['prof-huawei', 'prof-cisco'] tried in that order",
    )
    username: Optional[str] = ""
    password: Optional[str] = ""
    secret: Optional[str] = None
    device_type: str = "huawei"
    port: int = Field(22, ge=1, le=65535)
    num_workers: Optional[int] = Field(None, ge=1, le=100, description="Concurrent SSH sessions")
    enable_tcp_scan: bool = Field(True, description="Enable TCP port 22 pre-scan before LLDP collection")
    scan_workers: int = Field(200, ge=1, le=1000, description="Concurrent TCP port checks")
    tcp_timeout: float = Field(1.5, ge=0.2, le=10)
    recursive: bool = Field(False, description="Also SSH to LLDP management IPs outside the targets")
    max_depth: int = Field(3, ge=1, le=10)
    command_profile_ids: Optional[List[str]] = Field(
        None,
        description="Ordered LLDP command profiles, e.g. ['cmdprof-huawei', 'cmdprof-cisco']; empty = all enabled by priority",
    )


class LldpDiscoverRequest(BaseModel):
    devices: List[DeviceCredentials]
    num_workers: Optional[int] = Field(None, ge=1, le=100)
    enable_tcp_scan: bool = Field(False, description="Fast TCP port check before SSH")
    scan_workers: int = Field(50, ge=1, le=1000, description="Concurrent TCP port checks")
    tcp_timeout: float = Field(1.5, ge=0.2, le=10)
    recursive: bool = Field(False, description="SSH into discovered neighbors via LLDP management address")
    max_depth: int = Field(3, ge=1, le=10)
    command_profile_ids: Optional[List[str]] = Field(
        None,
        description="Ordered LLDP command profiles, e.g. ['cmdprof-huawei', 'cmdprof-cisco']; empty = all enabled by priority",
    )


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
        enable_tcp_scan=request.enable_tcp_scan,
        scan_workers=request.scan_workers,
        tcp_timeout=request.tcp_timeout,
        recursive=request.recursive,
        max_depth=request.max_depth,
        command_profile_ids=request.command_profile_ids,
    )


@router.post("/scan-subnet/preview")
def preview_scan_targets(request: LldpTargetPreviewRequest):
    """Expand targets without scanning: IP count and first / last address"""
    try:
        ips = expand_targets(request.targets, request.exclude)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"count": len(ips), "first": ips[0] if ips else None, "last": ips[-1] if ips else None}


@router.post("/scan-subnet")
def submit_subnet_scan(request: LldpSubnetScanRequest):
    """Background job: expand subnet -> TCP port check -> LLDP collect on reachable hosts, logs written to disk"""
    template = DeviceCredentials(
        host=None,
        profile_id=request.profile_id or None,
        fallback_profile_ids=request.fallback_profile_ids or None,
        username=request.username or "",
        password=request.password or "",
        secret=request.secret,
        device_type=request.device_type,
        port=request.port,
        connection_mode="network",
    )
    try:
        return LldpScanService.create_job(
            targets=request.targets,
            exclude=request.exclude,
            template=template,
            num_workers=request.num_workers,
            enable_tcp_scan=request.enable_tcp_scan,
            scan_workers=request.scan_workers,
            tcp_timeout=request.tcp_timeout,
            recursive=request.recursive,
            max_depth=request.max_depth,
            command_profile_ids=request.command_profile_ids,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/scan-subnet/{job_id}")
def get_subnet_scan(
    job_id: str,
    include_report: bool = Query(False, description="Include neighbors + hosts (same shape as /discover)"),
    log_lines: int = Query(100, ge=0, le=1000),
):
    status = LldpScanService.get_status(job_id, include_report=include_report, log_lines=log_lines)
    if status is None:
        raise HTTPException(status_code=404, detail=f"LLDP scan job {job_id} not found")
    return status


@router.post("/scan-subnet/{job_id}/cancel")
def cancel_subnet_scan(job_id: str):
    if job_id not in LldpScanService._scans or not JobService.cancel_job(job_id):
        raise HTTPException(status_code=404, detail=f"LLDP scan job {job_id} not found")
    return {"job_id": job_id, "status": "cancelling"}


@router.get("/scan-subnet/{job_id}/export-zip")
def export_subnet_scan_zip(job_id: str):
    """ZIP of the job log directory (job.log, scan_result.csv, lldp_inventory.csv, hosts/*.log, report)"""
    content = LldpScanService.export_zip(job_id)
    if content is None:
        raise HTTPException(status_code=404, detail=f"LLDP scan job {job_id} not found")
    return Response(
        content=content,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="lldp_scan_{job_id[:8]}_logs.zip"'},
    )


@router.post("/import-topology")
async def import_topology(file: UploadFile = File(...)):
    """Exported topology (.drawio / .svg / .png / .zip / .json) -> same report shape as /discover"""
    content = await file.read(MAX_IMPORT_BYTES + 1)
    try:
        return import_topology_file(file.filename or "", content)
    except TopologyImportError as e:
        raise HTTPException(status_code=400, detail=f"Cannot import {file.filename}: {e}")


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
