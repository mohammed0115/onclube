"""Use-case tests — sessions (video provider seam)."""
import pytest

from apps.common.factories import make_booking, make_session
from application.ports.gateways import VideoProvider, VideoToken
from application.sessions.use_cases import JoinSessionUseCase

pytestmark = pytest.mark.django_db


class FakeVideoProvider(VideoProvider):
    """Records calls and returns an obviously-fake token (no real Agora)."""

    def __init__(self):
        self.calls = []

    def create_channel(self, *, session_id):
        self.calls.append(("create_channel", str(session_id)))
        return f"fake-channel-{session_id}"

    def issue_join(self, *, channel, identity):
        self.calls.append(("issue_join", channel, str(identity)))
        return VideoToken(
            provider="fake",
            channel=channel,
            token="FAKE-TOKEN",
            uid=str(identity),
            expires_at=None,
        )


def test_join_session_use_case_uses_video_provider_interface():
    booking = make_booking()
    session = make_session(booking)  # scheduled, no channel yet
    actor = booking.student.user

    fake = FakeVideoProvider()
    result = JoinSessionUseCase(video=fake).execute(actor=actor, session_id=session.id)

    # The use case went through the VideoProvider port, not any real Agora SDK.
    assert [c[0] for c in fake.calls] == ["create_channel", "issue_join"]
    assert result.provider == "fake"
    assert result.token == "FAKE-TOKEN"

    # Channel was provisioned and persisted on the session.
    session.refresh_from_db()
    assert session.agora_channel == result.channel
