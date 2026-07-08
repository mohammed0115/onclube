"""
Health checks (Sprint 11).

Operational readiness/liveness plus provider availability. Liveness = the process
answers. Readiness = critical dependencies (database, cache) are usable. Providers
= which live-session adapter is selected per mode. NO secrets are ever returned —
provider health reports only "stub" vs "configured" and the mode.
"""
from __future__ import annotations

from django.conf import settings
from django.core.cache import caches
from django.db import connections


def liveness() -> dict:
    return {"status": "alive"}


def _check_database() -> dict:
    try:
        with connections["default"].cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return {"status": "ok"}
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "detail": type(exc).__name__}


def _check_cache() -> dict:
    try:
        cache = caches["default"]
    except Exception:  # noqa: BLE001
        return {"status": "skipped", "required": False}
    backend = type(cache).__name__
    if "Dummy" in backend or "Locmem" in backend:
        # Not a shared cache — informational only, not required for readiness.
        return {"status": "ok", "backend": backend, "required": False}
    try:
        cache.set("healthcheck", "1", 5)
        ok = cache.get("healthcheck") == "1"
        return {"status": "ok" if ok else "error", "backend": backend, "required": False}
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "detail": type(exc).__name__, "required": False}


def _check_queue() -> dict:
    # No broker configured in this deployment — reported, not required.
    if not getattr(settings, "CELERY_BROKER_URL", ""):
        return {"status": "not_configured", "required": False}
    return {"status": "unknown", "required": False}


def _provider_health() -> dict:
    """Which adapter each provider port resolves to — NO app ids/certs/secrets."""
    mode = getattr(settings, "PROVIDER_MODE", "development")
    prod = mode in ("staging", "production")
    agora_configured = bool(getattr(settings, "AGORA_APP_ID", ""))
    token_configured = agora_configured and bool(getattr(settings, "AGORA_APP_CERTIFICATE", ""))
    report_configured = bool(getattr(settings, "OPENAI_API_KEY", ""))

    def adapter(configured: bool) -> str:
        return "configured" if (prod and configured) else "stub"

    return {
        "mode": mode,
        "video": adapter(agora_configured),
        "meeting_token": adapter(token_configured),
        "session_report": adapter(report_configured),
    }


def readiness() -> dict:
    checks = {
        "database": _check_database(),
        "cache": _check_cache(),
        "queue": _check_queue(),
    }
    critical_ok = all(
        c.get("status") == "ok" for c in checks.values() if c.get("required", True)
    )
    return {"status": "ready" if critical_ok else "unavailable", "checks": checks}


def providers() -> dict:
    return {"status": "ok", "providers": _provider_health()}
