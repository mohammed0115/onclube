"""
Journey 4 — Booking Engine — API tests (Sprint 7).

Covers the weekly calendar, admin bookings (list + PATCH), and reinforces the
booking business rules end-to-end (credit reservation, rollback, no double
booking, ownership/permissions, and question unlocking).
"""
from datetime import datetime, time, timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.common.enums import BookingStatus, SlotStatus
from apps.common.factories import (
    make_active_subscription,
    make_admin,
    make_instructor,
    make_plan,
    make_slot,
    make_student,
    make_topic,
)
from apps.scheduling.models import AvailabilitySlot, Booking

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _monday_iso(dt):
    d = dt.date()
    return (d - timedelta(days=d.weekday())).isoformat()


def _world(sessions=4, days_ahead=1):
    instructor = make_instructor()
    student = make_student()
    plan = make_plan(sessions_per_month=sessions)
    make_active_subscription(student, plan, sessions=sessions)
    topic = make_topic(instructor)
    slot = make_slot(instructor, days_ahead=days_ahead)
    return student, instructor, topic, slot


# ── weekly calendar ───────────────────────────────────────────────────────────
def test_calendar_returns_seven_days_with_available_slot():
    student, instructor, topic, slot = _world()
    resp = client_for(student.user).get(
        f"/api/v1/student/calendar/?topicId={topic.id}&weekStart={_monday_iso(slot.start_at)}"
    )
    assert resp.status_code == 200
    data = resp.data
    assert data["topicId"] == str(topic.id)
    assert [d["weekday"] for d in data["days"]] == [
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    ]
    all_slots = [sl for d in data["days"] for sl in d["slots"]]
    assert any(sl["id"] == str(slot.id) and sl["status"] == "available" for sl in all_slots)


def test_calendar_requires_topic_id():
    student = make_student()
    resp = client_for(student.user).get("/api/v1/student/calendar/")
    assert resp.status_code == 400
    assert resp.data["code"] == "validation_error"


def test_calendar_requires_authentication():
    assert APIClient().get("/api/v1/student/calendar/?topicId=x").status_code == 401


def test_calendar_slot_statuses_available_booked_blocked_completed():
    student, instructor, topic, _ = _world()
    now = timezone.now()
    this_monday = now.date() - timedelta(days=now.weekday())
    next_monday = this_monday + timedelta(days=7)
    prev_monday = this_monday - timedelta(days=7)

    def at(monday, offset):
        return timezone.make_aware(datetime.combine(monday + timedelta(days=offset), time(12, 0)))

    # All in NEXT week (future) → open=available, booked=booked, blocked=blocked.
    open_slot = AvailabilitySlot.objects.create(instructor=instructor, start_at=at(next_monday, 0))
    booked = AvailabilitySlot.objects.create(instructor=instructor, start_at=at(next_monday, 1), status=SlotStatus.BOOKED)
    blocked = AvailabilitySlot.objects.create(instructor=instructor, start_at=at(next_monday, 2), status=SlotStatus.BLOCKED)
    resp = client_for(student.user).get(
        f"/api/v1/student/calendar/?topicId={topic.id}&weekStart={next_monday.isoformat()}"
    )
    by_id = {sl["id"]: sl["status"] for d in resp.data["days"] for sl in d["slots"]}
    assert by_id[str(open_slot.id)] == "available"
    assert by_id[str(booked.id)] == "booked"
    assert by_id[str(blocked.id)] == "blocked"

    # A booked slot in the PAST week → completed.
    past = AvailabilitySlot.objects.create(instructor=instructor, start_at=at(prev_monday, 1), status=SlotStatus.BOOKED)
    past_resp = client_for(student.user).get(
        f"/api/v1/student/calendar/?topicId={topic.id}&weekStart={prev_monday.isoformat()}"
    )
    past_ids = {sl["id"]: sl["status"] for d in past_resp.data["days"] for sl in d["slots"]}
    assert past_ids[str(past.id)] == "completed"


# ── full booking flow + credit reservation ───────────────────────────────────
def test_book_reserves_exactly_one_credit_and_confirms():
    student, instructor, topic, slot = _world(sessions=4)
    resp = client_for(student.user).post(
        "/api/v1/student/bookings/", {"topicId": str(topic.id), "slotId": str(slot.id)}, format="json"
    )
    assert resp.status_code == 201
    assert resp.data["status"] == "upcoming"
    assert resp.data["sessionsRemaining"] == 3  # exactly one credit consumed
    slot.refresh_from_db()
    assert slot.status == SlotStatus.BOOKED


def test_booking_rolls_back_when_no_credits_left():
    instructor = make_instructor()
    student = make_student()
    plan = make_plan(sessions_per_month=0)
    make_active_subscription(student, plan, sessions=0)  # no credits
    topic = make_topic(instructor)
    slot = make_slot(instructor, days_ahead=1)

    resp = client_for(student.user).post(
        "/api/v1/student/bookings/", {"topicId": str(topic.id), "slotId": str(slot.id)}, format="json"
    )
    assert resp.status_code == 409
    assert resp.data["code"] == "no_sessions_remaining"
    # Nothing partially created — no booking, slot still open.
    assert not Booking.objects.filter(slot=slot).exists()
    slot.refresh_from_db()
    assert slot.status == SlotStatus.OPEN


def test_double_booking_same_slot_is_blocked():
    student_a, instructor, topic, slot = _world()
    assert client_for(student_a.user).post(
        "/api/v1/student/bookings/", {"topicId": str(topic.id), "slotId": str(slot.id)}, format="json"
    ).status_code == 201

    student_b = make_student()
    make_active_subscription(student_b, make_plan(), sessions=4)
    resp = client_for(student_b.user).post(
        "/api/v1/student/bookings/", {"topicId": str(topic.id), "slotId": str(slot.id)}, format="json"
    )
    assert resp.status_code == 409
    assert resp.data["code"] == "slot_unavailable"


# ── questions unlock (BR-020) ─────────────────────────────────────────────────
def test_questions_locked_until_booking_then_unlocked():
    student, instructor, topic, slot = _world()
    sc = client_for(student.user)

    # Before booking: preview only, and the questions endpoint is forbidden.
    before = sc.get(f"/api/v1/student/topics/{topic.id}/")
    assert before.data["mode"] == "preview"
    assert sc.get(f"/api/v1/student/topics/{topic.id}/questions/").status_code == 403

    sc.post("/api/v1/student/bookings/", {"topicId": str(topic.id), "slotId": str(slot.id)}, format="json")

    # After booking: full topic with approved questions, and the endpoint unlocks.
    after = sc.get(f"/api/v1/student/topics/{topic.id}/")
    assert after.data["mode"] == "full"
    assert len(after.data["questions"]) >= 1
    assert sc.get(f"/api/v1/student/topics/{topic.id}/questions/").status_code == 200


# ── ownership / permissions ───────────────────────────────────────────────────
def test_student_cannot_cancel_another_students_booking():
    student_a, instructor, topic, slot = _world()
    booking = client_for(student_a.user).post(
        "/api/v1/student/bookings/", {"topicId": str(topic.id), "slotId": str(slot.id)}, format="json"
    ).data
    other = make_student()
    resp = client_for(other.user).delete(f"/api/v1/student/bookings/{booking['bookingId']}/")
    assert resp.status_code == 403


# ── admin bookings ────────────────────────────────────────────────────────────
def test_admin_can_list_all_bookings():
    student, instructor, topic, slot = _world()
    client_for(student.user).post(
        "/api/v1/student/bookings/", {"topicId": str(topic.id), "slotId": str(slot.id)}, format="json"
    )
    resp = client_for(make_admin()).get("/api/v1/admin/bookings/")
    assert resp.status_code == 200
    assert len(resp.data) >= 1
    assert resp.data[0]["studentName"] and resp.data[0]["status"]


def test_admin_bookings_list_is_admin_only():
    url = "/api/v1/admin/bookings/"
    assert client_for(make_student().user).get(url).status_code == 403
    assert client_for(make_instructor().user).get(url).status_code == 403
    assert APIClient().get(url).status_code == 401


def test_admin_patch_cancels_a_booking_and_preserves_history():
    student, instructor, topic, slot = _world(days_ahead=5)
    booking = client_for(student.user).post(
        "/api/v1/student/bookings/", {"topicId": str(topic.id), "slotId": str(slot.id)}, format="json"
    ).data
    resp = client_for(make_admin()).patch(
        f"/api/v1/admin/bookings/{booking['bookingId']}/",
        {"status": "cancelled", "forceCredit": True}, format="json",
    )
    assert resp.status_code == 200
    assert resp.data["status"] == "cancelled"
    # History preserved: the cancelled booking row still exists.
    assert Booking.objects.filter(id=booking["bookingId"], status=BookingStatus.CANCELLED).exists()


def test_admin_patch_rejects_unsupported_status():
    student, instructor, topic, slot = _world()
    booking = client_for(student.user).post(
        "/api/v1/student/bookings/", {"topicId": str(topic.id), "slotId": str(slot.id)}, format="json"
    ).data
    resp = client_for(make_admin()).patch(
        f"/api/v1/admin/bookings/{booking['bookingId']}/", {"status": "completed"}, format="json"
    )
    assert resp.status_code == 400
    assert resp.data["code"] == "validation_error"


def test_admin_patch_is_admin_only():
    student, instructor, topic, slot = _world()
    booking = client_for(student.user).post(
        "/api/v1/student/bookings/", {"topicId": str(topic.id), "slotId": str(slot.id)}, format="json"
    ).data
    url = f"/api/v1/admin/bookings/{booking['bookingId']}/"
    body = {"status": "cancelled"}
    assert client_for(make_student().user).patch(url, body, format="json").status_code == 403
    assert APIClient().patch(url, body, format="json").status_code == 401
