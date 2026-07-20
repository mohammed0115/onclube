"""
Duration-based subscription plans (migration 0006) — catalog + pricing invariant.

The plans are seeded by the data migration, so they exist in every test DB.
"""
import pytest

from apps.billing.models import Plan

pytestmark = pytest.mark.django_db

SESSION_PRICE = 15000
EXPECTED = {
    "session": (1, 7),
    "week": (3, 7),
    "two-weeks": (6, 14),
    "month": (12, 30),
    "quarter": (36, 90),
    "half-year": (72, 180),
    "year": (144, 365),
}


def test_seven_duration_plans_are_active():
    codes = set(Plan.objects.filter(active=True).values_list("code", flat=True))
    assert set(EXPECTED).issubset(codes)


def test_price_is_always_sessions_times_session_price():
    for code, (sessions, days) in EXPECTED.items():
        plan = Plan.objects.get(code=code)
        assert plan.sessions_per_month == sessions
        assert plan.billing_period_days == days
        assert int(plan.price) == sessions * SESSION_PRICE, code
        assert plan.currency == "SDG"


def test_week_is_three_sessions_and_month_is_twelve():
    assert Plan.objects.get(code="week").sessions_per_month == 3
    assert Plan.objects.get(code="month").sessions_per_month == 12
    # A month (12) is four weeks of 3 sessions.
    assert Plan.objects.get(code="month").sessions_per_month == 4 * Plan.objects.get(code="week").sessions_per_month


def test_old_fixed_plans_are_retired_if_present():
    # If a legacy plan exists at all, the migration must have deactivated it.
    for code in ("starter", "growth", "intensive"):
        legacy = Plan.objects.filter(code=code).first()
        if legacy is not None:
            assert legacy.active is False
