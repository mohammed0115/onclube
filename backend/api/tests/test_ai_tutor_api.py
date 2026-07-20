"""
AI Tutor — separate subscription + 5-minute practice sessions.
"""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.ai_tutor.models import AITutorSession, AITutorSubscription
from apps.billing.models import Plan, Subscription
from apps.billing import services as billing_services
from apps.common.enums import (
    AITutorSessionStatus,
    PlanKind,
    SubscriptionStatus,
)
from apps.common.factories import make_admin, make_file, make_student

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _ai_tutor_plan():
    return Plan.objects.get(code="ai-tutor-month")


def _active_ai_sub(student):
    return AITutorSubscription.objects.create(
        student=student, plan=_ai_tutor_plan(), status=SubscriptionStatus.ACTIVE,
        started_at=timezone.now(), expires_at=timezone.now() + timedelta(days=30),
    )


# ── subscription activation (payment approval branch) ─────────────────────────
def test_seeded_ai_tutor_month_plan_is_60000_and_kind_ai_tutor():
    plan = _ai_tutor_plan()
    assert plan.kind == PlanKind.AI_TUTOR
    assert int(plan.price) == 60000


def test_approving_ai_tutor_proof_activates_ai_tutor_sub_not_session_credits():
    from apps.billing.models import PaymentProof

    student = make_student()
    admin = make_admin()
    plan = _ai_tutor_plan()
    proof = PaymentProof.objects.create(
        student=student, plan=plan, plan_name=plan.name, amount=plan.price, currency="SDG",
        transaction_number="AITUTOR-1", transfer_datetime=timezone.now(),
        receipt_file=make_file(), receipt_name="r.jpg",
    )
    billing_services.approve_payment_proof(proof, admin)

    assert AITutorSubscription.objects.filter(student=student, status=SubscriptionStatus.ACTIVE).count() == 1
    # No session subscription was created, and session credits are untouched.
    assert Subscription.objects.filter(student=student).count() == 0
    student.refresh_from_db()
    assert student.sessions_remaining == 0


# ── gate ──────────────────────────────────────────────────────────────────────
def test_start_requires_an_active_ai_tutor_subscription():
    student = make_student()
    r = client_for(student.user).post("/api/v1/student/ai-tutor/start/", {"topic": "Travel"}, format="json")
    assert r.status_code == 422
    assert r.data["code"] == "no_ai_tutor_subscription"


def test_status_reports_unsubscribed_then_subscribed():
    student = make_student()
    r = client_for(student.user).get("/api/v1/student/ai-tutor/status/")
    assert r.status_code == 200 and r.data["subscribed"] is False
    _active_ai_sub(student)
    r2 = client_for(student.user).get("/api/v1/student/ai-tutor/status/")
    assert r2.data["subscribed"] is True and r2.data["sessionMinutes"] == 5


# ── 5-minute practice flow ────────────────────────────────────────────────────
def test_start_then_message_flow():
    student = make_student()
    _active_ai_sub(student)
    c = client_for(student.user)

    started = c.post("/api/v1/student/ai-tutor/start/", {"topic": "Money"}, format="json")
    assert started.status_code == 201
    assert started.data["remainingSeconds"] <= 300 and started.data["remainingSeconds"] > 250
    assert len(started.data["messages"]) == 1 and started.data["messages"][0]["role"] == "tutor"
    session_id = started.data["sessionId"]

    reply = c.post(f"/api/v1/student/ai-tutor/{session_id}/message/", {"text": "I like saving money."}, format="json")
    assert reply.status_code == 200
    roles = [m["role"] for m in reply.data["messages"]]
    assert roles == ["tutor", "student", "tutor"]


def test_message_after_five_minutes_is_rejected():
    student = make_student()
    sub = _active_ai_sub(student)
    # A session whose 5 minutes already elapsed.
    session = AITutorSession.objects.create(
        student=student, subscription=sub, topic="Travel",
        started_at=timezone.now() - timedelta(minutes=6),
        expires_at=timezone.now() - timedelta(minutes=1),
        status=AITutorSessionStatus.ACTIVE, messages=[{"role": "tutor", "text": "hi", "at": "x"}],
    )
    r = client_for(student.user).post(
        f"/api/v1/student/ai-tutor/{session.id}/message/", {"text": "hello"}, format="json"
    )
    assert r.status_code == 422 and r.data["code"] == "session_ended"
    session.refresh_from_db()
    assert session.status == AITutorSessionStatus.ENDED
