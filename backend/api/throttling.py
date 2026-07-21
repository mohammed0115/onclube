"""Resilient (fail-open) DRF throttles.

Throttle counters live in the default cache — Redis in production. DRF's throttles
call the cache on EVERY request, so if Redis is misconfigured or unreachable the
whole API would 500. These subclasses catch any cache error and allow the request
instead: abuse protection degrades gracefully rather than taking the site down.
"""
import logging

from rest_framework.throttling import (
    AnonRateThrottle,
    ScopedRateThrottle,
    UserRateThrottle,
)

_log = logging.getLogger("api.throttling")


class _FailOpenMixin:
    def allow_request(self, request, view):  # noqa: D401
        try:
            return super().allow_request(request, view)
        except Exception:  # noqa: BLE001 — cache/Redis down must not 500 the API
            _log.warning("throttle cache unavailable — allowing request (fail-open)")
            return True


class ResilientAnonThrottle(_FailOpenMixin, AnonRateThrottle):
    pass


class ResilientUserThrottle(_FailOpenMixin, UserRateThrottle):
    pass


class ResilientScopedThrottle(_FailOpenMixin, ScopedRateThrottle):
    pass
