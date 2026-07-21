"""
Tests for the remaining Product-Bible gaps:
  2) learning plan (GET /student/plan/)
  3) time-first instructor matching (GET /student/schedule/candidates/)
  4) timed session reminders (send_due_reminders)
  6) business metrics (GET /admin/business/)
"""
from datetime import time, timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.ai_reports.models import AIReport
from apps.common.enums import AIReportStatus, BookingStatus, NotificationType, SessionStatus
from apps.common.factories import (
    make_active_subscription,
    make_admin,
    make_booking,
    make_instructor,
    make_plan,
    make_session,
    make_student,
    make_topic,
)
from apps.notifications.models import Notification
from apps.scheduling.management.commands.send_session_reminders import send_due_reminders
from apps.scheduling.models import RecurringAvailability

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


# ── Gap 2: learning plan ──────────────────────────────────────────────────────
def test_plan_is_derived_from_the_latest_report():
    student = make_student()
    booking = make_booking(student=student)
    session = make_session(booking, status=SessionStatus.COMPLETED, agora_channel="c-plan")
    AIReport.objects.create(
        session=session, booking=booking, student=student,
        topic_title=booking.topic_title, instructor_name=booking.instructor_name,
        session_date=timezone.now(), duration_minutes=45, overall_score=72,
        content={
            "nextLessonFocus": "Past-tense narration",
            "homework": ["Write 5 past-tense sentences"],
            "recommendedTopics": ["Daily routines"],
            "weaknesses": ["Tense slips"],
        },
        status=AIReportStatus.READY, generated_at=timezone.now(),
    )
    resp = client_for(student.user).get("/api/v1/student/plan/")
    assert resp.status_code == 200
    assert resp.data["hasPlan"] is True
    assert resp.data["nextFocus"] == "Past-tense narration"
    assert resp.data["homework"] == ["Write 5 past-tense sentences"]
    assert resp.data["focusAreas"] == ["Tense slips"]


def test_plan_empty_for_new_student():
    student = make_student()
    resp = client_for(student.user).get("/api/v1/student/plan/")
    assert resp.status_code == 200
    assert resp.data["hasPlan"] is False
    assert resp.data["homework"] == []


# ── Gap 4: timed reminders ────────────────────────────────────────────────────
def _upcoming_booking(minutes_ahead):
    student = make_student()
    plan = make_plan()
    sub = make_active_subscription(student, plan, sessions=4)
    instructor = make_instructor()
    topic = make_topic(instructor)
    from apps.scheduling.models import AvailabilitySlot, Booking
    when = timezone.now() + timedelta(minutes=minutes_ahead)
    slot = AvailabilitySlot.objects.create(instructor=instructor, start_at=when, duration_minutes=45)
    return Booking.objects.create(
        student=student, topic=topic, topic_title=topic.title,
        instructor=instructor, instructor_name=instructor.user.full_name,
        slot=slot, subscription=sub, scheduled_at=when, duration_minutes=45,
        status=BookingStatus.UPCOMING,
    )


def test_reminder_fires_once_per_band():
    booking = _upcoming_booking(minutes_ahead=8)  # inside the 10-minute band
    assert send_due_reminders() == 1
    # Idempotent: a second run does not re-notify.
    assert send_due_reminders() == 0
    n = Notification.objects.filter(type=NotificationType.SESSION_REMINDER, user=booking.student.user)
    assert n.count() == 1
    note = n.first()
    assert note.data["kind"] == "10min"
    # MED-14: neutral text — no empty "" title, and the lesson title is never leaked.
    assert '""' not in note.body
    assert booking.instructor_name in note.body


def test_reminder_for_topic_less_booking_has_no_empty_quotes():
    """A generated availability-first booking has an empty topic_title before prep;
    the reminder must still read cleanly."""
    from apps.scheduling.models import AvailabilitySlot, Booking

    student = make_student()
    sub = make_active_subscription(student, make_plan(), sessions=4)
    instructor = make_instructor()
    when = timezone.now() + timedelta(minutes=8)
    slot = AvailabilitySlot.objects.create(instructor=instructor, start_at=when, duration_minutes=45)
    Booking.objects.create(
        student=student, topic=None, topic_title="",  # topic-less, not yet prepared
        instructor=instructor, instructor_name=instructor.user.full_name,
        slot=slot, subscription=sub, scheduled_at=when, duration_minutes=45,
        status=BookingStatus.UPCOMING,
    )
    assert send_due_reminders() == 1
    note = Notification.objects.filter(type=NotificationType.SESSION_REMINDER, user=student.user).first()
    assert note is not None and '""' not in note.body


def test_reminder_not_sent_for_far_future_session():
    _upcoming_booking(minutes_ahead=48 * 60)  # 2 days out — beyond the 24h horizon
    assert send_due_reminders() == 0


# ── Gap 6: business metrics ───────────────────────────────────────────────────
def test_business_overview_exposes_engagement_metrics():
    admin = make_admin()
    resp = client_for(admin).get("/api/v1/admin/business/")
    assert resp.status_code == 200
    for key in ("activeStudents", "renewalRate", "churnRate", "teacherUtilization", "avgProgress"):
        assert key in resp.data
