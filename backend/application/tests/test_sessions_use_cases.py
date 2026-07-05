"""Use-case tests — sessions (VideoProvider + MeetingTokenProvider seams)."""
import pytest

from apps.common.factories import make_booking, make_session
from application.ports.gateways import MeetingTokenProvider, VideoProvider, VideoToken
from application.sessions.use_cases import JoinSessionUseCase

pytestmark = pytest.mark.django_db


class FakeVideoProvider(VideoProvider):
    """Provisions channels (no real Agora). Token minting lives elsewhere."""

    def __init__(self):
        self.calls = []

    def create_channel(self, *, session_id):
        self.calls.append(("create_channel", str(session_id)))
        return f"fake-channel-{session_id}"

    def issue_join(self, *, channel, identity):  # legacy port method, unused here
        raise AssertionError("JoinSession must mint tokens via MeetingTokenProvider")


class FakeTokenProvider(MeetingTokenProvider):
    def __init__(self):
        self.calls = []

    def issue(self, *, channel, identity):
        self.calls.append(("issue", channel, str(identity)))
        return VideoToken(
            provider="fake", channel=channel, token="FAKE-TOKEN", uid=str(identity), expires_at=None
        )


def test_join_session_uses_video_and_token_provider_interfaces():
    booking = make_booking(days_ahead=0)  # scheduled ~now → inside the join window
    session = make_session(booking)  # scheduled, no channel yet
    actor = booking.student.user

    video, tokens = FakeVideoProvider(), FakeTokenProvider()
    result = JoinSessionUseCase(video=video, tokens=tokens).execute(actor=actor, session_id=session.id)

    # Channel via VideoProvider; token via the SEPARATE MeetingTokenProvider.
    assert [c[0] for c in video.calls] == ["create_channel"]
    assert [c[0] for c in tokens.calls] == ["issue"]
    assert result.provider == "fake" and result.token == "FAKE-TOKEN"

    session.refresh_from_db()
    assert session.agora_channel == result.channel
