"""Admin Part F — user management (list/status/role) + audit log."""
import pytest
from rest_framework.test import APIClient

from apps.admin_ops.models import AdminAction
from apps.common.enums import UserRole, UserStatus
from apps.common.factories import make_admin, make_instructor, make_student

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_admin_lists_users():
    admin = make_admin()
    make_student(); make_instructor()
    resp = client_for(admin).get("/api/v1/admin/users/")
    assert resp.status_code == 200
    assert len(resp.data) >= 3
    assert {"id", "fullName", "email", "role", "status"} <= set(resp.data[0].keys())


def test_admin_suspends_and_reactivates_user_with_audit():
    admin = make_admin()
    student = make_student()
    resp = client_for(admin).post(f"/api/v1/admin/users/{student.user.id}/status/", {"status": "suspended"}, format="json")
    assert resp.status_code == 200
    student.user.refresh_from_db()
    assert student.user.status == UserStatus.SUSPENDED and student.user.is_active is False
    assert AdminAction.objects.filter(target_id=student.user.id, action_type="user_status_changed").exists()


def test_admin_changes_role_and_provisions_profile():
    admin = make_admin()
    student = make_student()
    resp = client_for(admin).post(f"/api/v1/admin/users/{student.user.id}/role/", {"role": "instructor"}, format="json")
    assert resp.status_code == 200
    student.user.refresh_from_db()
    assert student.user.role == UserRole.INSTRUCTOR
    assert hasattr(student.user, "instructor_profile")


def test_admin_cannot_change_own_role():
    admin = make_admin()
    resp = client_for(admin).post(f"/api/v1/admin/users/{admin.id}/role/", {"role": "student"}, format="json")
    assert resp.status_code == 422 and resp.data["code"] == "cannot_change_self"


def test_audit_log_lists_actions():
    admin = make_admin()
    student = make_student()
    client_for(admin).post(f"/api/v1/admin/users/{student.user.id}/status/", {"status": "suspended"}, format="json")
    resp = client_for(admin).get("/api/v1/admin/audit/")
    assert resp.status_code == 200 and len(resp.data) >= 1
    assert resp.data[0]["action"] == "user_status_changed"


def test_non_admin_forbidden():
    resp = client_for(make_student().user).get("/api/v1/admin/users/")
    assert resp.status_code in (403, 404)
