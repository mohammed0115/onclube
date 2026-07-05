"""
API-layer tests (Phase 6B).

Prove the thin DRF layer: routing, actor passing, DTO-only camelCase output,
server-only field absence, ownership/role enforcement via the use cases, and the
global domain-exception → HTTP mapping.
"""
import pytest
from rest_framework.test import APIClient

from apps.common.enums import SubscriptionStatus
from apps.common.factories import (
    make_active_subscription,
    make_admin,
    make_ai_report,
    make_booking,
    make_instructor,
    make_pending_payment_proof,
    make_pending_subscription,
    make_plan,
    make_session,
    make_slot,
    make_student,
    make_topic,
)
pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


# ── booking without approved payment → API error (global mapping) ─────────────
def test_booking_without_approved_payment_returns_api_error():
    instructor = make_instructor()
    student = make_student()  # no subscription
    topic = make_topic(instructor)
    slot = make_slot(instructor)

    resp = client_for(student.user).post(
        "/api/v1/student/bookings/",
        {"topicId": str(topic.id), "slotId": str(slot.id)},
        format="json",
    )
    assert resp.status_code == 403
    assert resp.data["code"] == "no_active_subscription"


def test_create_booking_succeeds_and_returns_camel_dto():
    instructor = make_instructor()
    student = make_student()
    make_active_subscription(student, make_plan(), sessions=4)
    topic = make_topic(instructor)
    slot = make_slot(instructor)

    resp = client_for(student.user).post(
        "/api/v1/student/bookings/",
        {"topicId": str(topic.id), "slotId": str(slot.id)},
        format="json",
    )
    assert resp.status_code == 201
    assert set(["bookingId", "slotId", "topicId", "scheduledAt", "status", "sessionsRemaining"]) <= set(resp.data)
    assert resp.data["sessionsRemaining"] == 3


# ── student cannot access another student's booking ───────────────────────────
def test_student_cannot_access_another_students_booking():
    booking = make_booking()
    intruder = make_student()
    resp = client_for(intruder.user).get(f"/api/v1/student/bookings/{booking.id}/")
    assert resp.status_code == 403
    assert resp.data["code"] == "permission_denied"


# ── instructor cannot access another instructor's session ─────────────────────
def test_instructor_cannot_access_another_instructors_session():
    booking = make_booking()  # instructor A
    session = make_session(booking)
    other = make_instructor()
    resp = client_for(other.user).get(f"/api/v1/sessions/{session.id}/")
    assert resp.status_code == 403


def test_instructor_topics_list_is_owner_scoped():
    instr_a = make_instructor()
    instr_b = make_instructor()
    make_topic(instr_a)
    resp = client_for(instr_b.user).get("/api/v1/instructor/topics/")
    assert resp.status_code == 200
    assert resp.data == []


# ── admin-only endpoints reject student/instructor ────────────────────────────
def test_admin_dashboard_rejects_student():
    student = make_student()
    resp = client_for(student.user).get("/api/v1/admin/dashboard/")
    assert resp.status_code == 403
    assert resp.data["code"] == "permission_denied"


def test_admin_payment_proofs_rejects_instructor():
    instructor = make_instructor()
    resp = client_for(instructor.user).get("/api/v1/admin/payment-proofs/")
    assert resp.status_code == 403


# Placement API (`/placement/*`) is covered comprehensively in test_placement_api.py
# (Phase 8E) — including that correct_answer/correct_index never appear in responses.


# ── payment approval / rejection route through use cases ──────────────────────
def test_payment_approval_route_activates_subscription():
    admin = make_admin()
    student = make_student()
    plan = make_plan(sessions_per_month=8)
    sub = make_pending_subscription(student, plan)
    proof = make_pending_payment_proof(student, plan, subscription=sub)

    resp = client_for(admin).post(f"/api/v1/admin/payment-proofs/{proof.id}/approve/")
    assert resp.status_code == 200
    assert resp.data["subscriptionStatus"] == SubscriptionStatus.ACTIVE
    assert resp.data["sessionsRemaining"] == 8
    sub.refresh_from_db()
    assert sub.status == SubscriptionStatus.ACTIVE


def test_payment_rejection_route_does_not_activate_subscription():
    admin = make_admin()
    student = make_student()
    plan = make_plan()
    sub = make_pending_subscription(student, plan)
    proof = make_pending_payment_proof(student, plan, subscription=sub)

    resp = client_for(admin).post(
        f"/api/v1/admin/payment-proofs/{proof.id}/reject/",
        {"note": "blurry receipt"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["status"] == "rejected"
    sub.refresh_from_db()
    assert sub.status == SubscriptionStatus.PENDING


# ── join session returns the Agora DTO shape ──────────────────────────────────
def test_join_session_returns_agora_dto():
    booking = make_booking(days_ahead=0)  # inside the join window
    session = make_session(booking)
    actor = booking.student.user

    resp = client_for(actor).post(f"/api/v1/sessions/{session.id}/join/")
    assert resp.status_code == 200
    for key in ("agoraAppId", "channel", "agoraToken", "uid", "expiresAt"):
        assert key in resp.data
    assert resp.data["agoraAppId"] == "stub-app-id"


# ── AI report detail returns mistakes/recommendations/vocabulary/note ─────────
def test_ai_report_detail_returns_full_render():
    report = make_ai_report()
    owner = report.student.user
    resp = client_for(owner).get(f"/api/v1/reports/{report.id}/")
    assert resp.status_code == 200
    assert resp.data["mistakes"]
    assert resp.data["recommendations"]
    assert resp.data["vocabulary"] == ["motivated", "collaborate"]
    assert resp.data["instructorNote"].startswith("Great progress")


# ── global domain exception mapping (questions gate) ──────────────────────────
def test_questions_endpoint_maps_domain_exception():
    instructor = make_instructor()
    student = make_student()
    topic = make_topic(instructor)
    # No confirmed booking → QuestionsNotAvailable → 403 questions_not_available.
    resp = client_for(student.user).get(f"/api/v1/student/topics/{topic.id}/questions/")
    assert resp.status_code == 403
    assert resp.data["code"] == "questions_not_available"


def test_topic_detail_is_preview_without_booking_and_full_after():
    instructor = make_instructor()
    student = make_student()
    topic = make_topic(instructor)

    preview = client_for(student.user).get(f"/api/v1/student/topics/{topic.id}/")
    assert preview.data["mode"] == "preview"
    assert "questions" not in preview.data

    make_active_subscription(student, make_plan(), sessions=4)
    slot = make_slot(instructor)
    from apps.scheduling.services import create_booking

    create_booking(student, topic, slot)

    full = client_for(student.user).get(f"/api/v1/student/topics/{topic.id}/")
    assert full.data["mode"] == "full"
    assert len(full.data["questions"]) == 1


# ── no raw internal fields exposed ────────────────────────────────────────────
def test_me_endpoint_hides_internal_user_fields():
    student = make_student()
    resp = client_for(student.user).get("/api/v1/me/")
    assert resp.status_code == 200
    for leaked in ("password", "password_hash", "is_staff", "isStaff", "is_superuser", "isSuperuser"):
        assert leaked not in resp.data
    assert resp.data["role"] == "student"


# ── subscription 404 when none active ─────────────────────────────────────────
def test_student_subscription_returns_404_when_none():
    student = make_student()
    resp = client_for(student.user).get("/api/v1/student/subscription/")
    assert resp.status_code == 404
    assert resp.data["code"] == "not_found"


# ── unauthenticated request is rejected ───────────────────────────────────────
def test_unauthenticated_request_is_401():
    resp = APIClient().get("/api/v1/me/")
    assert resp.status_code == 401


# ── payment providers come from configuration, never hardcoded (9A.1) ─────────
def _provider(**over):
    base = {
        "provider_key": "bank_of_khartoum",
        "provider_name": "Bank of Khartoum",
        "transfer_method": "Bankak",
        "bank_name": "Bank of Khartoum",
        "account_name": "OneClub Education",
        "account_number": "100",
        "iban": "",
        "instructions": "Open Bankak and transfer.",
        "currency": "SDG",
        "is_active": True,
        "display_order": 1,
    }
    base.update(over)
    return base


def test_providers_endpoint_returns_default_bank_of_khartoum():
    resp = client_for(make_student().user).get("/api/v1/billing/providers/")
    assert resp.status_code == 200
    assert len(resp.data) >= 1
    p = resp.data[0]
    assert set(p.keys()) == {
        "providerKey", "providerName", "transferMethod", "bankName", "accountName",
        "accountNumber", "iban", "instructions", "currency", "isActive", "displayOrder",
    }
    assert p["providerName"] == "Bank of Khartoum"
    assert p["transferMethod"] == "Bankak"
    assert p["currency"] == "SDG"
    assert "Al Rajhi" not in str(resp.data)


def test_providers_ordered_and_inactive_excluded(settings):
    settings.PAYMENT_PROVIDERS = [
        _provider(provider_key="inactive", provider_name="Inactive Bank", is_active=False, display_order=1),
        _provider(provider_key="second", provider_name="Second Bank", display_order=3),
        _provider(provider_key="bank_of_khartoum", provider_name="Bank of Khartoum", display_order=2),
    ]
    resp = client_for(make_student().user).get("/api/v1/billing/providers/")
    names = [p["providerName"] for p in resp.data]
    assert names == ["Bank of Khartoum", "Second Bank"]  # active only, by displayOrder
    assert "Inactive Bank" not in str(resp.data)


def test_bank_account_returns_default_active_provider():
    resp = client_for(make_student().user).get("/api/v1/billing/bank-account/")
    assert resp.status_code == 200
    assert resp.data["providerName"] == "Bank of Khartoum"
    assert resp.data["transferMethod"] == "Bankak"
    assert resp.data["bankName"] == "Bank of Khartoum"
    assert resp.data["currency"] == "SDG"


def test_bank_account_skips_inactive_provider(settings):
    settings.PAYMENT_PROVIDERS = [
        _provider(provider_key="inactive", provider_name="Inactive Bank", is_active=False, display_order=1),
        _provider(provider_key="active", provider_name="Active Bank", display_order=2),
    ]
    resp = client_for(make_student().user).get("/api/v1/billing/bank-account/")
    assert resp.data["providerName"] == "Active Bank"


def test_payment_instructions_alias_still_works():
    resp = client_for(make_student().user).get("/api/v1/billing/payment-instructions/")
    assert resp.status_code == 200
    assert set(resp.data.keys()) == {
        "bankName", "accountName", "accountNumber", "iban", "transferMethod", "instructions"
    }
    assert resp.data["bankName"] == "Bank of Khartoum"
    assert "Al Rajhi" not in str(resp.data)


def test_bank_account_is_configurable(settings):
    settings.PAYMENT_PROVIDERS = [
        _provider(provider_name="Faisal Islamic Bank", bank_name="Faisal Islamic Bank",
                  transfer_method="Fawry", iban="SD00 1234", currency="SDG"),
    ]
    resp = client_for(make_student().user).get("/api/v1/billing/bank-account/")
    assert resp.data["providerName"] == "Faisal Islamic Bank"
    assert resp.data["transferMethod"] == "Fawry"
    assert resp.data["iban"] == "SD00 1234"


def test_payment_proof_str_does_not_crash():
    """Regression: __str__ referenced a non-existent `self.reference` (G7)."""
    from apps.billing.models import File, PaymentProof
    from apps.common.enums import PaymentProofStatus
    from django.utils import timezone

    student = make_student()
    plan = make_plan()
    receipt = File.objects.create(storage_key="k1", filename="r.jpg", content_type="image/jpeg")
    proof = PaymentProof.objects.create(
        student=student, plan=plan, plan_name=plan.name, amount=plan.price, currency="SDG",
        transaction_number="TRX-STR-1", transfer_datetime=timezone.now(),
        receipt_file=receipt, receipt_name="r.jpg", status=PaymentProofStatus.PENDING,
    )
    assert "TRX-STR-1" in str(proof)  # no AttributeError


def test_no_al_rajhi_in_billing_outputs():
    client = client_for(make_student().user)
    for path in ("/api/v1/billing/providers/", "/api/v1/billing/bank-account/",
                 "/api/v1/billing/payment-instructions/"):
        assert "Al Rajhi" not in str(client.get(path).data)
        assert "Rajhi" not in str(client.get(path).data)


def test_no_hardcoded_al_rajhi_anywhere_in_source():
    """No Al Rajhi / Rajhi / الراجحي reference remains in backend or frontend source."""
    import pathlib

    repo = pathlib.Path(__file__).resolve().parents[3]
    roots = [
        repo / "backend" / "apps",
        repo / "backend" / "application",
        repo / "backend" / "domain",
        repo / "backend" / "infrastructure",
        repo / "backend" / "config",
        repo / "src",
    ]
    forbidden = ("Al Rajhi", "Rajhi", "الراجحي")
    offenders = []
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.suffix not in (".py", ".ts", ".tsx", ".js", ".jsx"):
                continue
            if "test" in path.name or "__pycache__" in str(path) or "node_modules" in str(path):
                continue  # test files legitimately assert the strings' ABSENCE
            text = path.read_text(encoding="utf-8", errors="ignore")
            if any(tok in text for tok in forbidden):
                offenders.append(str(path.relative_to(repo)))
    assert not offenders, f"Hardcoded bank reference found in: {offenders}"
