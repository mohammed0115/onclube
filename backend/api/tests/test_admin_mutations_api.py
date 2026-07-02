"""
API tests for the admin money / session mutation endpoints.

Each endpoint asserts the full access matrix:
  * admin allowed
  * student forbidden (403)
  * instructor forbidden (403)
  * unauthenticated rejected (401)
  * invalid input returns the standard {code, detail} error envelope

These endpoints directly alter subscriptions / credits / bookings, so their
authorization and input handling must be pinned down.
"""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.common.factories import (
    make_active_subscription,
    make_admin,
    make_booking,
    make_instructor,
    make_pending_payment_proof,
    make_plan,
    make_student,
)

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _assert_forbidden_for_non_admins(method, url, body):
    """student + instructor => 403 permission_denied; anonymous => 401."""
    call = lambda client: getattr(client, method)(url, body, format="json")

    student_resp = call(client_for(make_student().user))
    assert student_resp.status_code == 403
    assert student_resp.data["code"] == "permission_denied"

    instructor_resp = call(client_for(make_instructor().user))
    assert instructor_resp.status_code == 403
    assert instructor_resp.data["code"] == "permission_denied"

    anon_resp = call(APIClient())  # no credentials
    assert anon_resp.status_code == 401
    assert "code" in anon_resp.data  # standard envelope, not a raw response


# ── admin/subscriptions/{id}/extend/ (PATCH) ──────────────────────────────────
def test_admin_extend_subscription_endpoint():
    student, plan = make_student(), make_plan()
    sub = make_active_subscription(student, plan)
    url = f"/api/v1/admin/subscriptions/{sub.id}/extend/"
    new_exp = (timezone.now() + timedelta(days=30)).isoformat()
    body = {"newExpiresAt": new_exp, "reason": "goodwill"}

    ok = client_for(make_admin()).patch(url, body, format="json")
    assert ok.status_code == 200

    _assert_forbidden_for_non_admins("patch", url, body)

    invalid = client_for(make_admin()).patch(url, {}, format="json")  # missing newExpiresAt
    assert invalid.status_code == 400
    assert invalid.data["code"] == "validation_error"


# ── admin/subscriptions/{id}/topup/ (PATCH) ───────────────────────────────────
def test_admin_topup_subscription_endpoint():
    student, plan = make_student(), make_plan()
    sub = make_active_subscription(student, plan)
    url = f"/api/v1/admin/subscriptions/{sub.id}/topup/"
    body = {"sessions": 3, "reason": "compensation"}

    ok = client_for(make_admin()).patch(url, body, format="json")
    assert ok.status_code == 200

    _assert_forbidden_for_non_admins("patch", url, body)

    invalid = client_for(make_admin()).patch(url, {"sessions": 0}, format="json")  # min_value=1
    assert invalid.status_code == 400
    assert invalid.data["code"] == "validation_error"


# ── admin/subscriptions/{id}/refund-note/ (POST) ──────────────────────────────
def test_admin_refund_note_endpoint():
    student, plan = make_student(), make_plan()
    sub = make_active_subscription(student, plan)
    url = f"/api/v1/admin/subscriptions/{sub.id}/refund-note/"
    body = {"amount": "50.00", "currency": "SAR", "reason": "partial refund"}

    ok = client_for(make_admin()).post(url, body, format="json")
    assert ok.status_code == 201

    _assert_forbidden_for_non_admins("post", url, body)

    invalid = client_for(make_admin()).post(
        url, {"currency": "SAR"}, format="json"  # missing amount + reason
    )
    assert invalid.status_code == 400
    assert invalid.data["code"] == "validation_error"


# ── admin/payment-proofs/{id}/reopen/ (POST) ──────────────────────────────────
def test_admin_reopen_payment_proof_endpoint():
    student, plan = make_student(), make_plan()
    proof = make_pending_payment_proof(student, plan)
    url = f"/api/v1/admin/payment-proofs/{proof.id}/reopen/"

    ok = client_for(make_admin()).post(url, {}, format="json")
    assert ok.status_code == 200

    _assert_forbidden_for_non_admins("post", url, {})

    # Invalid target (non-existent proof) -> standard 404 envelope.
    missing = f"/api/v1/admin/payment-proofs/{proof.id}/reopen/".replace(
        str(proof.id), "00000000-0000-0000-0000-000000000000"
    )
    invalid = client_for(make_admin()).post(missing, {}, format="json")
    assert invalid.status_code == 404
    assert invalid.data["code"] == "not_found"


# ── admin/bookings/{id}/cancel/ (POST) ────────────────────────────────────────
def test_admin_cancel_booking_endpoint():
    booking = make_booking(days_ahead=3)
    url = f"/api/v1/admin/bookings/{booking.id}/cancel/"

    ok = client_for(make_admin()).post(url, {"forceCredit": True}, format="json")
    assert ok.status_code == 200

    # Re-create a fresh booking for the forbidden checks (the first is now cancelled).
    booking2 = make_booking(days_ahead=3)
    url2 = f"/api/v1/admin/bookings/{booking2.id}/cancel/"
    _assert_forbidden_for_non_admins("post", url2, {"forceCredit": True})

    invalid = client_for(make_admin()).post(
        url2, {"forceCredit": "not-a-bool"}, format="json"
    )
    assert invalid.status_code == 400
    assert invalid.data["code"] == "validation_error"
