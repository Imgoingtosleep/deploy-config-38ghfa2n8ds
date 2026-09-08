import json
import asyncio
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from app.schemas.command import (
    BatchCommandRequest,
    BatchDeployRequest,
    BatchBackupRequest,
    BatchHealthCheckRequest,
    JobSubmitResponse,
    JobStatusResponse,
    JobPaginatedResultsResponse,
)
from app.services.job_service import JobService

router = APIRouter()

@router.post("/submit-troubleshoot", response_model=JobSubmitResponse)
def submit_troubleshoot_job(request: BatchCommandRequest):
    """Submit background troubleshoot job across fleet (up to 10,000+ devices)"""
    if not request.devices:
        raise HTTPException(status_code=400, detail="No devices provided for troubleshoot job")
    return JobService.create_troubleshoot_job(
        devices=request.devices,
        command=request.command or "",
        vendor_commands=request.vendor_commands,
        huawei_command=request.huawei_command,
        cisco_command=request.cisco_command,
        num_workers=request.num_workers,
    )

@router.post("/submit-deploy", response_model=JobSubmitResponse)
def submit_deploy_job(request: BatchDeployRequest):
    """Submit background config deployment job across fleet (up to 10,000+ devices)"""
    if not request.devices:
        raise HTTPException(status_code=400, detail="No devices provided for deploy job")
    return JobService.create_deploy_job(
        devices=request.devices,
        config_commands=request.config_commands,
        save_config=request.save_config,
        pre_check_commands=request.pre_check_commands or [],
        post_check_commands=request.post_check_commands or [],
        backup_before_deploy=request.backup_before_deploy,
        num_workers=request.num_workers,
    )

@router.post("/submit-backup", response_model=JobSubmitResponse)
def submit_backup_job(request: BatchBackupRequest):
    """Submit background running-config backup job across fleet (up to 10,000+ devices)"""
    if not request.devices:
        raise HTTPException(status_code=400, detail="No devices provided for backup job")
    return JobService.create_backup_job(request.devices, num_workers=request.num_workers)

@router.post("/submit-healthcheck", response_model=JobSubmitResponse)
def submit_healthcheck_job(request: BatchHealthCheckRequest):
    """Submit background healthcheck job across fleet (up to 10,000+ devices)"""
    if not request.devices:
        raise HTTPException(status_code=400, detail="No devices provided for healthcheck job")
    return JobService.create_healthcheck_job(
        devices=request.devices,
        check_type=request.check_type or "standard",
        commands=request.commands,
        vendor_commands=request.vendor_commands,
        suite_name=request.suite_name,
        num_workers=request.num_workers,
    )



@router.get("/{job_id}/status", response_model=JobStatusResponse)
def get_job_status(job_id: str):
    """Get real-time progress status and counters for a running job"""
    status = JobService.get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return status

@router.get("/{job_id}/results", response_model=JobPaginatedResultsResponse)
def get_job_results(
    job_id: str,
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=10, le=200, description="Number of items per page"),
    search: str = Query("", description="Search filter by host IP, output text, or error message"),
    status_filter: str = Query("all", description="Filter status: 'all', 'success', 'failed'"),
):
    """Fetch paginated and searchable results for a completed or running job"""
    results = JobService.get_paginated_results(
        job_id=job_id,
        page=page,
        page_size=page_size,
        search=search,
        status_filter=status_filter,
    )
    if not results:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return results

@router.get("/{job_id}/results/all")
def get_all_job_results(job_id: str):
    """Fetch all results for a job for export purposes"""
    results = JobService.get_all_results(job_id)
    if results is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return results

@router.get("/{job_id}/stream")
async def stream_job_progress(job_id: str):
    """Server-Sent Events (SSE) stream for live real-time progress bar"""
    async def event_generator():
        while True:
            status = JobService.get_job_status(job_id)
            if not status:
                msg = json.dumps({'error': 'Job not found'})
                yield f"data: {msg}\n\n"
                break

            data_payload = status.model_dump()
            msg = json.dumps(data_payload)
            yield f"data: {msg}\n\n"

            if status.is_completed:
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

@router.post("/{job_id}/cancel")
def cancel_job(job_id: str):
    """Cancel a currently executing background job"""
    success = JobService.cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return {"job_id": job_id, "status": "cancelling", "message": "Cancellation signal dispatched."}
