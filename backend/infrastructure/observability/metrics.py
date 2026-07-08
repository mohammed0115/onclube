"""
Metrics collection (Sprint 11).

An in-process, provider-neutral metrics sink (counters + simple histograms). The
sink is swappable (`set_sink`) so a real backend — Prometheus/StatsD/OTel — can be
introduced later WITHOUT touching call sites. No business calculations happen here;
these are pure operational counters. Gated by settings.METRICS_ENABLED.
"""
from __future__ import annotations

import threading
from abc import ABC, abstractmethod
from collections import defaultdict

from django.conf import settings

# ── metric names (operational only) ───────────────────────────────────────────
HTTP_REQUESTS = "http.requests"
HTTP_DURATION_MS = "http.duration_ms"
PROVIDER_CALLS = "provider.calls"
SESSION_JOINS = "session.joins"
TRANSCRIPT_GENERATED = "transcript.generated"
AI_REPORT_GENERATED = "ai_report.generated"
BOOKINGS = "booking.created"
PAYMENT_APPROVALS = "payment.approved"
ERRORS = "errors"
TIMEOUTS = "timeouts"
RETRIES = "retries"
CONNECTION_FAILURES = "connection.failures"


def _key(name: str, labels: dict) -> str:
    if not labels:
        return name
    parts = ",".join(f"{k}={v}" for k, v in sorted(labels.items()))
    return f"{name}|{parts}"


class MetricsSink(ABC):
    @abstractmethod
    def increment(self, name: str, value: float = 1, **labels) -> None: ...

    @abstractmethod
    def observe(self, name: str, value: float, **labels) -> None: ...

    @abstractmethod
    def snapshot(self) -> dict: ...

    @abstractmethod
    def reset(self) -> None: ...


class InProcessMetrics(MetricsSink):
    def __init__(self):
        self._counters: dict[str, float] = defaultdict(float)
        self._hist: dict[str, list] = defaultdict(list)
        self._lock = threading.Lock()

    def increment(self, name: str, value: float = 1, **labels) -> None:
        with self._lock:
            self._counters[_key(name, labels)] += value

    def observe(self, name: str, value: float, **labels) -> None:
        with self._lock:
            self._hist[_key(name, labels)].append(value)

    def snapshot(self) -> dict:
        with self._lock:
            hist = {
                k: {"count": len(v), "sum": sum(v), "avg": (sum(v) / len(v) if v else 0)}
                for k, v in self._hist.items()
            }
            return {"counters": dict(self._counters), "histograms": hist}

    def reset(self) -> None:
        with self._lock:
            self._counters.clear()
            self._hist.clear()


_sink: MetricsSink = InProcessMetrics()


def _enabled() -> bool:
    return getattr(settings, "METRICS_ENABLED", True)


def set_sink(sink: MetricsSink) -> None:
    """Swap the collector (e.g. for a real metrics backend). Composition-root only."""
    global _sink
    _sink = sink


def increment(name: str, value: float = 1, **labels) -> None:
    if _enabled():
        _sink.increment(name, value, **labels)


def observe(name: str, value: float, **labels) -> None:
    if _enabled():
        _sink.observe(name, value, **labels)


def snapshot() -> dict:
    return _sink.snapshot()


def reset() -> None:
    _sink.reset()
