"""
Video provider — STUB ONLY.

This is the seam where Agora will plug in later. It intentionally does NOT call
Agora and does NOT mint real tokens. The real adapter (AgoraVideoProvider) will
implement the same VideoProvider port and generate genuine RTC tokens
server-side. Use cases depend on the port, never on this class directly.
"""
from datetime import timedelta

from django.utils import timezone

from application.ports.gateways import VideoProvider, VideoToken


class StubVideoProvider(VideoProvider):
    provider_name = "stub"

    def create_channel(self, *, session_id) -> str:
        return f"session-{session_id}"

    def issue_join(self, *, channel, identity) -> VideoToken:
        # Deterministic, obviously-fake credential. NOT an Agora token.
        return VideoToken(
            provider=self.provider_name,
            channel=channel,
            token=f"stub-token::{channel}::{identity}",
            uid=str(identity),
            expires_at=timezone.now() + timedelta(hours=1),
            app_id="stub-app-id",  # real AgoraVideoProvider supplies the genuine app id
        )
