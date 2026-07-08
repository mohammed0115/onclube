"""
Tracing hooks (Sprint 11).

A vendor-neutral tracing abstraction: every traced operation exposes start,
finish, duration, and failure via a context manager. NO external tracing vendor is
introduced — this is the seam a real tracer (OpenTelemetry, etc.) plugs into later.
Gated by settings.TRACING_ENABLED. Tracing composes structured logs + metrics.
"""
from __future__ import annotations

import time
from contextlib import contextmanager

from django.conf import settings

from . import metrics
from .logging import log_event


def _enabled() -> bool:
    return getattr(settings, "TRACING_ENABLED", True)


@contextmanager
def trace(operation: str, *, provider: str | None = None, session_id: str | None = None):
    """Trace an operation: emits start/finish/failure with a duration. On failure
    the exception propagates unchanged (observability never swallows errors)."""
    if not _enabled():
        yield
        return
    start = time.perf_counter()
    log_event(operation, status="start", severity="debug", provider=provider, session_id=session_id)
    try:
        yield
    except Exception as exc:
        duration = int((time.perf_counter() - start) * 1000)
        metrics.increment(metrics.ERRORS, operation=operation)
        log_event(
            operation, status="failure", severity="error", provider=provider,
            session_id=session_id, duration_ms=duration, error=type(exc).__name__,
        )
        raise
    else:
        duration = int((time.perf_counter() - start) * 1000)
        if provider:
            metrics.increment(metrics.PROVIDER_CALLS, provider=provider)
        log_event(
            operation, status="finish", severity="info", provider=provider,
            session_id=session_id, duration_ms=duration,
        )


def record_timeout(*, provider: str | None = None, operation: str | None = None) -> None:
    metrics.increment(metrics.TIMEOUTS, **{k: v for k, v in {"provider": provider, "operation": operation}.items() if v})


def record_retry(*, provider: str | None = None, operation: str | None = None) -> None:
    metrics.increment(metrics.RETRIES, **{k: v for k, v in {"provider": provider, "operation": operation}.items() if v})


def record_connection_failure(*, provider: str | None = None) -> None:
    metrics.increment(metrics.CONNECTION_FAILURES, **({"provider": provider} if provider else {}))
