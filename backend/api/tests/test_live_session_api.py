"""
Live Session foundation — API + use-case tests (Sprint 8.0).

Covers the lifecycle/state machine, the waiting room, the join window, detailed
join authorization (assigned student/instructor only — NO admin bypass), and the
VideoProvider / MeetingTokenProvider abstractions.
"""
import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.common.enums import SessionStatus, SubscriptionStatus
from apps.common.factories import make_admin, make_booking, make_instructor, make_session, make_student
from application.sessions.use_cases import EndSessionUseCase

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _session(days_ahead=0, status=SessionStatus.SCHEDULED):
    booking = make_booking(days_ahead=days_ahead)
    # live/completed sessions must carry a channel (DB check constraint).
    channel = None if status in (SessionStatus.SCHEDULED, SessionStatus.CANCELLED) else f"chan-{booking.id}"
    session = make_session(booking, status=status, agora_channel=channel)
    return booking, session


# ── waiting room ──────────────────────────────────────────────────────────────
def test_waiting_room_returns_session_info_and_can_join_within_window():
    booking, session = _session(days_ahead=0)
    resp = client_for(booking.student.user).get(f"/api/v1/sessions/{session.id}/waiting-room/")
    assert resp.status_code == 200
    d = resp.data
    assert d["phase"] == "waiting"
    assert d["canJoin"] is True
    assert d["instructorName"] == booking.instructor_name
    assert d["topicTitle"] and d["joinOpensAt"] and d["durationMinutes"]
    # No ORM/model fields leak.
    for banned in ("agora_channel", "student_notes", "subscription"):
        assert banned not in str(d).lower()


def test_waiting_room_phase_expired_when_window_closed():
    booking, session = _session(days_ahead=-1)  # scheduled in the past
    resp = client_for(booking.student.user).get(f"/api/v1/sessions/{session.id}/waiting-room/")
    assert resp.data["phase"] == "expired"
    assert resp.data["canJoin"] is False


def test_waiting_room_admin_may_view_but_cannot_join():
    booking, session = _session(days_ahead=0)
    resp = client_for(make_admin()).get(f"/api/v1/sessions/{session.id}/waiting-room/")
    assert resp.status_code == 200
    assert resp.data["canJoin"] is False  # admin is not a participant
    assert resp.data["viewerRole"] == "admin"


def test_waiting_room_requires_authentication():
    booking, session = _session()
    assert APIClient().get(f"/api/v1/sessions/{session.id}/waiting-room/").status_code == 401


# ── join: authorization / ownership (no admin bypass) ─────────────────────────
def test_student_can_join_own_session_within_window():
    booking, session = _session(days_ahead=0)
    resp = client_for(booking.student.user).post(f"/api/v1/sessions/{session.id}/join/")
    assert resp.status_code == 200
    for key in ("agoraAppId", "channel", "agoraToken", "uid", "expiresAt"):
        assert key in resp.data


def test_instructor_can_join_own_session():
    booking, session = _session(days_ahead=0)
    resp = client_for(booking.instructor.user).post(f"/api/v1/sessions/{session.id}/join/")
    assert resp.status_code == 200


def test_wrong_student_cannot_join():
    booking, session = _session(days_ahead=0)
    other = make_student()
    resp = client_for(other.user).post(f"/api/v1/sessions/{session.id}/join/")
    assert resp.status_code == 403


def test_wrong_instructor_cannot_join():
    booking, session = _session(days_ahead=0)
    other = make_instructor()
    resp = client_for(other.user).post(f"/api/v1/sessions/{session.id}/join/")
    assert resp.status_code == 403


def test_admin_cannot_join_session():
    booking, session = _session(days_ahead=0)
    resp = client_for(make_admin()).post(f"/api/v1/sessions/{session.id}/join/")
    assert resp.status_code == 403  # administrator cannot bypass session rules


def test_join_requires_authentication():
    booking, session = _session(days_ahead=0)
    assert APIClient().post(f"/api/v1/sessions/{session.id}/join/").status_code == 401


# ── join window / state machine ───────────────────────────────────────────────
def test_join_too_early_is_blocked():
    booking, session = _session(days_ahead=3)  # window not open yet
    resp = client_for(booking.student.user).post(f"/api/v1/sessions/{session.id}/join/")
    assert resp.status_code == 409
    assert resp.data["code"] == "session_not_joinable"


def test_join_expired_session_is_blocked():
    booking, session = _session(days_ahead=-1)  # window closed
    resp = client_for(booking.student.user).post(f"/api/v1/sessions/{session.id}/join/")
    assert resp.status_code == 409
    assert resp.data["code"] == "session_expired"


def test_join_completed_session_is_blocked():
    booking, session = _session(days_ahead=0, status=SessionStatus.COMPLETED)
    resp = client_for(booking.student.user).post(f"/api/v1/sessions/{session.id}/join/")
    assert resp.status_code == 409
    assert resp.data["code"] == "session_not_joinable"


def test_join_cancelled_session_is_blocked():
    booking, session = _session(days_ahead=0, status=SessionStatus.CANCELLED)
    resp = client_for(booking.student.user).post(f"/api/v1/sessions/{session.id}/join/")
    assert resp.status_code == 409


def test_join_blocked_when_subscription_expired():
    booking, session = _session(days_ahead=0)
    sub = booking.subscription
    sub.status = SubscriptionStatus.EXPIRED
    sub.expires_at = timezone.now() - timezone.timedelta(days=1)
    sub.save(update_fields=["status", "expires_at"])
    resp = client_for(booking.student.user).post(f"/api/v1/sessions/{session.id}/join/")
    assert resp.status_code in (403, 409)
    assert resp.data["code"] in ("subscription_expired", "no_active_subscription")


# ── start / leave / end lifecycle ─────────────────────────────────────────────
def test_start_transitions_to_live_and_admin_cannot_start():
    booking, session = _session(days_ahead=0)
    ok = client_for(booking.instructor.user).post(f"/api/v1/sessions/{session.id}/start/")
    assert ok.status_code == 200 and ok.data["status"] == "live"
    # Admin cannot start (no bypass) — use a fresh scheduled session.
    _, s2 = _session(days_ahead=0)
    assert client_for(make_admin()).post(f"/api/v1/sessions/{s2.id}/start/").status_code == 403


def test_leave_is_participant_only():
    booking, session = _session(days_ahead=0)
    assert client_for(booking.student.user).post(f"/api/v1/sessions/{session.id}/leave/").status_code == 200
    assert client_for(make_student().user).post(f"/api/v1/sessions/{session.id}/leave/").status_code == 403
    assert client_for(make_admin()).post(f"/api/v1/sessions/{session.id}/leave/").status_code == 403


def test_end_session_use_case_completes_and_forbids_admin():
    from domain.exceptions import PermissionDenied

    booking, session = _session(days_ahead=0)
    result = EndSessionUseCase().execute(actor=booking.instructor.user, session_id=session.id)
    assert result.status == "completed"
    session.refresh_from_db()
    assert session.status == SessionStatus.COMPLETED and session.ended_at is not None

    _, s2 = _session(days_ahead=0)
    with pytest.raises(PermissionDenied):
        EndSessionUseCase().execute(actor=make_admin(), session_id=s2.id)


def test_end_session_is_idempotent():
    booking, session = _session(days_ahead=0, status=SessionStatus.COMPLETED)
    session.agora_channel = "c1"
    session.save(update_fields=["agora_channel"])
    result = EndSessionUseCase().execute(actor=booking.instructor.user, session_id=session.id)
    assert result.status == "completed"
