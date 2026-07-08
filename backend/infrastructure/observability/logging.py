"""
Structured logging (Sprint 11).

Every observability log is a single JSON object with a fixed, safe schema:
timestamp, requestId, correlationId, userRole, userId, sessionId, provider,
operation, duration, status, severity. There is NO free-form logging and NO
print() — callers emit events via `log_event`, and free metadata is masked.

Infrastructure owns this module; the domain never imports it.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from .context import get_context
from .masking import mask

logger = logging.getLogger("observability")


class StructuredFormatter(logging.Formatter):
    """Render a record as one JSON line. If the record carries a prepared `event`
    dict (from log_event) it is used verbatim; otherwise a minimal envelope is
    produced so nothing is ever free-form."""

    def format(self, record: logging.LogRecord) -> str:
        event = getattr(record, "event", None)
        if event is None:
            event = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "operation": record.name,
                "message": record.getMessage(),
                "severity": record.levelname.lower(),
                "status": "info",
            }
        return json.dumps(event, default=str)


def log_event(
    operation: str,
    *,
    status: str = "ok",
    severity: str = "info",
    provider: str | None = None,
    duration_ms: int | None = None,
    session_id: str | None = None,
    **meta,
) -> dict:
    """Emit ONE structured event. Returns the event dict (handy for tests)."""
    ctx = get_context()
    event = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "requestId": ctx.get("request_id"),
        "correlationId": ctx.get("correlation_id"),
        "userRole": ctx.get("user_role"),
        "userId": ctx.get("user_id"),  # internal id only — never PII/email
        "sessionId": session_id or ctx.get("session_id"),
        "provider": provider,
        "operation": operation,
        "duration": duration_ms,
        "status": status,
        "severity": severity,
    }
    if meta:
        event["meta"] = mask(meta)  # free metadata is always masked
    level = getattr(logging, severity.upper(), logging.INFO)
    logger.log(level, operation, extra={"event": event})
    return event
