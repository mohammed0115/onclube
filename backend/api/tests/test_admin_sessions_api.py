"""Admin Part B — sessions monitor."""
import pytest
from rest_framework.test import APIClient
from apps.common.factories import make_admin, make_session, make_student

pytestmark = pytest.mark.django_db


def test_admin_lists_all_sessions():
    make_session()
    admin = make_admin()
    c = APIClient(); c.force_authenticate(user=admin)
    resp = c.get("/api/v1/admin/sessions/")
    assert resp.status_code == 200 and len(resp.data) >= 1
    assert {"id", "topicTitle", "instructorName", "studentName", "status"} <= set(resp.data[0].keys())


def test_non_admin_forbidden():
    c = APIClient(); c.force_authenticate(user=make_student().user)
    assert c.get("/api/v1/admin/sessions/").status_code in (403, 404)
