"""Pure billing rules."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta


@dataclass(frozen=True)
class ActivationSpec:
    started_at: datetime
    expires_at: datetime
    sessions_remaining: int


def activation_spec(*, now: datetime, billing_period_days: int,
                    sessions_per_month: int) -> ActivationSpec:
    """
    Compute the fields that make a subscription active on approval (§2.2).

    Pure: given the moment of approval and the plan terms, returns the dates and
    session grant. No rollover — sessions are exactly the plan allotment.
    """
    return ActivationSpec(
        started_at=now,
        expires_at=now + timedelta(days=billing_period_days),
        sessions_remaining=sessions_per_month,
    )
