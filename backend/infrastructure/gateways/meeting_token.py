"""
Meeting-token provider — STUB ONLY.

Mints obviously-fake, deterministic join tokens. NOT a real RTC token and makes
NO network call. The real adapter implements the same MeetingTokenProvider port
and mints genuine server-side tokens. Tokens are never stored.
"""
from datetime import timedelta

from django.utils import timezone

from application.ports.gateways import MeetingTokenProvider, VideoToken


class StubMeetingTokenProvider(MeetingTokenProvider):
    provider_name = "stub"

    def issue(self, *, channel, identity) -> VideoToken:
        return VideoToken(
            provider=self.provider_name,
            channel=channel,
            token=f"stub-token::{channel}::{identity}",
            uid=str(identity),
            expires_at=timezone.now() + timedelta(hours=1),
            app_id="stub-app-id",  # a real adapter supplies the genuine app id
        )
