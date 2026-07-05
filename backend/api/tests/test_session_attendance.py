"""
Attendance & presence — backend guarantees (Sprint 8.8).

Attendance is a provider-driven capability layered on the already-authorized live
session. There is NO attendance endpoint or persistence — the backend's
responsibilities are only (a) the participant gate (admin is never a participant,
so never counted) and (b) the transport-neutral attendance state machine. These
tests pin that contract:

  - authorization + participant validation (assigned student/instructor; admin never)
  - provider abstraction
  - idempotent join / idempotent leave
  - presence accumulation (across reconnects → one record)
  - late join / early leave / completed lock / heartbeat
"""
import pytest

from apps.common.factories import make_admin, make_booking, make_instructor, make_session, make_student
from apps.sessions.models import Session
from application.permissions import ensure_session_joiner, session_joiner_role
from application.ports.gateways import MeetingTokenProvider, VideoProvider
from domain.exceptions import AttendanceLocked, PermissionDenied
from domain.rules import attendance as att
from infrastructure.container import default_meeting_token_provider, default_video_provider

pytestmark = pytest.mark.django_db

T0 = 1_000_000  # scheduled start (epoch seconds)


def tracker(role="student", scheduled_at=T0):
    return att.AttendanceTracker(participant_id="p1", participant_name="P", role=role, scheduled_at=scheduled_at)


# ── authorization + participant validation ────────────────────────────────────
def test_only_assigned_participants_are_tracked_admin_never():
    booking = make_booking(days_ahead=0)
    session = make_session(booking)

    assert ensure_session_joiner(booking.student.user, session) == "student"
    assert ensure_session_joiner(booking.instructor.user, session) == "instructor"
    # Admin is not a participant → never counted.
    assert session_joiner_role(make_admin(), session) is None
    with pytest.raises(PermissionDenied):
        ensure_session_joiner(make_admin(), session)
    with pytest.raises(PermissionDenied):
        ensure_session_joiner(make_student().user, session)
    with pytest.raises(PermissionDenied):
        ensure_session_joiner(make_instructor().user, session)


# ── provider abstraction ──────────────────────────────────────────────────────
def test_signaling_ports_remain_available_and_provider_neutral():
    assert isinstance(default_video_provider(), VideoProvider)
    assert isinstance(default_meeting_token_provider(), MeetingTokenProvider)


# ── idempotent join / leave ───────────────────────────────────────────────────
def test_join_and_leave_are_idempotent():
    t = tracker()
    t.join(T0)
    t.join(T0 + 5)  # already present → no change to joinedAt
    assert t.joined_at == T0 and t.currently_present is True
    t.leave(T0 + 60)
    t.leave(T0 + 90)  # already left → no change
    assert t.currently_present is False and t.left_at == T0 + 60
    assert t.total_presence_duration == 60


# ── presence accumulation across reconnects (one record) ──────────────────────
def test_presence_accumulates_across_reconnects():
    t = tracker()
    t.join(T0)
    t.leave(T0 + 60)              # +60
    t.join(T0 + 120)             # rejoin — SAME record
    t.leave(T0 + 200)            # +80
    assert t.total_presence_duration == 140
    assert t.joined_at == T0     # first join preserved


def test_heartbeat_accumulates_presence():
    t = tracker()
    t.join(T0)
    t.heartbeat(T0 + 30)
    t.heartbeat(T0 + 75)
    assert t.total_presence_duration == 75
    assert t.currently_present is True


# ── late join / early leave / completed lock ──────────────────────────────────
def test_late_join_marked_late():
    t = tracker()
    t.join(T0 + att.LATE_THRESHOLD_SECONDS + 1)  # just past the threshold
    assert t.status == att.LATE and t.late is True


def test_on_time_join_is_present():
    t = tracker()
    t.join(T0 + 10)
    assert t.status == att.PRESENT and t.late is False


def test_leaving_before_end_marks_left_early_then_finalize_locks():
    t = tracker()
    t.join(T0)
    t.leave(T0 + 100)
    assert t.status == att.LEFT_EARLY
    t.finalize(T0 + 3600)
    assert t.status == att.LEFT_EARLY and t.locked is True


def test_staying_to_end_marks_completed():
    t = tracker()
    t.join(T0)
    t.finalize(T0 + 3600)  # still present at end
    assert t.status == att.COMPLETED
    assert t.total_presence_duration == 3600
    assert t.currently_present is False


def test_never_joined_is_absent():
    t = tracker()
    t.finalize(T0 + 3600)
    assert t.status == att.ABSENT


def test_completed_attendance_is_locked():
    t = tracker()
    t.join(T0)
    t.finalize(T0 + 3600)
    for action in (lambda: t.join(T0 + 4000), lambda: t.leave(T0 + 4000), lambda: t.heartbeat(T0 + 4000)):
        with pytest.raises(AttendanceLocked):
            action()
    # finalize itself is idempotent (no raise).
    t.finalize(T0 + 5000)
    assert t.status == att.COMPLETED


# ── no persistence / no schema change ─────────────────────────────────────────
def test_no_attendance_model_and_no_attendance_field_on_session():
    from django.apps import apps as django_apps

    model_names = {m.__name__.lower() for m in django_apps.get_models()}
    assert not any(("attendance" in n or "presence" in n) for n in model_names)

    field_names = {f.name for f in Session._meta.get_fields()}
    assert not any(("attendance" in n or "presence" in n or "joined_at" in n) for n in field_names), field_names
