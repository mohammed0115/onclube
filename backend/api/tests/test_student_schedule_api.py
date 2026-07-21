"""
Student-driven recurring weekly schedule — API + generation tests.

The student builds their OWN weekly timetable (weekday + time + topic); the system
materialises concrete bookings for the coming weeks from those picks, consuming one
session credit each and reusing the existing booking pipeline.
"""
from datetime import time, timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.common.enums import BookingStatus, SubscriptionStatus
from apps.common.factories import (
    make_active_subscription,
    make_admin,
    make_instructor,
    make_plan,
    make_student,
    make_topic,
)
from apps.scheduling.models import Booking, RecurringAvailability, StudentScheduleSlot

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _approve(student, admin=None, slot_ids=None):
    """Admin approves the student's pending picks → generates their bookings."""
    admin = admin or make_admin()
    body = {"studentId": str(student.id)}
    if slot_ids is not None:
        body["slotIds"] = slot_ids
    return client_for(admin).post(
        "/api/v1/admin/schedule-requests/approve/", body, format="json"
    )


def _tomorrow_weekday(now=None):
    now = now or timezone.now()
    return (timezone.localtime(now) + timedelta(days=1)).weekday()


def _world(sessions=4):
    instructor = make_instructor()
    student = make_student()
    plan = make_plan(sessions_per_month=sessions)
    make_active_subscription(student, plan, sessions=sessions)
    topic = make_topic(instructor)
    return student, instructor, topic


def _put_schedule(student, picks):
    return client_for(student.user).put(
        "/api/v1/student/schedule/", {"picks": picks}, format="json"
    )


# ── review gate + generation ──────────────────────────────────────────────────
def test_setting_schedule_is_pending_until_admin_approves():
    student, instructor, topic = _world(sessions=4)
    wd = _tomorrow_weekday()
    resp = _put_schedule(
        student, [{"weekday": wd, "startTime": "12:00", "topicId": str(topic.id)}]
    )
    assert resp.status_code == 200, resp.data
    assert len(resp.data["schedule"]) == 1
    # New pick is PENDING — nothing is booked yet.
    assert resp.data["schedule"][0]["reviewStatus"] == "pending"
    assert resp.data["generated"]["created"] == 0
    assert resp.data["pendingReview"] == 1
    assert Booking.objects.filter(student=student).count() == 0

    # Admin approves → the 2-week horizon materialises 2 bookings.
    ap = _approve(student)
    assert ap.status_code == 200, ap.data
    assert ap.data["approved"] == 1
    assert ap.data["generated"]["created"] == 2
    assert ap.data["generated"]["outOfCredits"] is False

    bookings = Booking.objects.filter(student=student, status=BookingStatus.UPCOMING)
    assert bookings.count() == 2
    assert all(b.schedule_slot_id is not None for b in bookings)

    student.refresh_from_db()
    assert student.sessions_remaining == 2  # 4 − 2 generated


def test_generation_stops_when_credits_run_out():
    student, instructor, topic = _world(sessions=1)
    wd = _tomorrow_weekday()
    resp = _put_schedule(
        student, [{"weekday": wd, "startTime": "12:00", "topicId": str(topic.id)}]
    )
    assert resp.status_code == 200
    assert resp.data["generated"]["created"] == 0  # pending, not yet booked
    ap = _approve(student)
    assert ap.data["generated"]["created"] == 1  # only one credit
    assert ap.data["generated"]["outOfCredits"] is True
    assert Booking.objects.filter(student=student).count() == 1


def test_regenerating_is_idempotent_no_double_booking():
    student, instructor, topic = _world(sessions=4)
    wd = _tomorrow_weekday()
    _put_schedule(student, [{"weekday": wd, "startTime": "12:00", "topicId": str(topic.id)}])
    _approve(student)  # 2 bookings created
    # Second identical save leaves the pick APPROVED and must not double-book.
    resp = _put_schedule(
        student, [{"weekday": wd, "startTime": "12:00", "topicId": str(topic.id)}]
    )
    assert resp.status_code == 200
    assert resp.data["schedule"][0]["reviewStatus"] == "approved"
    assert resp.data["generated"]["created"] == 0
    assert Booking.objects.filter(student=student, status=BookingStatus.UPCOMING).count() == 2


# ── availability windows ──────────────────────────────────────────────────────
def test_pick_outside_instructor_window_is_rejected():
    student, instructor, topic = _world()
    RecurringAvailability.objects.create(
        instructor=instructor, weekday=_tomorrow_weekday(),
        start_time=time(8, 0), end_time=time(10, 0),
    )
    resp = _put_schedule(
        student, [{"weekday": _tomorrow_weekday(), "startTime": "12:00", "topicId": str(topic.id)}]
    )
    assert resp.status_code == 422
    assert resp.data["code"] == "outside_availability"
    assert StudentScheduleSlot.objects.filter(student=student).count() == 0


def test_pick_inside_instructor_window_is_accepted():
    student, instructor, topic = _world()
    wd = _tomorrow_weekday()
    RecurringAvailability.objects.create(
        instructor=instructor, weekday=wd, start_time=time(8, 0), end_time=time(22, 0),
    )
    resp = _put_schedule(
        student, [{"weekday": wd, "startTime": "12:00", "topicId": str(topic.id)}]
    )
    assert resp.status_code == 200
    assert len(resp.data["schedule"]) == 1


# ── reads ─────────────────────────────────────────────────────────────────────
def test_get_schedule_returns_picks_and_upcoming():
    student, instructor, topic = _world(sessions=4)
    wd = _tomorrow_weekday()
    _put_schedule(student, [{"weekday": wd, "startTime": "12:00", "topicId": str(topic.id)}])
    _approve(student)
    resp = client_for(student.user).get("/api/v1/student/schedule/")
    assert resp.status_code == 200
    assert len(resp.data["schedule"]) == 1
    assert resp.data["schedule"][0]["topicId"] == str(topic.id)
    assert resp.data["schedule"][0]["reviewStatus"] == "approved"
    assert len(resp.data["upcoming"]) == 2


def test_windows_endpoint_resolves_instructor_from_topic():
    student, instructor, topic = _world()
    wd = _tomorrow_weekday()
    RecurringAvailability.objects.create(
        instructor=instructor, weekday=wd, start_time=time(8, 0), end_time=time(22, 0),
    )
    resp = client_for(student.user).get(f"/api/v1/student/schedule/windows/?topicId={topic.id}")
    assert resp.status_code == 200
    assert resp.data["instructorId"] == str(instructor.id)
    assert len(resp.data["windows"]) == 1
    assert resp.data["windows"][0]["startTime"] == "08:00"


def test_removing_a_pick_deactivates_it_but_keeps_generated_bookings():
    student, instructor, topic = _world(sessions=6)
    wd1 = _tomorrow_weekday()
    wd2 = (wd1 + 1) % 7
    _put_schedule(
        student,
        [
            {"weekday": wd1, "startTime": "12:00", "topicId": str(topic.id)},
            {"weekday": wd2, "startTime": "13:00", "topicId": str(topic.id)},
        ],
    )
    _approve(student)
    created_first = Booking.objects.filter(student=student).count()
    assert created_first >= 2
    # Drop the second pick.
    resp = _put_schedule(
        student, [{"weekday": wd1, "startTime": "12:00", "topicId": str(topic.id)}]
    )
    assert resp.status_code == 200
    assert len(resp.data["schedule"]) == 1
    # Already-generated bookings from the dropped pick are preserved.
    assert Booking.objects.filter(student=student).count() == created_first


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


# ── admin review gate ─────────────────────────────────────────────────────────
def test_admin_lists_pending_schedule_requests_grouped_by_student():
    student, instructor, topic = _world(sessions=4)
    wd = _tomorrow_weekday()
    _put_schedule(student, [{"weekday": wd, "startTime": "12:00", "topicId": str(topic.id)}])
    admin = make_admin()
    resp = client_for(admin).get("/api/v1/admin/schedule-requests/")
    assert resp.status_code == 200
    assert len(resp.data) == 1
    group = resp.data[0]
    assert group["studentId"] == str(student.id)
    assert len(group["picks"]) == 1
    assert group["picks"][0]["reviewStatus"] == "pending"


def test_admin_reject_marks_slot_and_blocks_generation():
    student, instructor, topic = _world(sessions=4)
    wd = _tomorrow_weekday()
    put = _put_schedule(student, [{"weekday": wd, "startTime": "12:00", "topicId": str(topic.id)}])
    slot_id = put.data["schedule"][0]["id"]
    admin = make_admin()
    resp = client_for(admin).post(
        "/api/v1/admin/schedule-requests/reject/",
        {"slotId": slot_id, "note": "Please pick an earlier time."},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["reviewStatus"] == "rejected"
    assert resp.data["reviewNote"] == "Please pick an earlier time."
    # A rejected pick never materialises bookings.
    slot = StudentScheduleSlot.objects.get(pk=slot_id)
    assert slot.review_status == "rejected"
    assert Booking.objects.filter(student=student).count() == 0


def test_admin_approve_only_specific_slots():
    student, instructor, topic = _world(sessions=8)
    wd1 = _tomorrow_weekday()
    wd2 = (wd1 + 1) % 7
    put = _put_schedule(
        student,
        [
            {"weekday": wd1, "startTime": "12:00", "topicId": str(topic.id)},
            {"weekday": wd2, "startTime": "13:00", "topicId": str(topic.id)},
        ],
    )
    first_slot = put.data["schedule"][0]["id"]
    ap = _approve(student, slot_ids=[first_slot])
    assert ap.status_code == 200
    assert ap.data["approved"] == 1
    # Only the approved pick generated bookings; the other stays pending.
    statuses = sorted(s.review_status for s in StudentScheduleSlot.objects.filter(student=student))
    assert statuses == ["approved", "pending"]
