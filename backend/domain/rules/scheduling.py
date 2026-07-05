"""Pure scheduling rules — bookability and the cancellation credit window."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

# Business Rule 8: cancelling strictly more than 24h before the session returns
# the session credit.
CANCELLATION_CREDIT_WINDOW = timedelta(hours=24)


def subscription_is_usable(
    *,
    status: str,
    expires_at: Optional[datetime],
    sessions_remaining: int,
    now: datetime,
    active_value: str = "active",
) -> bool:
    """True when a subscription can back a new booking (§2.2/§2.4/§2.3)."""
    return (
        status == active_value
        and expires_at is not None
        and expires_at > now
        and sessions_remaining > 0
    )


def cancellation_refunds_credit(
    *, scheduled_at: datetime, now: datetime,
    window: timedelta = CANCELLATION_CREDIT_WINDOW,
) -> bool:
    """
    True if a cancellation at `now` returns the session credit — i.e. it happens
    strictly earlier than `window` before the session start (Business Rule 8).
    """
    return now < (scheduled_at - window)


# ── weekly calendar (Sprint 7) ────────────────────────────────────────────────
WEEKDAY_NAMES = (
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
)


def week_start_for(reference):
    """The Monday date of the week that contains `reference` (a date/datetime)."""
    d = reference.date() if isinstance(reference, datetime) else reference
    return d - timedelta(days=d.weekday())  # Monday = weekday 0


def calendar_slot_status(*, slot_status, start_at, now, open_value="open",
                         booked_value="booked", blocked_value="blocked") -> str:
    """Present a slot's status for the weekly calendar. A booked slot whose start
    time has passed is shown as `completed`. Only `available` is selectable."""
    if slot_status == open_value:
        return "available"
    if slot_status == blocked_value:
        return "blocked"
    if slot_status == booked_value:
        return "completed" if start_at < now else "booked"
    return slot_status
