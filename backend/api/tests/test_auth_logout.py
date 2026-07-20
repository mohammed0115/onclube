"""
Server-side logout + refresh-token revocation.

Proves the security fix: after logout (or after a refresh, thanks to rotation +
blacklist) a refresh token can no longer mint new access tokens — so a captured or
shared session can be killed, and a stale session can't silently persist.
"""
import pytest
from rest_framework.test import APIClient

from apps.common.factories import make_student

pytestmark = pytest.mark.django_db

PW = "pw-test-123"


def _tokens(email):
    r = APIClient().post("/api/v1/auth/token/", {"email": email, "password": PW}, format="json")
    assert r.status_code == 200, r.data
    return r.data["access"], r.data["refresh"]


def test_logout_blacklists_refresh_so_it_cannot_refresh():
    student = make_student()
    _access, refresh = _tokens(student.user.email)

    out = APIClient().post("/api/v1/auth/logout/", {"refresh": refresh}, format="json")
    assert out.status_code == 200 and out.data["loggedOut"] is True

    # The revoked refresh token can no longer obtain a new access token.
    again = APIClient().post("/api/v1/auth/token/refresh/", {"refresh": refresh}, format="json")
    assert again.status_code == 401


def test_logout_is_idempotent():
    student = make_student()
    _access, refresh = _tokens(student.user.email)
    APIClient().post("/api/v1/auth/logout/", {"refresh": refresh}, format="json")
    # Second logout with the same (now blacklisted) token still succeeds.
    second = APIClient().post("/api/v1/auth/logout/", {"refresh": refresh}, format="json")
    assert second.status_code == 200


def test_logout_requires_a_refresh_token():
    r = APIClient().post("/api/v1/auth/logout/", {}, format="json")
    assert r.status_code == 400


def test_refresh_rotation_blacklists_the_old_token():
    student = make_student()
    _access, refresh = _tokens(student.user.email)
    # Rotation on: refreshing returns a NEW refresh and blacklists the old one.
    rotated = APIClient().post("/api/v1/auth/token/refresh/", {"refresh": refresh}, format="json")
    assert rotated.status_code == 200
    assert "refresh" in rotated.data  # a fresh refresh token was issued
    reused = APIClient().post("/api/v1/auth/token/refresh/", {"refresh": refresh}, format="json")
    assert reused.status_code == 401  # the old one no longer works
