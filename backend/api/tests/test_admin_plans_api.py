"""API tests for admin plan management (Phase 9): create / list / update + authz."""
import pytest
from rest_framework.test import APIClient

from apps.admin_ops.models import AdminAction
from apps.billing.models import Plan
from apps.common.factories import make_admin, make_instructor, make_plan, make_student

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_admin_can_create_list_and_update_plan():
    admin = make_admin()
    c = client_for(admin)

    # create
    r = c.post("/api/v1/admin/plans/", {"code": "pro", "name": "Pro", "price": "30000", "sessions_per_month": 8}, format="json")
    assert r.status_code == 201, r.content
    pid = r.json()["id"]
    assert Plan.objects.filter(code="pro").exists()
    assert AdminAction.objects.filter(action_type="plan_created", target_id=pid).exists()

    # list includes the new plan
    codes = [p["code"] for p in c.get("/api/v1/admin/plans/").json()]
    assert "pro" in codes

    # update -> disable + price change (audited)
    r = c.patch(f"/api/v1/admin/plans/{pid}/", {"active": False, "price": "25000"}, format="json")
    assert r.status_code == 200, r.content
    p = Plan.objects.get(pk=pid)
    assert p.active is False
    assert str(p.price) == "25000.00"
    assert AdminAction.objects.filter(action_type="plan_updated", target_id=pid).exists()


def test_list_includes_inactive_plans():
    admin = make_admin()
    inactive = make_plan()
    inactive.active = False
    inactive.save(update_fields=["active"])
    codes = [p["code"] for p in client_for(admin).get("/api/v1/admin/plans/").json()]
    assert inactive.code in codes


def test_duplicate_code_rejected():
    admin = make_admin()
    existing = make_plan()
    r = client_for(admin).post(
        "/api/v1/admin/plans/", {"code": existing.code, "name": "Dup", "price": "1", "sessions_per_month": 1}, format="json"
    )
    assert r.status_code == 409  # duplicate code = conflict


def test_non_admin_cannot_manage_plans():
    for profile in (make_student(), make_instructor()):
        r = client_for(profile.user).get("/api/v1/admin/plans/")
        assert r.status_code == 403
        r = client_for(profile.user).post(
            "/api/v1/admin/plans/", {"code": "x", "name": "X", "price": "1", "sessions_per_month": 1}, format="json"
        )
        assert r.status_code == 403
    # anonymous
    assert APIClient().get("/api/v1/admin/plans/").status_code == 401
