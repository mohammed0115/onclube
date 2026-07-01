"""Use-case tests — billing."""
import pytest

from apps.common.enums import PaymentProofStatus, SubscriptionStatus
from apps.common.factories import (
    make_admin,
    make_pending_payment_proof,
    make_pending_subscription,
    make_plan,
    make_student,
)
from application.billing.use_cases import (
    ApprovePaymentProofUseCase,
    RejectPaymentProofUseCase,
)
from domain.exceptions import PermissionDenied
from infrastructure.gateways.events import InMemoryEventBus

pytestmark = pytest.mark.django_db


def test_approve_payment_proof_use_case_activates_subscription():
    admin = make_admin()
    student = make_student()
    plan = make_plan(sessions_per_month=8)
    sub = make_pending_subscription(student, plan)
    proof = make_pending_payment_proof(student, plan, subscription=sub)

    bus = InMemoryEventBus()
    result = ApprovePaymentProofUseCase(events=bus).execute(actor=admin, proof_id=proof.id)

    assert result.subscription_status == SubscriptionStatus.ACTIVE
    assert result.sessions_remaining == 8
    assert result.expires_at is not None

    sub.refresh_from_db()
    assert sub.status == SubscriptionStatus.ACTIVE
    # Domain event emitted through the bus.
    assert len(bus.events) == 1
    assert bus.events[0].subscription_id == result.subscription_id


def test_reject_payment_proof_use_case_does_not_activate_subscription():
    admin = make_admin()
    student = make_student()
    plan = make_plan()
    sub = make_pending_subscription(student, plan)
    proof = make_pending_payment_proof(student, plan, subscription=sub)

    result = RejectPaymentProofUseCase().execute(actor=admin, proof_id=proof.id, note="blurry")

    assert result.status == PaymentProofStatus.REJECTED
    sub.refresh_from_db()
    assert sub.status == SubscriptionStatus.PENDING  # never activated
    assert sub.started_at is None


def test_non_admin_cannot_approve():
    student = make_student()
    plan = make_plan()
    proof = make_pending_payment_proof(student, plan)

    with pytest.raises(PermissionDenied):
        ApprovePaymentProofUseCase().execute(actor=student.user, proof_id=proof.id)
