"""Admin Parts D+E — business overview + platform status."""
import pytest
from rest_framework.test import APIClient
from apps.common.factories import make_admin, make_student

pytestmark = pytest.mark.django_db


def _c(u):
    c = APIClient(); c.force_authenticate(user=u); return c


def test_business_overview():
    r = _c(make_admin()).get("/api/v1/admin/business/")
    assert r.status_code == 200
    assert {"totalRevenue", "activeSubscriptions", "completedSessions", "teacherHours", "plans", "trend"} <= set(r.data.keys())


def test_platform_status():
    r = _c(make_admin()).get("/api/v1/admin/platform/")
    assert r.status_code == 200
    assert "providers" in r.data and "aiQueue" in r.data


def test_non_admin_forbidden():
    assert _c(make_student().user).get("/api/v1/admin/business/").status_code in (403, 404)
