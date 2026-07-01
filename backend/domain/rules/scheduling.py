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
