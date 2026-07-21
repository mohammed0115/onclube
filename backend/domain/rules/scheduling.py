"""Pure scheduling rules — bookability and the cancellation credit window."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Iterable, Optional, Tuple

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


def is_covered_by_intervals(dt, intervals) -> bool:
    """True if `dt` falls inside any half-open [start, end) interval — used to test
    whether a slot time lands within an instructor's availability exception."""
    return any(start <= dt < end for start, end in intervals)


# ── recurring weekly schedule (student-driven) ────────────────────────────────
def time_within_windows(t: time, windows: Iterable[Tuple[time, time]]) -> bool:
    """True if `t` falls inside any half-open [start, end) time window. An empty
    window list means "no restriction" and always returns True. NOTE: this is a
    permissive filter — for the availability-first matching rule (where an instructor
    must have explicitly opted in) use `has_covering_window` instead."""
    windows = list(windows)
    if not windows:
        return True
    return any(start <= t < end for start, end in windows)


def has_covering_window(t: time, windows: Iterable[Tuple[time, time]]) -> bool:
    """True only if `t` falls inside an explicit half-open [start, end) window.

    Unlike `time_within_windows`, an empty list means NO availability (the
    instructor has not declared this time) — not "available always". This is the
    availability-first matching rule: an instructor is matched only at times they
    explicitly opted into, so clearing the grid (or having no window on that
    weekday) means "unavailable", never "available 24/7"."""
    return any(start <= t < end for start, end in windows)


def upcoming_dates_for_weekday(
    *, weekday: int, reference: date, count: int, include_today: bool = True
) -> list[date]:
    """The next `count` calendar dates that fall on `weekday` (0=Mon … 6=Sun),
    starting from `reference`. When `include_today` is True and `reference` already
    is that weekday, `reference` is the first date returned; otherwise it starts at
    the next occurrence. Pure — no timezone, no clock."""
    if not (0 <= weekday <= 6):
        raise ValueError("weekday must be 0..6 (Monday..Sunday)")
    delta = (weekday - reference.weekday()) % 7
    if delta == 0 and not include_today:
        delta = 7
    first = reference + timedelta(days=delta)
    return [first + timedelta(days=7 * i) for i in range(max(count, 0))]


def calendar_slot_status(*, slot_status, start_at, now, open_value="open",
                         booked_value="booked", blocked_value="blocked") -> str:
    """Present a slot's status for the weekly calendar. A booked slot whose start
    time has passed is shown as `completed`. An open slot in the past is NOT
    selectable (shown as `blocked`) so a student can never book a slot that is
    already in the past and would be born `Missed`. Only `available` is selectable."""
    if slot_status == open_value:
        return "blocked" if start_at < now else "available"
    if slot_status == blocked_value:
        return "blocked"
    if slot_status == booked_value:
        return "completed" if start_at < now else "booked"
    return slot_status
