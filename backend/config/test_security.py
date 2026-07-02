"""
Tests for the fail-closed production settings helpers (config/security.py).

These assert that production (DEBUG=False) refuses insecure defaults and that
the HTTPS/cookie hardening only turns on in production.
"""
import pytest
from django.core.exceptions import ImproperlyConfigured

from config.security import (
    DEV_SECRET_KEY,
    resolve_allowed_hosts,
    resolve_secret_key,
    secure_flags,
)


# ── SECRET_KEY ────────────────────────────────────────────────────────────────
def test_secret_key_required_in_production_when_missing():
    with pytest.raises(ImproperlyConfigured):
        resolve_secret_key(None, debug=False)


def test_secret_key_rejected_in_production_when_default():
    with pytest.raises(ImproperlyConfigured):
        resolve_secret_key(DEV_SECRET_KEY, debug=False)
    with pytest.raises(ImproperlyConfigured):
        resolve_secret_key("", debug=False)


def test_secret_key_accepted_in_production_when_strong():
    assert resolve_secret_key("a-strong-random-value", debug=False) == "a-strong-random-value"


def test_secret_key_falls_back_to_dev_key_in_debug():
    assert resolve_secret_key(None, debug=True) == DEV_SECRET_KEY


# ── ALLOWED_HOSTS ─────────────────────────────────────────────────────────────
def test_allowed_hosts_required_in_production():
    with pytest.raises(ImproperlyConfigured):
        resolve_allowed_hosts([], debug=False)


def test_allowed_hosts_wildcard_rejected_in_production():
    with pytest.raises(ImproperlyConfigured):
        resolve_allowed_hosts(["*"], debug=False)


def test_allowed_hosts_explicit_accepted_in_production():
    assert resolve_allowed_hosts(["oneclub.example"], debug=False) == ["oneclub.example"]


def test_allowed_hosts_defaults_to_localhost_in_debug():
    assert resolve_allowed_hosts([], debug=True) == ["localhost", "127.0.0.1", "[::1]"]


# ── secure flags ──────────────────────────────────────────────────────────────
def test_secure_flags_empty_in_debug():
    assert secure_flags(debug=True) == {}


def test_secure_flags_hardened_in_production():
    flags = secure_flags(debug=False)
    assert flags["SECURE_SSL_REDIRECT"] is True
    assert flags["SESSION_COOKIE_SECURE"] is True
    assert flags["CSRF_COOKIE_SECURE"] is True
    assert flags["SECURE_HSTS_SECONDS"] >= 31536000
    assert flags["SECURE_HSTS_INCLUDE_SUBDOMAINS"] is True
    assert flags["SECURE_CONTENT_TYPE_NOSNIFF"] is True
    assert flags["SECURE_PROXY_SSL_HEADER"] == ("HTTP_X_FORWARDED_PROTO", "https")
