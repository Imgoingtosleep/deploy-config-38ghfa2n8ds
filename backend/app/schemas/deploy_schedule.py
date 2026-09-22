from datetime import datetime
from typing import Optional
from pydantic import Field, field_validator, model_validator

from app.schemas.command import BatchDeployRequest


class ScheduleDeployRequest(BatchDeployRequest):
    run_at: datetime = Field(..., description="When to start, ISO 8601 with offset e.g. 2026-09-24T19:00:00Z")
    deadline: Optional[datetime] = Field(
        None,
        description="Do not start after this time (end of maintenance window). "
                    "Unset = run_at + DEPLOY_SCHEDULE_GRACE_MINUTES",
    )
    client_tz: Optional[str] = Field(None, description="Browser IANA timezone e.g. Asia/Bangkok, used for log timestamps")
    client_offset_minutes: Optional[int] = Field(
        None, description="Browser UTC offset in minutes (+420 for UTC+7), fallback when client_tz is unknown"
    )
    title: Optional[str] = Field(None, max_length=120, description="Label shown in the schedule list")

    @field_validator("run_at", "deadline")
    @classmethod
    def require_timezone(cls, v: Optional[datetime]) -> Optional[datetime]:
        if v is not None and v.tzinfo is None:
            raise ValueError("datetime must include a timezone offset (e.g. ...Z or ...+07:00)")
        return v

    @model_validator(mode="after")
    def check_window(self):
        if self.deadline is not None and self.deadline <= self.run_at:
            raise ValueError("deadline must be after run_at")
        return self
