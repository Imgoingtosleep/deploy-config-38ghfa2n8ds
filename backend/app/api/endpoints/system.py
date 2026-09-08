from fastapi import APIRouter
from app.core.config import settings
from app.schemas.command import WorkersSettingsResponse, WorkersSettingsUpdate

router = APIRouter()

@router.get("/nornir-workers", response_model=WorkersSettingsResponse)
def get_nornir_workers():
    """Get current active Nornir concurrent workers count and bounds (min: 10, max: 100)"""
    return WorkersSettingsResponse(
        num_workers=getattr(settings, "DEFAULT_NUM_WORKERS", 10),
        min_workers=getattr(settings, "MIN_NUM_WORKERS", 10),
        max_workers=getattr(settings, "MAX_NUM_WORKERS", 100),
        default_workers=10,
    )

@router.post("/nornir-workers", response_model=WorkersSettingsResponse)
def update_nornir_workers(payload: WorkersSettingsUpdate):
    """Adjust active Nornir concurrent workers count (min: 10, max: 100)"""
    clamped = max(10, min(100, payload.num_workers))
    settings.DEFAULT_NUM_WORKERS = clamped
    return WorkersSettingsResponse(
        num_workers=settings.DEFAULT_NUM_WORKERS,
        min_workers=getattr(settings, "MIN_NUM_WORKERS", 10),
        max_workers=getattr(settings, "MAX_NUM_WORKERS", 100),
        default_workers=10,
    )
