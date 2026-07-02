"""
Production safety helpers for settings.

These are pure functions so the "fail-closed in production" behaviour is unit
testable without booting a separate settings module. The rule everywhere: when
DEBUG is False (production), insecure defaults are refused rather than silently
accepted.
"""
from django.core.exceptions import ImproperlyConfigured

DEV_SECRET_KEY = "dev-insecure-key-change-me"
# Values that must never be used as a real SECRET_KEY.
INSECURE_SECRET_KEYS = {"", None, DEV_SECRET_KEY}


def resolve_secret_key(value, *, debug):
    """Return a usable SECRET_KEY, or raise in production if it is missing/insecure."""
    if value not in INSECURE_SECRET_KEYS:
        return value
    if debug:
        return DEV_SECRET_KEY
    raise ImproperlyConfigured(
        "SECRET_KEY must be set to a strong, non-default value when DEBUG is False. "
        "Set the SECRET_KEY environment variable."
    )


def resolve_allowed_hosts(hosts, *, debug):
    """Return a non-wildcard host list, or raise in production if none is configured."""
    cleaned = [h for h in (hosts or []) if h and h != "*"]
    if cleaned:
        return cleaned
    if debug:
        return ["localhost", "127.0.0.1", "[::1]"]
    raise ImproperlyConfigured(
        "ALLOWED_HOSTS must be set to explicit hostnames (not empty and not '*') "
        "when DEBUG is False. Set the ALLOWED_HOSTS environment variable."
    )


def secure_flags(*, debug):
    """
    Production HTTPS/cookie hardening. Returns an empty dict in DEBUG so local dev
    and the test client keep working over plain HTTP.
    """
    if debug:
        return {}
    return {
        "SECURE_SSL_REDIRECT": True,
        "SESSION_COOKIE_SECURE": True,
        "CSRF_COOKIE_SECURE": True,
        "SECURE_HSTS_SECONDS": 60 * 60 * 24 * 365,  # 1 year
        "SECURE_HSTS_INCLUDE_SUBDOMAINS": True,
        "SECURE_HSTS_PRELOAD": True,
        "SECURE_CONTENT_TYPE_NOSNIFF": True,
        # Trust the reverse proxy's X-Forwarded-Proto for the HTTPS check.
        "SECURE_PROXY_SSL_HEADER": ("HTTP_X_FORWARDED_PROTO", "https"),
    }
