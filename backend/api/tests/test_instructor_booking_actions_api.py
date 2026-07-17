"""Part 6 — instructor cancel + reschedule their own bookings."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.common.enums import BookingStatus, SlotStatus
from apps.common.factories import make_booking, make_slot
from apps.scheduling.models import AvailabilitySlot

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_instructor_lists_and_cancels_own_booking():
    b = make_booking()
    c = client_for(b.instructor.user)
    listed = c.get("/api/v1/instructor/bookings/")
    assert listed.status_code == 200 and len(listed.data) == 1

    resp = c.post(f"/api/v1/instructor/bookings/{b.id}/cancel/")
    assert resp.status_code == 200
    b.refresh_from_db()
    assert b.status == BookingStatus.CANCELLED


def test_instructor_reschedules_to_another_open_slot():
    b = make_booking()
    new_slot = make_slot(b.instructor, start_at=timezone.now() + timedelta(days=5))
    resp = client_for(b.instructor.user).post(
        f"/api/v1/instructor/bookings/{b.id}/reschedule/",
        {"newSlotId": str(new_slot.id)}, format="json",
    )
    assert resp.status_code == 200
    b.refresh_from_db()
    assert b.slot_id == new_slot.id
    AvailabilitySlot.objects.get(pk=new_slot.id).status == SlotStatus.BOOKED


def test_instructor_cannot_cancel_another_instructors_booking():
    b = make_booking()
    other = make_booking()  # different instructor
    resp = client_for(other.instructor.user).post(f"/api/v1/instructor/bookings/{b.id}/cancel/")
    assert resp.status_code in (403, 404)
    b.refresh_from_db()
    assert b.status == BookingStatus.UPCOMING
