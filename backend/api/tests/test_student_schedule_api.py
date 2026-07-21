"""
Availability-first weekly scheduling — API + generation tests.

The student picks only the weekday+time they're available (NO topic). The system
auto-assigns the nearest available instructor; an admin reviews (can reassign the
instructor) and approves; approval materialises bookings. The instructor then
authors each lesson (title + questions), revealed to the student ~1h before.
"""
from datetime import time, timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.common.enums import BookingStatus
from apps.common.factories import (
    make_active_subscription,
    make_admin,
    make_instructor,
    make_plan,
    make_student,
)
from apps.scheduling.models import Booking, RecurringAvailability, StudentScheduleSlot

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _tomorrow_weekday(now=None):
    now = now or timezone.now()
    return (timezone.localtime(now) + timedelta(days=1)).weekday()


def _world(sessions=4, with_window=False):
    """One instructor (available all week unless with_window), one funded student."""
    instructor = make_instructor()
    student = make_student()
    plan = make_plan(sessions_per_month=sessions)
    make_active_subscription(student, plan, sessions=sessions)
    if with_window:
        RecurringAvailability.objects.create(
            instructor=instructor, weekday=_tomorrow_weekday(),
            start_time=time(8, 0), end_time=time(22, 0),
        )
    return student, instructor


def _put_availability(student, picks):
    """picks: [{"weekday": int, "startTime": "HH:MM"}] — no topic."""
    return client_for(student.user).put(
        "/api/v1/student/schedule/", {"picks": picks}, format="json"
    )


def _approve(student, admin=None, slot_ids=None):
    admin = admin or make_admin()
    body = {"studentId": str(student.id)}
    if slot_ids is not None:
        body["slotIds"] = slot_ids
    return client_for(admin).post(
        "/api/v1/admin/schedule-requests/approve/", body, format="json"
    )


# ── availability → auto-assign → review → generate ────────────────────────────
def test_availability_autoassigns_instructor_and_waits_for_review():
    student, instructor = _world(sessions=4)
    wd = _tomorrow_weekday()
    resp = _put_availability(student, [{"weekday": wd, "startTime": "12:00"}])
    assert resp.status_code == 200, resp.data
    pick = resp.data["schedule"][0]
    assert pick["reviewStatus"] == "pending"
    assert pick["topicId"] is None                       # no student topic
    assert pick["instructorId"] == str(instructor.id)    # system auto-assigned
    assert resp.data["generated"]["created"] == 0        # nothing until approval
    assert resp.data["pendingReview"] == 1
    assert Booking.objects.filter(student=student).count() == 0

    ap = _approve(student)
    assert ap.status_code == 200, ap.data
    assert ap.data["generated"]["created"] == 2
    bookings = Booking.objects.filter(student=student, status=BookingStatus.UPCOMING)
    assert bookings.count() == 2
    assert all(b.topic_id is None and b.instructor_id == instructor.id for b in bookings)


def test_time_with_no_available_instructor_is_left_unassigned():
    # Instructor only free 08:00–22:00; a 23:00 pick matches nobody.
    student, instructor = _world(sessions=4, with_window=True)
    wd = _tomorrow_weekday()
    resp = _put_availability(student, [{"weekday": wd, "startTime": "23:00"}])
    assert resp.status_code == 200, resp.data
    assert resp.data["schedule"][0]["instructorId"] is None
    # Approving an unassigned pick generates nothing (waits for admin assignment).
    ap = _approve(student)
    assert ap.data["generated"]["created"] == 0
    assert Booking.objects.filter(student=student).count() == 0


def test_generation_stops_when_credits_run_out():
    student, instructor = _world(sessions=1)
    wd = _tomorrow_weekday()
    _put_availability(student, [{"weekday": wd, "startTime": "12:00"}])
    ap = _approve(student)
    assert ap.data["generated"]["created"] == 1
    assert ap.data["generated"]["outOfCredits"] is True
    assert Booking.objects.filter(student=student).count() == 1


def test_regenerating_is_idempotent_no_double_booking():
    student, instructor = _world(sessions=4)
    wd = _tomorrow_weekday()
    _put_availability(student, [{"weekday": wd, "startTime": "12:00"}])
    _approve(student)
    resp = _put_availability(student, [{"weekday": wd, "startTime": "12:00"}])
    assert resp.status_code == 200
    assert resp.data["schedule"][0]["reviewStatus"] == "approved"
    assert resp.data["generated"]["created"] == 0
    assert Booking.objects.filter(student=student, status=BookingStatus.UPCOMING).count() == 2


def test_get_schedule_returns_picks_and_upcoming():
    student, instructor = _world(sessions=4)
    wd = _tomorrow_weekday()
    _put_availability(student, [{"weekday": wd, "startTime": "12:00"}])
    _approve(student)
    resp = client_for(student.user).get("/api/v1/student/schedule/")
    assert resp.status_code == 200
    assert len(resp.data["schedule"]) == 1
    assert resp.data["schedule"][0]["reviewStatus"] == "approved"
    assert len(resp.data["upcoming"]) == 2
    # Lesson not prepared yet → hidden.
    assert resp.data["upcoming"][0]["lessonReady"] is False


def test_removing_a_pick_deactivates_it_but_keeps_generated_bookings():
    student, instructor = _world(sessions=6)
    wd1 = _tomorrow_weekday()
    wd2 = (wd1 + 1) % 7
    _put_availability(student, [
        {"weekday": wd1, "startTime": "12:00"},
        {"weekday": wd2, "startTime": "13:00"},
    ])
    _approve(student)
    created_first = Booking.objects.filter(student=student).count()
    assert created_first >= 2
    resp = _put_availability(student, [{"weekday": wd1, "startTime": "12:00"}])
    assert resp.status_code == 200
    assert len(resp.data["schedule"]) == 1
    assert Booking.objects.filter(student=student).count() == created_first


def test_topup_regenerates_approved_schedule():
    from apps.billing.models import Subscription
    from apps.billing.services import topup_subscription

    student, instructor = _world(sessions=1)
    wd = _tomorrow_weekday()
    _put_availability(student, [{"weekday": wd, "startTime": "12:00"}])
    _approve(student)
    assert Booking.objects.filter(student=student).count() == 1
    sub = Subscription.objects.filter(student=student).first()
    topup_subscription(sub, make_admin(), sessions=3)
    assert Booking.objects.filter(student=student).count() == 2


def test_cancelled_recurring_occurrence_is_not_recreated():
    from apps.scheduling.management.commands.generate_recurring_bookings import generate_all
    from apps.scheduling.services import cancel_booking

    student, instructor = _world(sessions=4)
    wd = _tomorrow_weekday()
    _put_availability(student, [{"weekday": wd, "startTime": "12:00"}])
    _approve(student)
    bookings = list(
        Booking.objects.filter(student=student, status=BookingStatus.UPCOMING).order_by("scheduled_at")
    )
    assert len(bookings) == 2
    cancel_booking(bookings[0])
    generate_all()
    assert Booking.objects.filter(student=student, status=BookingStatus.UPCOMING).count() == 1


def test_rolling_generation_command_is_idempotent():
    from apps.scheduling.management.commands.generate_recurring_bookings import generate_all

    student, instructor = _world(sessions=4)
    wd = _tomorrow_weekday()
    _put_availability(student, [{"weekday": wd, "startTime": "12:00"}])
    _approve(student)
    n = Booking.objects.filter(student=student).count()
    result = generate_all()
    assert result["students"] >= 1
    assert Booking.objects.filter(student=student).count() == n


# ── admin review gate ─────────────────────────────────────────────────────────
def test_admin_lists_pending_with_instructor_candidates():
    student, instructor = _world(sessions=4)
    wd = _tomorrow_weekday()
    _put_availability(student, [{"weekday": wd, "startTime": "12:00"}])
    admin = make_admin()
    resp = client_for(admin).get("/api/v1/admin/schedule-requests/")
    assert resp.status_code == 200
    group = resp.data[0]
    assert group["studentId"] == str(student.id)
    pick = group["picks"][0]
    assert pick["reviewStatus"] == "pending"
    cand_ids = {c["id"] for c in pick["instructorCandidates"]}
    assert str(instructor.id) in cand_ids


def test_admin_assigns_a_different_instructor():
    student, instructor = _world(sessions=4)
    other = make_instructor()  # also available all week
    wd = _tomorrow_weekday()
    put = _put_availability(student, [{"weekday": wd, "startTime": "12:00"}])
    slot_id = put.data["schedule"][0]["id"]
    admin = make_admin()
    resp = client_for(admin).post(
        "/api/v1/admin/schedule-requests/assign/",
        {"slotId": slot_id, "instructorId": str(other.id)},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["instructorId"] == str(other.id)


def test_admin_reject_marks_slot_and_blocks_generation():
    student, instructor = _world(sessions=4)
    wd = _tomorrow_weekday()
    put = _put_availability(student, [{"weekday": wd, "startTime": "12:00"}])
    slot_id = put.data["schedule"][0]["id"]
    admin = make_admin()
    resp = client_for(admin).post(
        "/api/v1/admin/schedule-requests/reject/",
        {"slotId": slot_id, "note": "Please pick an earlier time."},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["reviewStatus"] == "rejected"
    assert Booking.objects.filter(student=student).count() == 0


def test_admin_approve_only_specific_slots():
    student, instructor = _world(sessions=8)
    wd1 = _tomorrow_weekday()
    wd2 = (wd1 + 1) % 7
    put = _put_availability(student, [
        {"weekday": wd1, "startTime": "12:00"},
        {"weekday": wd2, "startTime": "13:00"},
    ])
    first_slot = put.data["schedule"][0]["id"]
    ap = _approve(student, slot_ids=[first_slot])
    assert ap.status_code == 200
    assert ap.data["approved"] == 1
    statuses = sorted(s.review_status for s in StudentScheduleSlot.objects.filter(student=student))
    assert statuses == ["approved", "pending"]


# ── instructor lesson authoring + 1h reveal ───────────────────────────────────
def test_instructor_prepares_lesson_and_student_sees_it_within_an_hour():
    student, instructor = _world(sessions=4)
    wd = _tomorrow_weekday()
    _put_availability(student, [{"weekday": wd, "startTime": "12:00"}])
    _approve(student)
    booking = Booking.objects.filter(student=student, status=BookingStatus.UPCOMING).order_by("scheduled_at").first()

    # Instructor sees the session in their lessons list, then authors the lesson.
    ic = client_for(instructor.user)
    lst = ic.get("/api/v1/instructor/lessons/")
    assert lst.status_code == 200
    assert any(x["bookingId"] == str(booking.id) for x in lst.data)

    prep = ic.post(
        f"/api/v1/instructor/bookings/{booking.id}/lesson/",
        {"title": "Job interviews", "questions": ["Tell me about yourself", "Your strengths?"]},
        format="json",
    )
    assert prep.status_code == 200, prep.data
    assert prep.data["lessonPrepared"] is True

    # Student: hidden while the session is >1h away.
    booking.refresh_from_db()
    from apps.scheduling.services import lesson_visible_to_student
    far = booking.scheduled_at - timedelta(hours=2)
    assert lesson_visible_to_student(booking, now=far) is False
    near = booking.scheduled_at - timedelta(minutes=30)
    assert lesson_visible_to_student(booking, now=near) is True


def test_instructor_gets_ai_suggested_questions_from_a_title():
    instructor = make_instructor()
    resp = client_for(instructor.user).post(
        "/api/v1/instructor/lessons/suggest-questions/",
        {"title": "Job interviews"},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert isinstance(resp.data["questions"], list)
    assert len(resp.data["questions"]) >= 1
    assert all(isinstance(q, str) and q.strip() for q in resp.data["questions"])


def test_instructor_cannot_prepare_others_session():
    student, instructor = _world(sessions=4)
    intruder = make_instructor()
    wd = _tomorrow_weekday()
    _put_availability(student, [{"weekday": wd, "startTime": "12:00"}])
    _approve(student)
    booking = Booking.objects.filter(student=student).first()
    resp = client_for(intruder.user).post(
        f"/api/v1/instructor/bookings/{booking.id}/lesson/",
        {"title": "x", "questions": []},
        format="json",
    )
    assert resp.status_code == 422
    assert resp.data["code"] == "not_your_session"


# ── instructor recurring availability ─────────────────────────────────────────
def test_instructor_sets_and_reads_recurring_availability():
    instructor = make_instructor()
    c = client_for(instructor.user)
    resp = c.put(
        "/api/v1/instructor/recurring-availability/",
        {"windows": [
            {"weekday": 0, "startTime": "08:00", "endTime": "12:00"},
            {"weekday": 2, "startTime": "18:00", "endTime": "22:00"},
        ]},
        format="json",
    )
    assert resp.status_code == 200
    assert len(resp.data) == 2
    got = c.get("/api/v1/instructor/recurring-availability/")
    assert got.status_code == 200
    assert [w["weekday"] for w in got.data] == [0, 2]
