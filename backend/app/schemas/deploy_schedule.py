from datetime import datetime
from typing import List, Literal, Optional
from pydantic import Field, field_validator, model_validator

from app.schemas.command import BatchDeployRequest


class ScheduleDeployRequest(BatchDeployRequest):
    run_at: datetime = Field(..., description="When to start, ISO 8601 with offset e.g. 2026-09-24T19:00:00Z")
    deadline: Optional[datetime] = Field(
        None,
        description="Do not start after this time (end of maintenance window). "
                    "Unset = run_at + DEPLOY_SCHEDULE_GRACE_MINUTES. Only for repeat='once'; a repeating "
                    "schedule uses the grace window for every run and repeat_until to stop the series",
    )
    repeat: Literal["once", "hourly", "daily", "weekly"] = Field(
        "once", description="once = single run, hourly/daily = every `interval` hours/days, weekly = on `weekdays`"
    )
    interval: int = Field(1, ge=1, le=365, description="Every N hours (repeat=hourly) or N days (repeat=daily)")
    weekdays: List[int] = Field(
        default_factory=list, description="repeat=weekly: 0=Monday .. 6=Sunday, e.g. [0,3] for Mon and Thu"
    )
    occurrences: Optional[int] = Field(
        None, ge=1, le=1000, description="Total number of runs including the first. Unset = until cancelled"
    )
    repeat_until: Optional[datetime] = Field(
        None, description="Stop repeating after this time (the series ends, no run starts later than this)"
    )
    client_tz: Optional[str] = Field(None, description="Browser IANA timezone e.g. Asia/Bangkok, used for log timestamps")
    client_offset_minutes: Optional[int] = Field(
        None, description="Browser UTC offset in minutes (+420 for UTC+7), fallback when client_tz is unknown"
    )
    title: Optional[str] = Field(None, max_length=120, description="Label shown in the schedule list")

    @field_validator("run_at", "deadline", "repeat_until")
    @classmethod
    def require_timezone(cls, v: Optional[datetime]) -> Optional[datetime]:
        if v is not None and v.tzinfo is None:
            raise ValueError("datetime must include a timezone offset (e.g. ...Z or ...+07:00)")
        return v

    @field_validator("weekdays")
    @classmethod
    def check_weekdays(cls, v: List[int]) -> List[int]:
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("weekdays must be 0 (Monday) to 6 (Sunday)")
        return sorted(set(v))

    @model_validator(mode="after")
    def check_window(self):
        if self.deadline is not None and self.deadline <= self.run_at:
            raise ValueError("deadline must be after run_at")
        if self.repeat_until is not None and self.repeat_until <= self.run_at:
            raise ValueError("repeat_until must be after run_at")
        if self.repeat == "weekly" and not self.weekdays:
            raise ValueError("pick at least one weekday for a weekly schedule")
        if self.repeat == "once" and (self.occurrences or 1) > 1:
            raise ValueError("occurrences > 1 needs a repeat mode (hourly, daily or weekly)")
        return self
