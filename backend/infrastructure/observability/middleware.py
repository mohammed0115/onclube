"""
Request correlation + HTTP observability middleware (Sprint 11).

Generates or propagates X-Request-ID and a correlation id, binds them into the
request-scoped context so every downstream log/metric/trace shares them, times the
request, records HTTP + selected domain metrics, and echoes the ids back on the
response. It NEVER changes the response body or status — it only adds headers and
observes. Any failure inside the middleware is swallowed so observability can
never break a request.
"""
from __future__ import annotations

import time
import uuid

from . import metrics
from .context import bind, reset
from .logging import log_event

REQUEST_ID_HEADER = "HTTP_X_REQUEST_ID"
CORRELATION_HEADER = "HTTP_X_CORRELATION_ID"


class RequestObservabilityMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = _clean(request.META.get(REQUEST_ID_HEADER)) or uuid.uuid4().hex
        correlation_id = _clean(request.META.get(CORRELATION_HEADER)) or request_id
        bind(request_id=request_id, correlation_id=correlation_id)

        start = time.perf_counter()
        try:
            response = self.get_response(request)
        except Exception:
            # Unhandled below the exception handler → count + re-raise (handler logs).
            _safe(lambda: metrics.increment(metrics.ERRORS, kind="unhandled"))
            reset()
            raise

        duration = int((time.perf_counter() - start) * 1000)
        _safe(lambda: self._observe(request, response, duration, request_id, correlation_id))
        reset()
        return response

    def _observe(self, request, response, duration, request_id, correlation_id):
        # Correlation ids echoed for the client + any downstream hop.
        response["X-Request-ID"] = request_id
        response["X-Correlation-ID"] = correlation_id

        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            bind(user_id=str(getattr(user, "id", "")), user_role=getattr(user, "role", None))

        status_code = response.status_code
        metrics.increment(metrics.HTTP_REQUESTS, method=request.method, status=str(status_code))
        metrics.observe(metrics.HTTP_DURATION_MS, duration, method=request.method)
        if status_code >= 500:
            metrics.increment(metrics.ERRORS, kind="http_5xx")
        self._domain_metric(request, response)

        log_event(
            "http.request",
            status="ok" if status_code < 400 else "error",
            severity="info" if status_code < 500 else "error",
            duration_ms=duration,
            http_method=request.method,
            http_status=status_code,
            path=request.path,  # opaque ids only; never query/body
        )

    def _domain_metric(self, request, response):
        if response.status_code >= 400 or request.method != "POST":
            return
        p = request.path
        if p.startswith("/api/v1/sessions/") and p.endswith("/join/"):
            metrics.increment(metrics.SESSION_JOINS)
        elif p.endswith("/report/generate/"):
            metrics.increment(metrics.AI_REPORT_GENERATED)
        elif p.endswith("/transcript/"):
            metrics.increment(metrics.TRANSCRIPT_GENERATED)
        elif p.startswith("/api/v1/student/bookings"):
            metrics.increment(metrics.BOOKINGS)
        elif "payment-proofs" in p and p.endswith("/approve/"):
            metrics.increment(metrics.PAYMENT_APPROVALS)


def _clean(value):
    if not value:
        return None
    v = str(value).strip()
    # Only accept a sane token to avoid header injection into logs.
    return v[:128] if v and all(c.isalnum() or c in "-_." for c in v) else None


def _safe(fn):
    try:
        fn()
    except Exception:  # noqa: BLE001 — observability must never break a request
        pass
