"""
Journey 3 — Subscription & Manual Payment — API tests (Sprint 6).

Covers the pieces added/hardened this sprint: request-more-information, admin
proof-detail, student latest-proof status, one-active-subscription enforcement,
idempotent approval, no-credit-rollover, ownership/permissions, and the full
end-to-end journey (submit → request-info → reopen → approve → active).
"""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from apps.billing.models import Subscription
from apps.common.factories import (
    make_active_subscription,
    make_admin,
    make_instructor,
    make_pending_payment_proof,
    make_pending_subscription,
    make_plan,
    make_student,
)

pytestmark = pytest.mark.django_db

JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00 receipt"


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


# ── admin queue visibility (regression: pending == "pending_review") ───────────
def test_admin_queue_shows_pending_proofs_for_both_default_and_pending_filter():
    """A submitted proof (status 'pending_review') must appear in the admin queue —
    both with no filter and with the UI's friendly ?status=pending key."""
    student, plan = make_student(), make_plan()
    proof = make_pending_payment_proof(student, plan)
    admin = client_for(make_admin())

    default = admin.get("/api/v1/admin/payment-proofs/")
    assert default.status_code == 200
    assert any(p["id"] == str(proof.id) for p in default.data)

    pending = admin.get("/api/v1/admin/payment-proofs/?status=pending")
    assert pending.status_code == 200
    assert any(p["id"] == str(proof.id) for p in pending.data)


# ── request more information ──────────────────────────────────────────────────
def test_request_info_moves_proof_to_needs_info_without_activating():
    student, plan = make_student(), make_plan()
    proof = make_pending_payment_proof(student, plan)
    resp = client_for(make_admin()).post(
        f"/api/v1/admin/payment-proofs/{proof.id}/request-info/",
        {"note": "Your receipt is blurry — please re-upload a clear photo."},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["status"] == "needs_info"

    proof.refresh_from_db()
    assert proof.status == "needs_info"
    assert "blurry" in proof.review_note
    assert proof.reviewed_by_id is not None
    # No subscription created / activated.
    assert not Subscription.objects.filter(student=student, status="active").exists()
    student.refresh_from_db()
    assert student.payment_status == "needs_info"


def test_request_info_requires_a_note():
    student, plan = make_student(), make_plan()
    proof = make_pending_payment_proof(student, plan)
    resp = client_for(make_admin()).post(
        f"/api/v1/admin/payment-proofs/{proof.id}/request-info/", {"note": "   "}, format="json"
    )
    assert resp.status_code == 422  # blank note → domain error


def test_request_info_is_admin_only():
    student, plan = make_student(), make_plan()
    proof = make_pending_payment_proof(student, plan)
    url = f"/api/v1/admin/payment-proofs/{proof.id}/request-info/"
    body = {"note": "clarify please"}
    assert client_for(make_student().user).post(url, body, format="json").status_code == 403
    assert client_for(make_instructor().user).post(url, body, format="json").status_code == 403
    assert APIClient().post(url, body, format="json").status_code == 401


def test_request_info_on_decided_proof_conflicts():
    student, plan = make_student(), make_plan()
    proof = make_pending_payment_proof(student, plan)
    admin = client_for(make_admin())
    admin.post(f"/api/v1/admin/payment-proofs/{proof.id}/approve/")
    resp = admin.post(
        f"/api/v1/admin/payment-proofs/{proof.id}/request-info/", {"note": "x"}, format="json"
    )
    assert resp.status_code == 409  # already decided


# ── admin proof detail ────────────────────────────────────────────────────────
def test_admin_proof_detail_returns_full_review_context():
    student, plan = make_student(), make_plan()
    proof = make_pending_payment_proof(student, plan)
    resp = client_for(make_admin()).get(f"/api/v1/admin/payment-proofs/{proof.id}/")
    assert resp.status_code == 200
    d = resp.data
    assert d["transactionNumber"] == proof.transaction_number
    assert d["receiptUrl"]  # receipt is retrievable for review
    assert d["studentName"] and d["studentId"]
    assert "transferDatetime" in d and "senderName" in d


def test_admin_proof_detail_is_admin_only_and_404_for_missing():
    student, plan = make_student(), make_plan()
    proof = make_pending_payment_proof(student, plan)
    url = f"/api/v1/admin/payment-proofs/{proof.id}/"
    assert client_for(make_student().user).get(url).status_code == 403  # ownership/permission
    assert client_for(make_instructor().user).get(url).status_code == 403
    assert APIClient().get(url).status_code == 401
    missing = "/api/v1/admin/payment-proofs/00000000-0000-0000-0000-000000000000/"
    assert client_for(make_admin()).get(missing).status_code == 404


# ── student latest proof ──────────────────────────────────────────────────────
def test_student_latest_proof_returns_own_status_and_note():
    student, plan = make_student(), make_plan()
    proof = make_pending_payment_proof(student, plan)
    # Admin sends it back for more info.
    client_for(make_admin()).post(
        f"/api/v1/admin/payment-proofs/{proof.id}/request-info/",
        {"note": "Please add the sender name."}, format="json",
    )
    resp = client_for(student.user).get("/api/v1/billing/payment-proof/latest/")
    assert resp.status_code == 200
    assert resp.data["status"] == "needs_info"
    assert "sender name" in resp.data["reviewNote"]
    # The student view carries no admin-only student identity fields.
    assert resp.data["studentId"] is None


def test_student_latest_proof_404_when_none():
    student = make_student()
    assert client_for(student.user).get("/api/v1/billing/payment-proof/latest/").status_code == 404


def test_student_latest_proof_reflects_rejection_note():
    student, plan = make_student(), make_plan()
    proof = make_pending_payment_proof(student, plan)
    client_for(make_admin()).post(
        f"/api/v1/admin/payment-proofs/{proof.id}/reject/",
        {"note": "Amount does not match the plan."}, format="json",
    )
    resp = client_for(student.user).get("/api/v1/billing/payment-proof/latest/")
    assert resp.status_code == 200
    assert resp.data["status"] == "rejected"
    assert "Amount" in resp.data["reviewNote"]


def test_latest_proof_requires_authentication():
    assert APIClient().get("/api/v1/billing/payment-proof/latest/").status_code == 401


# ── one active subscription ───────────────────────────────────────────────────
def test_second_approval_for_active_student_is_rejected_with_clean_conflict():
    student, plan = make_student(), make_plan()
    p1 = make_pending_payment_proof(student, plan)
    p2 = make_pending_payment_proof(student, plan)  # a different transaction number
    admin = client_for(make_admin())
    assert admin.post(f"/api/v1/admin/payment-proofs/{p1.id}/approve/").status_code == 200
    resp = admin.post(f"/api/v1/admin/payment-proofs/{p2.id}/approve/")
    assert resp.status_code == 409
    assert resp.data["code"] == "subscription_already_active"
    assert Subscription.objects.filter(student=student, status="active").count() == 1


# ── idempotent approval ───────────────────────────────────────────────────────
def test_double_approval_of_same_proof_creates_no_duplicate():
    student, plan = make_student(), make_plan()
    proof = make_pending_payment_proof(student, plan)
    admin = client_for(make_admin())
    assert admin.post(f"/api/v1/admin/payment-proofs/{proof.id}/approve/").status_code == 200
    second = admin.post(f"/api/v1/admin/payment-proofs/{proof.id}/approve/")
    assert second.status_code == 409  # invalid_state — already decided
    assert Subscription.objects.filter(student=student).count() == 1


# ── credits: assigned on activation, no rollover ──────────────────────────────
def test_approval_sets_credits_from_plan_with_no_rollover():
    from apps.billing.services import approve_payment_proof

    student = make_student()
    plan = make_plan(sessions_per_month=8)
    sub = make_pending_subscription(student, plan)
    sub.sessions_remaining = 3  # stale leftover credits
    sub.save(update_fields=["sessions_remaining"])
    proof = make_pending_payment_proof(student, plan, subscription=sub)

    approve_payment_proof(proof, make_admin())
    sub.refresh_from_db()
    # Activation OVERWRITES credits to the plan amount (no rollover of the 3).
    assert sub.sessions_remaining == 8


# ── full Journey 3 end-to-end ─────────────────────────────────────────────────
def test_full_journey_submit_request_info_reopen_approve_activates():
    student, plan = make_student(), make_plan(sessions_per_month=8)
    sc = client_for(student.user)
    admin = client_for(make_admin())

    # 1. Student submits a proof (real multipart upload).
    receipt = SimpleUploadedFile("receipt.jpg", JPEG, content_type="image/jpeg")
    submit = sc.post("/api/v1/billing/payment-proof/", {
        "planId": str(plan.id), "transactionNumber": "TRX-J3-1",
        "transferDatetime": timezone.now().isoformat(), "amount": "220.00",
        "receipt": receipt,
    }, format="multipart")
    assert submit.status_code == 201 and submit.data["status"] == "pending_review"
    proof_id = submit.data["id"]

    # 2. Admin requests more information.
    admin.post(f"/api/v1/admin/payment-proofs/{proof_id}/request-info/",
               {"note": "Please confirm the transfer date."}, format="json")
    assert sc.get("/api/v1/billing/payment-proof/latest/").data["status"] == "needs_info"

    # 3. Admin reopens (back to pending) then approves.
    admin.post(f"/api/v1/admin/payment-proofs/{proof_id}/reopen/")
    approve = admin.post(f"/api/v1/admin/payment-proofs/{proof_id}/approve/")
    assert approve.status_code == 200
    assert approve.data["subscriptionStatus"] == "active"
    assert approve.data["sessionsRemaining"] == 8

    # 4. Student now has an active subscription with credits → ready for booking.
    sub = sc.get("/api/v1/student/subscription/")
    assert sub.status_code == 200
    assert sub.data["status"] == "active" and sub.data["sessionsRemaining"] == 8
    assert sc.get("/api/v1/billing/payment-proof/latest/").data["status"] == "approved"
