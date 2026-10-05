"""
Next-occurrence math for repeating scheduled deploys.

Repeat modes (all keep the wall-clock time of the first run):
  once    - no next run
  hourly  - every N hours
  daily   - every N days
  weekly  - on the chosen weekdays (0=Monday .. 6=Sunday), every week

Daily/weekly step in the timezone the schedule was created in, so 02:00 stays
02:00 for the operator even across a DST change; hourly steps in real hours.
"""
from datetime import datetime, timedelta, timezone, tzinfo
from typing import List, Optional, Sequence

REPEAT_MODES = ("once", "hourly", "daily", "weekly")
_MAX_STEPS = 5000  # a schedule left behind for years still cannot spin the loop forever


def _at_local_date(local: datetime, days: int, tz: tzinfo) -> datetime:
    """Same wall-clock time as `local`, `days` later, as an aware datetime in tz"""
    d = local.date() + timedelta(days=days)
    return datetime(d.year, d.month, d.day, local.hour, local.minute, local.second, tzinfo=tz)


def next_occurrence(
    base: datetime,
    repeat: str,
    interval: int = 1,
    weekdays: Optional[Sequence[int]] = None,
    tz: tzinfo = timezone.utc,
    after: Optional[datetime] = None,
) -> Optional[datetime]:
    """First run strictly after both `base` and `after`, or None for a one-shot schedule"""
    if repeat not in REPEAT_MODES or repeat == "once":
        return None
    after = max(base, after) if after else base
    interval = max(1, int(interval or 1))

    if repeat == "hourly":
        step = timedelta(hours=interval)
        nxt = base + step
        for _ in range(_MAX_STEPS):
            if nxt > after:
                return nxt
            nxt += step
        return nxt

    local = base.astimezone(tz)
    if repeat == "daily":
        for n in range(1, _MAX_STEPS):
            nxt = _at_local_date(local, n * interval, tz)
            if nxt > after:
                return nxt
        return None

    # weekly
    days = sorted(set(weekdays or [local.weekday()]))
    for n in range(1, 8 * _MAX_STEPS):
        nxt = _at_local_date(local, n, tz)
        if nxt.weekday() in days and nxt > after:
            return nxt
    return None


def describe(repeat: str, interval: int = 1, weekdays: Optional[Sequence[int]] = None,
             occurrences: Optional[int] = None) -> str:
    """Short human label, e.g. 'every 6 hours, 4 times' or 'weekly on Mon, Thu'"""
    interval = max(1, int(interval or 1))
    if repeat == "hourly":
        text = "every hour" if interval == 1 else f"every {interval} hours"
    elif repeat == "daily":
        text = "every day" if interval == 1 else f"every {interval} days"
    elif repeat == "weekly":
        names: List[str] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        picked = ", ".join(names[d] for d in sorted(set(weekdays or []))) or "same weekday"
        text = f"weekly on {picked}"
    else:
        return "once"
    if occurrences:
        text += f", {occurrences} times"
    else:
        text += ", until cancelled"
    return text
