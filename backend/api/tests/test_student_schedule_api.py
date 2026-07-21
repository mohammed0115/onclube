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
    """One instructor, one funded student. By default the instructor has opted into
    every day, all day (so any pick matches). `with_window=True` instead gives a
    NARROW window (08:00–22:00 on tomorrow's weekday) for the no-match gap test —
    an instructor with no declared availability is now unmatchable, not 24/7."""
    instructor = make_instructor()
    student = make_student()
    plan = make_plan(sessions_per_month=sessions)
    make_active_subscription(student, plan, sessions=sessions)
    if with_window:
        RecurringAvailability.objects.create(
            instructor=instructor, weekday=_tomorrow_weekday(),
            start_time=time(8, 0), end_time=time(22, 0),
        )
    else:
        for d in range(7):
            RecurringAvailability.objects.create(
                instructor=instructor, weekday=d,
                start_time=time(0, 0), end_time=time(23, 59),
            )
    return student, instructor


def _available_instructor(**kwargs):
    """An instructor who has opted into every day, all day — matchable at any pick."""
    ins = make_instructor(**kwargs)
    for d in range(7):
        RecurringAvailability.objects.create(
            instructor=ins, weekday=d, start_time=time(0, 0), end_time=time(23, 59),
        )
    return ins


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
    other = _available_instructor()  # also available all week
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


def test_lesson_prep_is_locked_until_the_window_before_the_session():
    student, instructor = _world(sessions=4)
    wd = _tomorrow_weekday()
    _put_availability(student, [{"weekday": wd, "startTime": "12:00"}])
    _approve(student)
    # The farthest occurrence (~1 week out) is outside the 3-day prep window.
    far = Booking.objects.filter(student=student, status=BookingStatus.UPCOMING).order_by("-scheduled_at").first()
    resp = client_for(instructor.user).post(
        f"/api/v1/instructor/bookings/{far.id}/lesson/",
        {"title": "Money", "questions": []}, format="json",
    )
    assert resp.status_code == 422
    assert resp.data["code"] == "prep_not_open"

    lst = client_for(instructor.user).get("/api/v1/instructor/lessons/")
    far_item = next(x for x in lst.data if x["bookingId"] == str(far.id))
    assert far_item["prepOpen"] is False
    # The nearest occurrence (tomorrow) IS within the window.
    near_item = min(lst.data, key=lambda x: x["scheduledAt"])
    assert near_item["prepOpen"] is True


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


# ── group sessions (admin-configured capacity) ────────────────────────────────
def _funded_student(sessions=4):
    st = make_student()
    make_active_subscription(st, make_plan(sessions_per_month=sessions), sessions=sessions)
    return st


def test_students_at_same_time_form_a_group_sharing_room_and_lesson():
    from apps.scheduling.models import PlatformSettings
    from apps.sessions.models import Session

    s = PlatformSettings.current(); s.group_capacity = 2; s.save()
    instructor = _available_instructor()  # the only instructor → both students assigned to it
    a, b = _funded_student(), _funded_student()
    wd = _tomorrow_weekday()
    _put_availability(a, [{"weekday": wd, "startTime": "12:00"}])
    _put_availability(b, [{"weekday": wd, "startTime": "12:00"}])
    _approve(a); _approve(b)

    ba = Booking.objects.filter(student=a, status=BookingStatus.UPCOMING).order_by("scheduled_at").first()
    bb = Booking.objects.filter(student=b, status=BookingStatus.UPCOMING).order_by("scheduled_at").first()
    assert ba.scheduled_at == bb.scheduled_at
    assert ba.slot_id == bb.slot_id                     # same group slot
    assert ba.instructor_id == bb.instructor_id == instructor.id
    # Shared room: identical channel.
    assert Session.objects.get(booking=ba).agora_channel == Session.objects.get(booking=bb).agora_channel
    # Each student charged one credit per occurrence (2 weeks → 2 each).
    a.refresh_from_db(); b.refresh_from_db()
    assert a.sessions_remaining == 2 and b.sessions_remaining == 2

    # Instructor lesson prep shows ONE grouped entry with both students.
    ic = client_for(instructor.user)
    lst = ic.get("/api/v1/instructor/lessons/").data
    grp = min(lst, key=lambda x: x["scheduledAt"])
    assert sorted(grp["studentNames"]) == sorted([a.user.full_name, b.user.full_name])

    # Preparing once applies the lesson to BOTH students.
    ic.post(f"/api/v1/instructor/bookings/{grp['bookingId']}/lesson/",
            {"title": "Money", "questions": ["Why save money?"]}, format="json")
    ba.refresh_from_db(); bb.refresh_from_db()
    assert ba.lesson_title == bb.lesson_title == "Money"
    assert ba.lesson_questions == bb.lesson_questions == ["Why save money?"]


def test_group_capacity_limit_skips_extra_students():
    from apps.scheduling.models import PlatformSettings

    s = PlatformSettings.current(); s.group_capacity = 1; s.save()
    _available_instructor()
    a, b = _funded_student(), _funded_student()
    wd = _tomorrow_weekday()
    _put_availability(a, [{"weekday": wd, "startTime": "12:00"}])
    _put_availability(b, [{"weekday": wd, "startTime": "12:00"}])
    _approve(a); _approve(b)
    # Capacity 1: the group is full after the first student; the second gets none.
    assert Booking.objects.filter(student=a, status=BookingStatus.UPCOMING).exists()
    assert not Booking.objects.filter(student=b, status=BookingStatus.UPCOMING).exists()


def test_topic_less_waiting_room_uses_lesson_questions_no_crash():
    """A generated (topic-less) booking's waiting room must not crash on the null
    topic. The instructor always sees the lesson; the student does NOT until the
    reveal window (~1h before), so a far-out session is hidden from the student."""
    from apps.sessions.models import Session

    student, instructor = _world(sessions=4)
    wd = _tomorrow_weekday()
    _put_availability(student, [{"weekday": wd, "startTime": "12:00"}])
    _approve(student)
    booking = Booking.objects.filter(student=student, status=BookingStatus.UPCOMING).order_by("scheduled_at").first()
    client_for(instructor.user).post(
        f"/api/v1/instructor/bookings/{booking.id}/lesson/",
        {"title": "Money", "questions": ["Why save?", "Budgeting tips?"]}, format="json",
    )
    sess = Session.objects.get(booking=booking)
    # Instructor: sees the prepared lesson, and the null topic doesn't crash.
    ir = client_for(instructor.user).get(f"/api/v1/sessions/{sess.id}/waiting-room/")
    assert ir.status_code == 200, ir.data
    assert list(ir.data["questions"]) == ["Why save?", "Budgeting tips?"]
    # Student: the session is ~a week+ out, so the lesson is not revealed yet.
    sr = client_for(student.user).get(f"/api/v1/sessions/{sess.id}/waiting-room/")
    assert sr.status_code == 200, sr.data
    assert list(sr.data["questions"]) == []          # MED-5: hidden before reveal
    assert sr.data["topicTitle"] != "Money"          # lesson title not leaked early


def test_late_group_joiner_inherits_the_prepared_lesson():
    """MED-6: a student who joins the group after the instructor prepared the shared
    lesson inherits its title + questions (so they don't sit in the room empty)."""
    from apps.scheduling.models import PlatformSettings

    s = PlatformSettings.current(); s.group_capacity = 3; s.save()
    instructor = _available_instructor()
    a, b = _funded_student(), _funded_student()
    wd = _tomorrow_weekday()
    _put_availability(a, [{"weekday": wd, "startTime": "12:00"}]); _approve(a)
    ba = Booking.objects.filter(student=a, status=BookingStatus.UPCOMING).order_by("scheduled_at").first()
    client_for(instructor.user).post(
        f"/api/v1/instructor/bookings/{ba.id}/lesson/",
        {"title": "Money", "questions": ["Why save?"]}, format="json",
    )
    # b joins the same slot AFTER prep.
    _put_availability(b, [{"weekday": wd, "startTime": "12:00"}]); _approve(b)
    bb = Booking.objects.filter(
        student=b, status=BookingStatus.UPCOMING, scheduled_at=ba.scheduled_at
    ).first()
    assert bb is not None
    assert bb.lesson_title == "Money"
    assert bb.lesson_questions == ["Why save?"]


def test_cancelling_a_booking_cancels_its_live_session():
    """MED-10: cancelling a booking cancels its Session so nobody can open the dead
    room afterwards."""
    from apps.sessions.models import Session
    from apps.common.enums import SessionStatus

    student, instructor = _world(sessions=4)
    wd = _tomorrow_weekday()
    _put_availability(student, [{"weekday": wd, "startTime": "12:00"}])
    _approve(student)
    booking = Booking.objects.filter(student=student, status=BookingStatus.UPCOMING).order_by("scheduled_at").first()
    sess = Session.objects.get(booking=booking)
    resp = client_for(instructor.user).post(f"/api/v1/instructor/bookings/{booking.id}/cancel/")
    assert resp.status_code == 200, resp.data
    sess.refresh_from_db()
    assert sess.status == SessionStatus.CANCELLED


def test_admin_sets_group_capacity():
    admin = make_admin()
    r = client_for(admin).get("/api/v1/admin/group-capacity/")
    assert r.status_code == 200
    assert r.data["groupCapacity"] == 10  # default
    r2 = client_for(admin).put("/api/v1/admin/group-capacity/", {"groupCapacity": 4}, format="json")
    assert r2.status_code == 200 and r2.data["groupCapacity"] == 4
    from apps.scheduling.models import PlatformSettings
    assert PlatformSettings.current().group_capacity == 4


def test_lowering_capacity_reports_groups_that_now_exceed_it():
    """LOW-17: shrinking capacity below an existing group's size reports how many
    already-booked groups exceed the new limit (they still run as booked)."""
    from apps.scheduling.models import PlatformSettings

    admin = make_admin()
    s = PlatformSettings.current(); s.group_capacity = 3; s.save()
    instructor = _available_instructor()
    a, b = _funded_student(), _funded_student()
    wd = _tomorrow_weekday()
    _put_availability(a, [{"weekday": wd, "startTime": "12:00"}])
    _put_availability(b, [{"weekday": wd, "startTime": "12:00"}])
    _approve(a); _approve(b)  # a 2-student group forms

    r = client_for(admin).put("/api/v1/admin/group-capacity/", {"groupCapacity": 1}, format="json")
    assert r.status_code == 200
    assert r.data["groupCapacity"] == 1
    assert r.data["groupsOverCapacity"] >= 1


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


# ── audit regression tests (HIGH fixes) ───────────────────────────────────────
def test_completing_a_group_room_completes_every_member_with_a_report():
    """HIGH-1: completing the shared room must finalize EACH group member's booking
    and produce EACH student's report — not just the one the room was opened on."""
    from apps.scheduling.models import PlatformSettings
    from apps.sessions.models import Session
    from apps.ai_reports.models import AIReport

    s = PlatformSettings.current(); s.group_capacity = 3; s.save()
    instructor = _available_instructor()
    a, b = _funded_student(), _funded_student()
    wd = _tomorrow_weekday()
    _put_availability(a, [{"weekday": wd, "startTime": "12:00"}])
    _put_availability(b, [{"weekday": wd, "startTime": "12:00"}])
    _approve(a); _approve(b)

    ba = Booking.objects.filter(student=a, status=BookingStatus.UPCOMING).order_by("scheduled_at").first()
    bb = Booking.objects.filter(student=b, status=BookingStatus.UPCOMING).order_by("scheduled_at").first()
    assert ba.slot_id == bb.slot_id  # same group

    # Instructor ends the shared room via student a's session.
    sess_a = Session.objects.get(booking=ba)
    resp = client_for(instructor.user).post(f"/api/v1/sessions/{sess_a.id}/end/")
    assert resp.status_code == 200, resp.data

    ba.refresh_from_db(); bb.refresh_from_db()
    assert ba.status == BookingStatus.COMPLETED
    assert bb.status == BookingStatus.COMPLETED          # the other member, not stranded
    assert AIReport.objects.filter(booking=ba).exists()
    assert AIReport.objects.filter(booking=bb).exists()  # each student gets a report


def test_approve_all_skips_picks_without_an_instructor():
    """HIGH-2: 'Approve all' must not approve a pick that has no instructor — it
    would silently strand the student. Unassigned picks stay PENDING."""
    student, instructor = _world(sessions=4, with_window=True)  # only free tomorrow 08–22
    wd = _tomorrow_weekday()
    _put_availability(student, [
        {"weekday": wd, "startTime": "12:00"},   # matches → assigned
        {"weekday": wd, "startTime": "23:00"},   # nobody free → unassigned
    ])
    ap = _approve(student)
    assert ap.status_code == 200, ap.data
    assert ap.data["generated"]["created"] == 2          # only the assigned pick (2 weeks)
    assert ap.data["skipped_unassigned"] == 1

    slots = {s.start_time.strftime("%H:%M"): s for s in StudentScheduleSlot.objects.filter(student=student)}
    from apps.common.enums import ScheduleReviewStatus
    assert slots["12:00"].review_status == ScheduleReviewStatus.APPROVED
    assert slots["23:00"].review_status == ScheduleReviewStatus.PENDING  # still awaiting assignment


def test_duplicate_occurrence_booking_is_blocked_by_constraint():
    """HIGH-3: two non-cancelled bookings for the same (schedule_slot, scheduled_at)
    are rejected at the DB level — the guard behind concurrency-safe generation."""
    from django.db import IntegrityError, transaction

    student, instructor = _world(sessions=4)
    wd = _tomorrow_weekday()
    _put_availability(student, [{"weekday": wd, "startTime": "12:00"}])
    _approve(student)
    original = Booking.objects.filter(student=student, status=BookingStatus.UPCOMING).order_by("scheduled_at").first()

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Booking.objects.create(
                student=student, topic=None, topic_title="",
                instructor=original.instructor, instructor_name=original.instructor_name,
                slot=original.slot, subscription=original.subscription,
                scheduled_at=original.scheduled_at, duration_minutes=original.duration_minutes,
                status=BookingStatus.UPCOMING, schedule_slot=original.schedule_slot,
            )


def test_instructor_with_no_availability_is_not_matched():
    """HIGH-4: an instructor with no declared recurring availability is unmatchable
    (empty grid means 'unavailable', never 'available 24/7')."""
    student = make_student()
    make_active_subscription(student, make_plan(sessions_per_month=4), sessions=4)
    make_instructor()  # no recurring availability at all
    wd = _tomorrow_weekday()
    resp = _put_availability(student, [{"weekday": wd, "startTime": "12:00"}])
    assert resp.status_code == 200, resp.data
    assert resp.data["schedule"][0]["instructorId"] is None   # nobody matched


def test_availability_on_one_weekday_does_not_leak_to_another():
    """HIGH-4: a window on Monday must not make the instructor available on Tuesday."""
    student = make_student()
    make_active_subscription(student, make_plan(sessions_per_month=4), sessions=4)
    ins = make_instructor()
    # Available only on weekday 0 (Monday).
    RecurringAvailability.objects.create(instructor=ins, weekday=0, start_time=time(8, 0), end_time=time(22, 0))
    other_wd = 2  # Wednesday — no window
    resp = _put_availability(student, [{"weekday": other_wd, "startTime": "12:00"}])
    assert resp.status_code == 200, resp.data
    assert resp.data["schedule"][0]["instructorId"] is None
