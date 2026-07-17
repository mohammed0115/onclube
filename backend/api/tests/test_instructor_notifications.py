"""Part 7 — instructor notifications on booking/cancel + dashboard stats."""
import pytest

from apps.common.enums import BookingStatus, NotificationType
from apps.common.factories import make_booking
from apps.notifications.models import Notification
from apps.scheduling.services import cancel_booking

pytestmark = pytest.mark.django_db


def test_instructor_notified_on_new_booking():
    b = make_booking()
    notes = Notification.objects.filter(user=b.instructor.user, type=NotificationType.NEW_BOOKING)
    assert notes.count() == 1
    assert str(b.pk) in str(notes.first().data)


def test_both_parties_notified_on_cancel():
    b = make_booking()
    cancel_booking(b)
    assert Notification.objects.filter(user=b.student.user, type=NotificationType.BOOKING_CANCELLED).exists()
    assert Notification.objects.filter(user=b.instructor.user, type=NotificationType.BOOKING_CANCELLED).exists()


def test_instructor_dashboard_reports_teaching_stats():
    from rest_framework.test import APIClient

    b = make_booking()
    b.status = BookingStatus.COMPLETED
    b.save(update_fields=["status"])
    c = APIClient()
    c.force_authenticate(user=b.instructor.user)
    resp = c.get("/api/v1/instructor/dashboard/")
    assert resp.status_code == 200
    assert resp.data["completedSessions"] == 1
    assert resp.data["teachingHours"] > 0
    assert "cancellationRate" in resp.data
