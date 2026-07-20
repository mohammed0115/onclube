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


# ── Gap 3: time-first matching ────────────────────────────────────────────────
def test_candidates_lists_available_instructor_and_excludes_out_of_hours():
    student = make_student()
    ins = make_instructor()
    make_topic(ins)  # published
    RecurringAvailability.objects.create(instructor=ins, weekday=1, start_time=time(8, 0), end_time=time(20, 0))

    ok = client_for(student.user).get("/api/v1/student/schedule/candidates/?weekday=1&startTime=12:00")
    assert ok.status_code == 200
    assert any(c["instructorId"] == str(ins.id) for c in ok.data["candidates"])

    out = client_for(student.user).get("/api/v1/student/schedule/candidates/?weekday=1&startTime=22:00")
    assert all(c["instructorId"] != str(ins.id) for c in out.data["candidates"])


def test_candidates_requires_valid_params():
    student = make_student()
    r = client_for(student.user).get("/api/v1/student/schedule/candidates/?weekday=9&startTime=12:00")
    assert r.status_code == 400


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
    assert n.first().data["kind"] == "10min"


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
