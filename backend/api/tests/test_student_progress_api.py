"""Student progress dashboard API — session-over-session comparison."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.ai_reports.models import AIReport
from apps.common.enums import AIReportStatus, BookingStatus, SessionStatus
from apps.common.factories import (
    make_active_subscription,
    make_instructor,
    make_plan,
    make_session,
    make_student,
    make_topic,
)
from apps.scheduling.models import AvailabilitySlot, Booking

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _ready_report(student, instructor, topic, subscription, *, overall, grammar, fluency, when):
    # One booking per report, all sharing the student's single active subscription
    # (the unique-active-subscription constraint forbids a second one).
    slot = AvailabilitySlot.objects.create(instructor=instructor, start_at=when, duration_minutes=45)
    booking = Booking.objects.create(
        student=student, topic=topic, topic_title=topic.title,
        instructor=instructor, instructor_name=instructor.user.full_name,
        slot=slot, subscription=subscription, scheduled_at=when,
        duration_minutes=45, status=BookingStatus.COMPLETED,
    )
    session = make_session(booking, status=SessionStatus.COMPLETED, agora_channel=f"c-{overall}-{when.day}")
    return AIReport.objects.create(
        session=session, booking=booking, student=student,
        topic_title=booking.topic_title, instructor_name=booking.instructor_name,
        session_date=when, duration_minutes=45, overall_score=overall,
        skills=[
            {"label": "Grammar", "value": grammar, "color": "#7C3AED"},
            {"label": "Fluency", "value": fluency, "color": "#10B981"},
        ],
        status=AIReportStatus.READY, generated_at=timezone.now(),
    )


def test_progress_returns_overall_and_per_skill_deltas():
    student = make_student()
    instructor = make_instructor()
    topic = make_topic(instructor)
    sub = make_active_subscription(student, make_plan(), sessions=4)
    now = timezone.now()
    _ready_report(student, instructor, topic, sub, overall=70, grammar=40, fluency=72, when=now - timedelta(days=7))
    _ready_report(student, instructor, topic, sub, overall=75, grammar=45, fluency=71, when=now - timedelta(days=1))

    resp = client_for(student.user).get("/api/v1/student/progress/")
    assert resp.status_code == 200
    data = resp.data
    assert data["sessionsCount"] == 2
    assert data["overall"]["current"] == 75
    assert data["overall"]["previous"] == 70
    assert data["overall"]["delta"] == 5

    grammar = next(s for s in data["skills"] if s["label"] == "Grammar")
    assert grammar["current"] == 45 and grammar["delta"] == 5
    assert [p["value"] for p in grammar["series"]] == [40, 45]
    assert "improved" in data["message"].lower()


def test_progress_empty_for_new_student():
    student = make_student()
    resp = client_for(student.user).get("/api/v1/student/progress/")
    assert resp.status_code == 200
    assert resp.data["sessionsCount"] == 0
    assert resp.data["skills"] == []


def test_progress_requires_auth():
    assert APIClient().get("/api/v1/student/progress/").status_code == 401
