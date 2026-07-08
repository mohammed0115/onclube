"""
Observability & monitoring — Sprint 11.

Covers structured logging, request correlation, health endpoints, metrics
collection, trace hooks, provider-failure capture, secret masking, and config.
"""
import json
import logging

import pytest
from rest_framework.test import APIClient

from infrastructure.observability import context, health, metrics, tracing
from infrastructure.observability.logging import StructuredFormatter, log_event
from infrastructure.observability.masking import mask
from infrastructure.observability.middleware import RequestObservabilityMiddleware


@pytest.fixture(autouse=True)
def _clean():
    context.reset()
    metrics.reset()
    yield
    context.reset()
    metrics.reset()


# ── structured logging: fixed schema, ids from context ────────────────────────
def test_log_event_has_the_required_schema():
    context.bind(request_id="r1", correlation_id="c1", user_role="student", user_id="u9", session_id="s1")
    event = log_event("session.join", status="ok", provider="agora", duration_ms=42)
    for key in ("timestamp", "requestId", "correlationId", "userRole", "userId",
                "sessionId", "provider", "operation", "duration", "status", "severity"):
        assert key in event
    assert event["requestId"] == "r1" and event["correlationId"] == "c1"
    assert event["userRole"] == "student" and event["userId"] == "u9"
    assert event["provider"] == "agora" and event["operation"] == "session.join"


def test_structured_formatter_emits_single_json_line():
    context.bind(request_id="r1")
    record = logging.LogRecord("observability", logging.INFO, __file__, 1, "op", None, None)
    record.event = log_event("http.request", status="ok")
    line = StructuredFormatter().format(record)
    parsed = json.loads(line)  # one valid JSON object
    assert parsed["operation"] == "http.request"


# ── secret masking: never log secrets/content ─────────────────────────────────
def test_masking_redacts_secrets_and_content():
    masked = mask({
        "password": "hunter2",
        "token": "abc",
        "api_key": "sk-live-123",
        "certificate": "CERT",
        "prompt": "system prompt text",
        "transcript": "the student said hello",
        "message": "personal message",
        "keep": "ok",
        "nested": {"authorization": "Bearer x", "safe": 1},
    })
    for k in ("password", "token", "api_key", "certificate", "prompt", "transcript", "message"):
        assert masked[k] == "[REDACTED]"
    assert masked["keep"] == "ok" and masked["nested"]["safe"] == 1
    assert masked["nested"]["authorization"] == "[REDACTED]"


def test_masking_redacts_secret_looking_values():
    assert mask("Bearer abc.def.ghijklmnopqrstuvwxyz0123456789ABCDEF") == "[REDACTED]"
    assert mask("sk-abcdef") == "[REDACTED]"


def test_log_event_meta_is_masked():
    event = log_event("provider.call", api_key="sk-secret", channel="oneclub-s1")
    assert event["meta"]["api_key"] == "[REDACTED]"
    assert event["meta"]["channel"] == "oneclub-s1"


# ── metrics collection ────────────────────────────────────────────────────────
def test_metrics_counters_and_histograms():
    metrics.increment(metrics.SESSION_JOINS)
    metrics.increment(metrics.SESSION_JOINS)
    metrics.increment(metrics.PROVIDER_CALLS, provider="agora")
    metrics.observe(metrics.HTTP_DURATION_MS, 10, method="GET")
    snap = metrics.snapshot()
    assert snap["counters"][metrics.SESSION_JOINS] == 2
    assert snap["counters"]["provider.calls|provider=agora"] == 1
    assert snap["histograms"]["http.duration_ms|method=GET"]["count"] == 1


def test_metrics_can_be_disabled(settings):
    settings.METRICS_ENABLED = False
    metrics.increment(metrics.ERRORS)
    assert metrics.snapshot()["counters"] == {}


# ── trace hooks: start / finish / duration / failure ──────────────────────────
def test_trace_success_records_finish_and_provider_call():
    records = []
    handler = logging.Handler()
    handler.emit = records.append  # capture directly (the logger does not propagate)
    lg = logging.getLogger("observability")
    lg.addHandler(handler)
    old = lg.level
    lg.setLevel(logging.DEBUG)
    try:
        with tracing.trace("provider.mint", provider="agora"):
            pass
    finally:
        lg.removeHandler(handler)
        lg.setLevel(old)
    statuses = {r.event["status"] for r in records if hasattr(r, "event")}
    assert "start" in statuses and "finish" in statuses
    assert metrics.snapshot()["counters"]["provider.calls|provider=agora"] == 1


def test_trace_failure_records_failure_and_error_metric_and_reraises():
    with pytest.raises(ValueError):
        with tracing.trace("provider.mint", provider="agora"):
            raise ValueError("boom")
    counters = metrics.snapshot()["counters"]
    assert counters["errors|operation=provider.mint"] == 1


def test_trace_can_be_disabled(settings):
    settings.TRACING_ENABLED = False
    with tracing.trace("noop"):
        pass
    assert metrics.snapshot()["counters"] == {}  # nothing recorded


def test_provider_failure_helpers():
    tracing.record_timeout(provider="openai")
    tracing.record_retry(provider="openai")
    tracing.record_connection_failure(provider="agora")
    counters = metrics.snapshot()["counters"]
    assert counters["timeouts|provider=openai"] == 1
    assert counters["retries|provider=openai"] == 1
    assert counters["connection.failures|provider=agora"] == 1


# ── request correlation middleware ────────────────────────────────────────────
def test_middleware_generates_and_echoes_request_id(rf):
    captured = {}

    def get_response(request):
        captured["request_id"] = context.request_id()
        from django.http import HttpResponse
        return HttpResponse("ok")

    mw = RequestObservabilityMiddleware(get_response)
    resp = mw(rf.get("/api/v1/health/liveness/"))
    assert resp["X-Request-ID"]  # generated
    assert captured["request_id"] == resp["X-Request-ID"]  # same id inside the request


def test_middleware_propagates_incoming_request_id(rf):
    def get_response(request):
        from django.http import HttpResponse
        return HttpResponse("ok")

    mw = RequestObservabilityMiddleware(get_response)
    resp = mw(rf.get("/x/", HTTP_X_REQUEST_ID="incoming-123"))
    assert resp["X-Request-ID"] == "incoming-123"
    assert resp["X-Correlation-ID"] == "incoming-123"


def test_middleware_records_http_metric(rf):
    def get_response(request):
        from django.http import HttpResponse
        return HttpResponse("ok")

    RequestObservabilityMiddleware(get_response)(rf.get("/x/"))
    counters = metrics.snapshot()["counters"]
    assert any(k.startswith("http.requests") for k in counters)


# ── health endpoints (via the API, unauthenticated) ───────────────────────────
@pytest.mark.django_db
def test_liveness_endpoint():
    resp = APIClient().get("/api/v1/health/liveness/")
    assert resp.status_code == 200 and resp.data["status"] == "alive"


@pytest.mark.django_db
def test_readiness_endpoint_checks_database():
    resp = APIClient().get("/api/v1/health/readiness/")
    assert resp.status_code == 200
    assert resp.data["checks"]["database"]["status"] == "ok"


@pytest.mark.django_db
def test_providers_health_reports_mode_without_secrets():
    resp = APIClient().get("/api/v1/health/providers/")
    assert resp.status_code == 200
    blob = str(resp.data).lower()
    # No secret values/keys — "meeting_token" is a PORT name, not a secret, so
    # we check for actual secret markers.
    for banned in ("certificate", "secret", "api_key", "apikey", "app_certificate", "sk-"):
        assert banned not in blob
    assert resp.data["providers"]["mode"] in ("testing", "development", "staging", "production")


@pytest.mark.django_db
def test_health_can_be_disabled(settings):
    settings.HEALTHCHECK_ENABLED = False
    assert APIClient().get("/api/v1/health/liveness/").status_code == 404


# ── configuration surface present ─────────────────────────────────────────────
def test_observability_config_is_environment_driven(settings):
    for name in ("LOG_LEVEL", "METRICS_ENABLED", "TRACING_ENABLED", "HEALTHCHECK_ENABLED", "OBSERVABILITY_MODE"):
        assert hasattr(settings, name)


# ── architecture: the DOMAIN stays logging-free ───────────────────────────────
def test_domain_has_no_logging_or_print():
    import pathlib

    domain_dir = pathlib.Path(__file__).resolve().parents[2] / "domain"
    offenders = []
    for path in domain_dir.rglob("*.py"):
        src = path.read_text(encoding="utf-8")
        if "import logging" in src or "logging." in src or "print(" in src:
            offenders.append(str(path))
    assert offenders == [], offenders
