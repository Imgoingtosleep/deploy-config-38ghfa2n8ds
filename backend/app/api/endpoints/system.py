from fastapi import APIRouter
from app.core.config import settings
from app.schemas.command import WorkersSettingsResponse, WorkersSettingsUpdate
from app.services.ssh_compat import ssh_compat_status

router = APIRouter()

@router.get("/nornir-workers", response_model=WorkersSettingsResponse)
def get_nornir_workers():
    """Get current active Nornir concurrent workers count and bounds (min: 1, max: 100)"""
    return WorkersSettingsResponse(
        num_workers=getattr(settings, "DEFAULT_NUM_WORKERS", 10),
        min_workers=getattr(settings, "MIN_NUM_WORKERS", 1),
        max_workers=getattr(settings, "MAX_NUM_WORKERS", 100),
        default_workers=10,
    )

@router.post("/nornir-workers", response_model=WorkersSettingsResponse)
def update_nornir_workers(payload: WorkersSettingsUpdate):
    """Adjust active Nornir concurrent workers count (min: 1, max: 100)"""
    clamped = max(1, min(100, payload.num_workers))
    settings.DEFAULT_NUM_WORKERS = clamped
    return WorkersSettingsResponse(
        num_workers=settings.DEFAULT_NUM_WORKERS,
        min_workers=getattr(settings, "MIN_NUM_WORKERS", 1),
        max_workers=getattr(settings, "MAX_NUM_WORKERS", 100),
        default_workers=10,
    )


@router.get("/ssh-compat")
def get_ssh_compat():
    """Installed paramiko version and whether it can still speak the legacy SSH key exchanges"""
    return ssh_compat_status()

