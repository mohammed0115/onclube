"""
Production provider integration — Sprint 10.

The composition root selects real adapters by environment; stubs remain the
fallback. Ports/DTOs are unchanged — these tests exercise selection, config
gating, graceful fallback, timeout config, provider failure, and security (the
Agora certificate is never exposed).
"""
from application.ports.gateways import MeetingTokenProvider, VideoProvider, VideoToken
from infrastructure.container import (
    _provider_mode,
    default_meeting_token_provider,
    default_video_provider,
)
from infrastructure.gateways.agora import AgoraMeetingTokenProvider, AgoraVideoProvider
from infrastructure.gateways.meeting_token import StubMeetingTokenProvider

CERT = "super-secret-app-certificate"


def _agora(**over):
    kwargs = dict(app_id="app-123", app_certificate=CERT, ttl_seconds=3600,
                  token_builder=lambda **_: "AGORA-RTC-TOKEN")
    kwargs.update(over)
    return AgoraMeetingTokenProvider(**kwargs)


# ── provider selection by environment ─────────────────────────────────────────
def test_testing_mode_selects_stub(settings):
    settings.PROVIDER_MODE = "testing"
    settings.AGORA_APP_ID = "app-123"
    settings.AGORA_APP_CERTIFICATE = CERT
    assert isinstance(default_meeting_token_provider(), StubMeetingTokenProvider)
    assert type(default_video_provider()).__name__ == "StubVideoProvider"


def test_production_mode_with_config_selects_agora(settings):
    settings.PROVIDER_MODE = "production"
    settings.AGORA_APP_ID = "app-123"
    settings.AGORA_APP_CERTIFICATE = CERT
    assert isinstance(default_meeting_token_provider(), AgoraMeetingTokenProvider)
    assert isinstance(default_video_provider(), AgoraVideoProvider)


def test_staging_counts_as_production(settings):
    settings.PROVIDER_MODE = "staging"
    settings.AGORA_APP_ID = "app-123"
    settings.AGORA_APP_CERTIFICATE = CERT
    assert isinstance(default_meeting_token_provider(), AgoraMeetingTokenProvider)


# ── environment configuration gating (missing config → stub fallback) ─────────
def test_production_without_certificate_falls_back_to_stub(settings):
    settings.PROVIDER_MODE = "production"
    settings.AGORA_APP_ID = "app-123"
    settings.AGORA_APP_CERTIFICATE = ""  # not configured
    assert isinstance(default_meeting_token_provider(), StubMeetingTokenProvider)


def test_provider_mode_default_is_read_from_settings(settings):
    settings.PROVIDER_MODE = "development"
    assert _provider_mode() == "development"


# ── the real adapters still satisfy the unchanged ports/DTO ───────────────────
def test_agora_adapters_implement_the_ports():
    assert isinstance(_agora(), MeetingTokenProvider)
    assert isinstance(AgoraVideoProvider(app_id="x"), VideoProvider)


def test_agora_issue_returns_a_videotoken_with_session_credentials_only():
    token = _agora().issue(channel="oneclub-s1", identity="user-9")
    assert isinstance(token, VideoToken)
    assert token.provider == "agora"
    assert token.channel == "oneclub-s1"
    assert token.token == "AGORA-RTC-TOKEN"
    assert token.app_id == "app-123"  # public app id only
    assert token.uid  # numeric-derived uid


# ── security: the certificate never leaks into the credential ─────────────────
def test_certificate_is_never_present_in_the_issued_token():
    token = _agora().issue(channel="c1", identity="u1")
    blob = " ".join(str(v) for v in vars(token).values())
    assert CERT not in blob
    # And the token object exposes no certificate/secret attribute.
    assert not any("cert" in a or "secret" in a for a in vars(token))


# ── graceful fallback: signing failure never breaks the join ──────────────────
def test_token_builder_failure_falls_back_to_stub():
    def boom(**_):
        raise RuntimeError("agora signing unavailable")

    token = _agora(token_builder=boom).issue(channel="c1", identity="u1")
    assert token.provider == "stub"  # degraded gracefully
    assert token.channel == "c1"


def test_missing_config_falls_back_to_stub():
    token = AgoraMeetingTokenProvider(app_id="", app_certificate="").issue(channel="c1", identity="u1")
    assert token.provider == "stub"


def test_empty_token_falls_back_to_stub():
    token = _agora(token_builder=lambda **_: "").issue(channel="c1", identity="u1")
    assert token.provider == "stub"


# ── timeout / TTL configuration is honoured ───────────────────────────────────
def test_token_ttl_is_configurable():
    from django.utils import timezone

    token = _agora(ttl_seconds=60).issue(channel="c1", identity="u1")
    delta = (token.expires_at - timezone.now()).total_seconds()
    assert 0 < delta <= 60 + 5


def test_video_provider_provisions_a_scoped_channel():
    assert AgoraVideoProvider(app_id="x").create_channel(session_id="s1") == "oneclub-s1"
