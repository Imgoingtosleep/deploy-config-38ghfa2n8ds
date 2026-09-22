from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse

from app.schemas.deploy_schedule import ScheduleDeployRequest
from app.services.deploy_schedule_service import DeployScheduleService, ScheduleError

router = APIRouter()


@router.post("")
def create_schedule(request: ScheduleDeployRequest):
    """Schedule a fleet config deploy to start at run_at (server clock, compared in UTC)"""
    try:
        return DeployScheduleService.create(request)
    except ScheduleError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
def list_schedules():
    """All schedules, newest run_at first"""
    return DeployScheduleService.list_all()


@router.get("/{schedule_id}")
def get_schedule(schedule_id: str):
    """One schedule with its (masked) commands, device list and options"""
    item = DeployScheduleService.get(schedule_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Schedule {schedule_id} not found")
    return item


@router.post("/{schedule_id}/cancel")
def cancel_schedule(schedule_id: str):
    """Cancel before start, or stop a running deploy after the devices already in progress"""
    try:
        return DeployScheduleService.cancel(schedule_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Schedule {schedule_id} not found")
    except ScheduleError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{schedule_id}/run-now")
def run_schedule_now(schedule_id: str):
    """Start a scheduled deploy immediately instead of waiting for run_at"""
    try:
        return DeployScheduleService.run_now(schedule_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Schedule {schedule_id} not found")
    except ScheduleError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{schedule_id}")
def delete_schedule(schedule_id: str):
    """Remove a finished schedule from the list (its log file is kept)"""
    try:
        DeployScheduleService.delete(schedule_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Schedule {schedule_id} not found")
    except ScheduleError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"id": schedule_id, "deleted": True}


@router.get("/{schedule_id}/log", response_class=PlainTextResponse)
def get_schedule_log(schedule_id: str, download: bool = Query(False)):
    """Audit log: time | device | ip | action | status | detail"""
    text = DeployScheduleService.read_log(schedule_id)
    if text is None:
        raise HTTPException(status_code=404, detail=f"Log for {schedule_id} not found")
    headers = {"Content-Disposition": f'attachment; filename="{schedule_id}.log"'} if download else None
    return PlainTextResponse(text, headers=headers)
