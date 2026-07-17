"""Rate-limiting — the auth endpoints are throttled to blunt credential-stuffing.

The suite disables throttling globally (settings_test) so ordinary tests never see
spurious 429s. DRF binds ``APIView.throttle_classes`` at import time, so we can't
re-enable it with ``override_settings`` alone — we patch ``throttle_classes`` onto
the real auth views and set a tiny ``auth`` rate, proving the wiring + 429 mapping.
"""
from contextlib import contextmanager
from unittest import mock

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from api.urls import _ThrottledTokenObtainPairView
from api.views import RegisterView

pytestmark = pytest.mark.django_db


@contextmanager
def auth_throttle(view, rate="2/min"):
    """Force the ScopedRateThrottle onto `view` with a tiny `auth` rate.

    Both ``APIView.throttle_classes`` and ``SimpleRateThrottle.THROTTLE_RATES`` are
    bound at import time from the (throttle-disabled) test settings, so we patch
    the class attributes directly rather than via override_settings — deterministic
    regardless of test order. The shared throttle cache is cleared around the test.
    """
    cache.clear()
    with mock.patch.object(ScopedRateThrottle, "THROTTLE_RATES", {"auth": rate}), \
         mock.patch.object(view, "throttle_classes", [ScopedRateThrottle]):
        try:
            yield
        finally:
            cache.clear()


def test_login_endpoint_is_throttled_after_the_limit():
    with auth_throttle(_ThrottledTokenObtainPairView):
        c = APIClient()
        payload = {"email": "nobody@example.com", "password": "wrong-password"}
        statuses = [c.post("/api/v1/auth/token/", payload, format="json").status_code for _ in range(3)]
        assert statuses[-1] == 429  # first two allowed (401), third throttled
        last = c.post("/api/v1/auth/token/", payload, format="json")
        assert last.status_code == 429
        assert last.data["code"] == "throttled"


def test_registration_endpoint_is_throttled():
    with auth_throttle(RegisterView):
        c = APIClient()
        body = {"fullName": "A B", "email": "a@b.co", "password": "Sup3rStrongPw!"}
        codes = [c.post("/api/v1/auth/register/", body, format="json").status_code for _ in range(4)]
        assert 429 in codes
