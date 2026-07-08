"""
Request-scoped observability context (Sprint 11).

Correlation identifiers and safe request metadata are stored in contextvars so any
log/metric/trace emitted anywhere during a request carries the SAME requestId and
correlationId — across use cases and providers — without threading them through
signatures. Only safe metadata is stored (ids/role — never secrets or content).
"""
from __future__ import annotations

import contextvars

_request_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("obs_request_id", default=None)
_correlation_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("obs_correlation_id", default=None)
_user_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("obs_user_id", default=None)
_user_role: contextvars.ContextVar[str | None] = contextvars.ContextVar("obs_user_role", default=None)
_session_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("obs_session_id", default=None)

_VARS = {
    "request_id": _request_id,
    "correlation_id": _correlation_id,
    "user_id": _user_id,
    "user_role": _user_role,
    "session_id": _session_id,
}


def bind(**kwargs) -> None:
    """Set any of request_id / correlation_id / user_id / user_role / session_id."""
    for key, value in kwargs.items():
        var = _VARS.get(key)
        if var is not None:
            var.set(value)


def get_context() -> dict:
    return {key: var.get() for key, var in _VARS.items()}


def reset() -> None:
    for var in _VARS.values():
        var.set(None)


def request_id() -> str | None:
    return _request_id.get()


def correlation_id() -> str | None:
    return _correlation_id.get()
