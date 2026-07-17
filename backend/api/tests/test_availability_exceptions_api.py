"""Availability exceptions (vacation/holiday/block) + their booking guard."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.common.enums import BookingStatus
from apps.common.factories import (
    make_active_subscription,
    make_instructor,
    make_plan,
    make_slot,
    make_student,
    make_topic,
)
from apps.scheduling.models import AvailabilityException
from apps.scheduling.services import create_booking

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _range(days_from_now=2, hours=48):
    start = timezone.now() + timedelta(days=days_from_now)
    return start, start + timedelta(hours=hours)


def test_instructor_adds_lists_and_deletes_an_exception():
    inst = make_instructor()
    c = client_for(inst.user)
    start, end = _range()
    resp = c.post(
        "/api/v1/instructor/availability/exceptions/",
        {"kind": "vacation", "startAt": start.isoformat(), "endAt": end.isoformat(), "note": "Eid break"},
        format="json",
    )
    assert resp.status_code == 201 and resp.data["kind"] == "vacation"
    exc_id = resp.data["id"]

    listed = c.get("/api/v1/instructor/availability/exceptions/")
    assert listed.status_code == 200 and len(listed.data) == 1

    deleted = c.delete(f"/api/v1/instructor/availability/exceptions/{exc_id}/")
    assert deleted.status_code == 200
    assert AvailabilityException.objects.count() == 0


def test_rejects_inverted_range():
    inst = make_instructor()
    start = timezone.now() + timedelta(days=2)
    resp = client_for(inst.user).post(
        "/api/v1/instructor/availability/exceptions/",
        {"kind": "block", "startAt": start.isoformat(), "endAt": (start - timedelta(hours=1)).isoformat()},
        format="json",
    )
    assert resp.status_code == 422 and resp.data["code"] == "invalid_exception_range"


def test_booking_blocked_when_slot_falls_in_an_exception():
    inst = make_instructor()
    student = make_student()
    make_active_subscription(student, make_plan(), sessions=4)
    topic = make_topic(inst)
    slot_time = timezone.now() + timedelta(days=3)
    slot = make_slot(inst, start_at=slot_time)
    # Instructor blocks a window covering the slot.
    AvailabilityException.objects.create(
        instructor=inst, kind="vacation", start_at=slot_time - timedelta(hours=1), end_at=slot_time + timedelta(hours=1)
    )
    from apps.common.exceptions import BusinessRuleError
    with pytest.raises(BusinessRuleError) as exc:
        create_booking(student, topic, slot)
    assert exc.value.code == "instructor_unavailable"


def test_open_slots_exclude_exception_covered_slots():
    from infrastructure.repositories.django import DjangoBookingRepository

    inst = make_instructor()
    t = timezone.now() + timedelta(days=2)
    make_slot(inst, start_at=t)  # inside exception
    make_slot(inst, start_at=t + timedelta(days=5))  # outside
    AvailabilityException.objects.create(
        instructor=inst, kind="holiday", start_at=t - timedelta(hours=1), end_at=t + timedelta(hours=1)
    )
    open_slots = DjangoBookingRepository().list_open_slots(inst.id)
    assert len(open_slots) == 1
