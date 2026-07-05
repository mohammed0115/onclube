"""
Video Conference Core — backend tests (Sprint 8.1).

Explicit coverage of the sprint's required backend surface:
  - token generation
  - authorization
  - join validation
  - provider abstraction
  - provider injection
  - no provider leakage
"""
import pytest
from rest_framework.test import APIClient

from apps.common.enums import SessionStatus
from apps.common.factories import make_admin, make_booking, make_session, make_student
from application.ports.gateways import MeetingTokenProvider, VideoProvider, VideoToken
from application.sessions.use_cases import JoinSessionUseCase
from infrastructure.container import default_meeting_token_provider, default_video_provider

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _joinable():
    booking = make_booking(days_ahead=0)  # inside the join window, active subscription
    session = make_session(booking)  # scheduled, no channel yet
    return booking, session


# ── token generation ──────────────────────────────────────────────────────────
def test_meeting_token_provider_mints_a_scoped_short_lived_token():
    from django.utils import timezone

    token = default_meeting_token_provider().issue(channel="chan-x", identity="user-9")
    assert isinstance(token, VideoToken)
    assert token.channel == "chan-x"
    assert token.uid == "user-9"
    assert token.token  # non-empty
    assert token.app_id  # client app id present
    assert token.expires_at > timezone.now()  # short-lived, in the future


# ── provider injection ────────────────────────────────────────────────────────
def test_container_returns_the_correct_port_types():
    assert isinstance(default_video_provider(), VideoProvider)
    assert isinstance(default_meeting_token_provider(), MeetingTokenProvider)


# ── provider abstraction ──────────────────────────────────────────────────────
class _FakeVideo(VideoProvider):
    def __init__(self):
        self.calls = []

    def create_channel(self, *, session_id):
        self.calls.append("create_channel")
        return f"chan-{session_id}"

    def issue_join(self, *, channel, identity):
        raise AssertionError("token minting must go through MeetingTokenProvider")


class _FakeTokens(MeetingTokenProvider):
    def __init__(self):
        self.calls = []

    def issue(self, *, channel, identity):
        self.calls.append((channel, str(identity)))
        return VideoToken(provider="fake", channel=channel, token="FAKE", uid=str(identity), expires_at=None, app_id="fake-app")


def test_join_uses_video_for_channel_and_token_provider_for_credentials():
    booking, session = _joinable()
    video, tokens = _FakeVideo(), _FakeTokens()

    dto = JoinSessionUseCase(video=video, tokens=tokens).execute(actor=booking.student.user, session_id=session.id)

    assert video.calls == ["create_channel"]  # channel provisioned by VideoProvider
    assert len(tokens.calls) == 1  # token minted by the SEPARATE token provider
    assert dto.provider == "fake" and dto.token == "FAKE"

    session.refresh_from_db()
    assert session.agora_channel == dto.channel  # channel persisted on first join


# ── authorization ─────────────────────────────────────────────────────────────
def test_only_assigned_participants_can_join():
    booking, session = _joinable()
    assert client_for(booking.student.user).post(f"/api/v1/sessions/{session.id}/join/").status_code == 200
    assert client_for(booking.instructor.user).post(f"/api/v1/sessions/{session.id}/join/").status_code == 200
    assert client_for(make_student().user).post(f"/api/v1/sessions/{session.id}/join/").status_code == 403
    assert client_for(make_admin()).post(f"/api/v1/sessions/{session.id}/join/").status_code == 403
    assert APIClient().post(f"/api/v1/sessions/{session.id}/join/").status_code == 401


# ── join validation ───────────────────────────────────────────────────────────
def test_join_rejected_for_expired_completed_and_cancelled():
    _, session_exp = _joinable_at(days_ahead=-1)  # scheduled in the past → window closed
    r = client_for(session_exp.booking.student.user).post(f"/api/v1/sessions/{session_exp.id}/join/")
    assert r.status_code == 409 and r.data["code"] == "session_expired"

    for status in (SessionStatus.COMPLETED, SessionStatus.CANCELLED):
        booking = make_booking(days_ahead=0)
        chan = "c1" if status == SessionStatus.COMPLETED else None
        session = make_session(booking, status=status, agora_channel=chan)
        r = client_for(booking.student.user).post(f"/api/v1/sessions/{session.id}/join/")
        assert r.status_code == 409


def _joinable_at(days_ahead):
    booking = make_booking(days_ahead=days_ahead)
    return booking, make_session(booking)


# ── no provider leakage ───────────────────────────────────────────────────────
def test_join_response_never_leaks_provider_secrets_or_config():
    booking, session = _joinable()
    resp = client_for(booking.student.user).post(f"/api/v1/sessions/{session.id}/join/")
    assert resp.status_code == 200

    # Exactly the whitelisted credential fields — nothing else.
    assert set(resp.data.keys()) == {
        "sessionId", "provider", "agoraAppId", "channel", "agoraToken", "uid", "expiresAt"
    }
    # No server-only secret/config ever appears in the payload.
    blob = str(resp.data).lower()
    for banned in ("certificate", "secret", "api_key", "apikey", "private", "credential_secret", "customer_key"):
        assert banned not in blob
