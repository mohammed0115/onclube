"""
Screen Sharing — backend guarantees (Sprint 8.2).

Screen sharing is a client-media capability layered on the already-authorized
live session. There is NO screen-share endpoint, signaling, or persistence — the
backend's only responsibility is the same gate that governs the room: who may be
inside the session at all. These tests pin that contract:

  - authorization           (only assigned participants; admin never; anon never)
  - participant permissions (wrong student / wrong instructor rejected)
  - session validation      (expired / completed / cancelled cannot join → cannot share)
  - provider abstraction     (signaling, if ever added, rides the existing ports)
  - no persistence          (no screen-share state stored on the Session)
"""
import pytest
from rest_framework.test import APIClient

from apps.common.enums import SessionStatus
from apps.common.factories import make_admin, make_booking, make_instructor, make_session, make_student
from apps.sessions.models import Session
from application.ports.gateways import MeetingTokenProvider, VideoProvider
from infrastructure.container import default_meeting_token_provider, default_video_provider

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _joinable():
    booking = make_booking(days_ahead=0)  # inside the join window, active subscription
    return booking, make_session(booking)


# ── authorization + participant permissions ───────────────────────────────────
def test_only_assigned_participants_reach_the_room_and_may_share():
    booking, session = _joinable()
    url = f"/api/v1/sessions/{session.id}/join/"
    # Assigned student and instructor get in (and therefore may share client-side).
    assert client_for(booking.student.user).post(url).status_code == 200
    assert client_for(booking.instructor.user).post(url).status_code == 200
    # Everyone else is kept out of the room — so they can never share.
    assert client_for(make_student().user).post(url).status_code == 403
    assert client_for(make_instructor().user).post(url).status_code == 403
    assert client_for(make_admin()).post(url).status_code == 403  # admin may NEVER share
    assert APIClient().post(url).status_code == 401


# ── session validation ────────────────────────────────────────────────────────
def test_invalid_session_states_cannot_be_joined_or_shared():
    # Expired (scheduled in the past) → window closed.
    booking_past = make_booking(days_ahead=-1)
    session_past = make_session(booking_past)
    r = client_for(booking_past.student.user).post(f"/api/v1/sessions/{session_past.id}/join/")
    assert r.status_code == 409 and r.data["code"] == "session_expired"

    for status in (SessionStatus.COMPLETED, SessionStatus.CANCELLED):
        booking = make_booking(days_ahead=0)
        chan = "c1" if status == SessionStatus.COMPLETED else None
        session = make_session(booking, status=status, agora_channel=chan)
        r = client_for(booking.student.user).post(f"/api/v1/sessions/{session.id}/join/")
        assert r.status_code == 409


# ── provider abstraction ──────────────────────────────────────────────────────
def test_signaling_ports_remain_available_and_provider_neutral():
    # Any future screen-share signaling reuses these existing ports — no new
    # provider surface is introduced by this sprint.
    assert isinstance(default_video_provider(), VideoProvider)
    assert isinstance(default_meeting_token_provider(), MeetingTokenProvider)


# ── no persistence / no schema change ─────────────────────────────────────────
def test_session_model_stores_no_screen_share_state():
    field_names = {f.name for f in Session._meta.get_fields()}
    assert not any("screen" in n or "share" in n for n in field_names), field_names
