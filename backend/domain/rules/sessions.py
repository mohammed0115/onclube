"""Pure session state rules."""
from __future__ import annotations

# Mirror of apps.common.enums.SessionStatus values, kept as plain strings so this
# module stays framework-free.
JOINABLE_STATUSES = ("scheduled", "live")
COMPLETABLE_STATUSES = ("scheduled", "live")


def can_join(status: str) -> bool:
    """A session may be joined while scheduled or live."""
    return status in JOINABLE_STATUSES


def can_complete(status: str) -> bool:
    """Only a scheduled/live session can transition to completed."""
    return status in COMPLETABLE_STATUSES


def is_completed(status: str) -> bool:
    return status == "completed"
