"""
Agora RTC adapters — INFRASTRUCTURE ONLY (Sprint 10).

Production implementations of the existing `VideoProvider` and `MeetingTokenProvider`
ports. The SDK / signing is imported lazily so `agora_token_builder` is an OPTIONAL
dependency: if it (or the certificate) is unavailable, the adapter degrades to the
stub — an Agora outage never crashes a session.

Security guarantees:
  * The APP_CERTIFICATE (a SECRET) is used only to sign tokens and is NEVER placed
    on the returned VideoToken or logged. Only the public app id, the channel, the
    uid, and the short-lived token are returned — exactly the session credentials.
  * No SDK object leaks past this module.
"""
from __future__ import annotations

import logging
import time
import zlib
from datetime import timedelta

from django.utils import timezone

from application.ports.gateways import MeetingTokenProvider, VideoProvider, VideoToken
from infrastructure.gateways.meeting_token import StubMeetingTokenProvider
from infrastructure.gateways.video import StubVideoProvider

logger = logging.getLogger("providers.agora")

_ROLE_PUBLISHER = 1


class _ProviderUnavailable(RuntimeError):
    """Raised internally when the real provider cannot produce a usable result."""


def _numeric_uid(identity) -> int:
    """Agora uids are 32-bit ints; derive a stable one from the identity string."""
    return zlib.crc32(str(identity).encode("utf-8")) & 0x7FFFFFFF


def _default_token_builder(*, app_id, app_certificate, channel, uid, privilege_expire) -> str:
    # Lazy import so the SDK is optional; any failure bubbles up → fallback.
    from agora_token_builder import RtcTokenBuilder  # noqa: PLC0415

    return RtcTokenBuilder.buildTokenWithUid(
        app_id, app_certificate, channel, uid, _ROLE_PUBLISHER, privilege_expire
    )


class AgoraVideoProvider(VideoProvider):
    """Provisions Agora channel names (channels are just names in Agora)."""

    provider_name = "agora"

    def __init__(self, *, app_id: str, fallback: VideoProvider | None = None):
        self._app_id = app_id
        self._fallback = fallback or StubVideoProvider()

    def create_channel(self, *, session_id) -> str:
        # Deterministic, collision-free channel name scoped to the session.
        return f"oneclub-{session_id}"

    def issue_join(self, *, channel, identity) -> VideoToken:
        # Token minting is the MeetingTokenProvider's job; delegate the legacy path.
        return self._fallback.issue_join(channel=channel, identity=identity)


class AgoraMeetingTokenProvider(MeetingTokenProvider):
    """Mints genuine, short-lived Agora RTC tokens SERVER-SIDE. Falls back to the
    stub on any failure so a signing/SDK problem never breaks a join."""

    provider_name = "agora"

    def __init__(self, *, app_id: str, app_certificate: str, ttl_seconds: int = 3600,
                 fallback: MeetingTokenProvider | None = None, token_builder=None):
        self._app_id = app_id
        self._app_certificate = app_certificate  # SECRET — never returned/logged
        self._ttl = ttl_seconds
        self._fallback = fallback or StubMeetingTokenProvider()
        self._token_builder = token_builder  # injectable seam for tests

    def issue(self, *, channel, identity) -> VideoToken:
        try:
            if not (self._app_id and self._app_certificate):
                raise _ProviderUnavailable("agora not configured")
            uid = _numeric_uid(identity)
            privilege_expire = int(time.time()) + self._ttl
            builder = self._token_builder or _default_token_builder
            token = builder(
                app_id=self._app_id,
                app_certificate=self._app_certificate,
                channel=channel,
                uid=uid,
                privilege_expire=privilege_expire,
            )
            if not token:
                raise _ProviderUnavailable("empty token")
            return VideoToken(
                provider=self.provider_name,
                channel=channel,
                token=token,
                uid=str(uid),
                expires_at=timezone.now() + timedelta(seconds=self._ttl),
                app_id=self._app_id,  # PUBLIC app id only — never the certificate
            )
        except Exception as exc:  # noqa: BLE001 — degrade on ANY failure
            # Log the failure TYPE only — never the certificate, token, or config.
            logger.warning("Agora token mint failed (%s); using stub fallback", type(exc).__name__)
            return self._fallback.issue(channel=channel, identity=identity)
