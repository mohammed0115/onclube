"""
Pure session state rules (framework-free).

State machine (Sprint 8.0):

    waiting(scheduled) ──► live ──► completed
            │                └────────► (end)
            ├──► cancelled
            └──► expired   (join window closed while still waiting)

Statuses mirror apps.common.enums.SessionStatus as plain strings so this module
stays Django-free.
"""
from __future__ import annotations

from datetime import timedelta

SCHEDULED = "scheduled"
LIVE = "live"
COMPLETED = "completed"
CANCELLED = "cancelled"
EXPIRED = "expired"

# Join window: opens shortly before the scheduled start and stays open until a
# grace period after the session's nominal end.
EARLY_JOIN_MINUTES = 15
LATE_JOIN_GRACE_MINUTES = 15

JOINABLE_STATUSES = (SCHEDULED, LIVE)
STARTABLE_STATUSES = (SCHEDULED,)
ENDABLE_STATUSES = (SCHEDULED, LIVE)


def can_join(status: str) -> bool:
    """A session may be joined only while waiting or live (state check only)."""
    return status in JOINABLE_STATUSES


def can_start(status: str) -> bool:
    return status in STARTABLE_STATUSES


def can_end(status: str) -> bool:
    return status in ENDABLE_STATUSES


def can_complete(status: str) -> bool:  # legacy alias (used by CompleteSession)
    return status in ENDABLE_STATUSES


def is_completed(status: str) -> bool:
    return status == COMPLETED


def join_window(scheduled_at, duration_minutes: int):
    """(opens_at, closes_at) for the join window around a scheduled session."""
    opens_at = scheduled_at - timedelta(minutes=EARLY_JOIN_MINUTES)
    closes_at = scheduled_at + timedelta(minutes=int(duration_minutes) + LATE_JOIN_GRACE_MINUTES)
    return opens_at, closes_at


def join_window_open(*, scheduled_at, duration_minutes, now) -> bool:
    opens_at, closes_at = join_window(scheduled_at, duration_minutes)
    return opens_at <= now <= closes_at


def is_expired(*, status, scheduled_at, duration_minutes, now) -> bool:
    """A still-waiting session whose join window has fully closed is expired."""
    if status != SCHEDULED:
        return False
    _, closes_at = join_window(scheduled_at, duration_minutes)
    return now > closes_at


def session_phase(*, status, scheduled_at, duration_minutes, now) -> str:
    """Present the lifecycle phase: waiting | live | completed | cancelled | expired."""
    if status == SCHEDULED:
        if is_expired(status=status, scheduled_at=scheduled_at, duration_minutes=duration_minutes, now=now):
            return EXPIRED
        return "waiting"
    return status
