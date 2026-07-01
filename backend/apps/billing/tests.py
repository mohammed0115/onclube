"""
Billing business-rule tests:
  - payment approval creates/activates a subscription
  - sessions_remaining cannot go below zero
"""
import pytest
from django.db import IntegrityError, transaction
from django.db.models import F

from apps.billing.models import Subscription
from apps.billing.services import approve_payment_proof, reject_payment_proof
from apps.common.enums import (
    PaymentProofStatus,
    PaymentStatus,
    SubscriptionStatus,
)
from apps.common.factories import (
    make_active_subscription,
    make_admin,
    make_pending_payment_proof,
    make_pending_subscription,
    make_plan,
    make_student,
)

pytestmark = pytest.mark.django_db


def test_payment_approval_activates_subscription():
    admin = make_admin()
    student = make_student()
    plan = make_plan(sessions_per_month=8, billing_period_days=30)
    sub = make_pending_subscription(student, plan)
    proof = make_pending_payment_proof(student, plan, subscription=sub)

    activated = approve_payment_proof(proof, admin)

    activated.refresh_from_db()
    assert activated.status == SubscriptionStatus.ACTIVE
    assert activated.started_at is not None
    assert activated.expires_at is not None
    assert activated.sessions_remaining == 8
    assert activated.activated_by_id == admin.id

    proof.refresh_from_db()
    assert proof.status == PaymentProofStatus.APPROVED
    assert proof.reviewed_by_id == admin.id
    assert proof.reviewed_at is not None

    student.refresh_from_db()
    assert student.payment_status == PaymentStatus.APPROVED
    assert student.sessions_remaining == 8
    assert student.active_subscription_id == activated.id


def test_payment_approval_creates_subscription_when_missing():
    admin = make_admin()
    student = make_student()
    plan = make_plan(sessions_per_month=4)
    proof = make_pending_payment_proof(student, plan, subscription=None)

    sub = approve_payment_proof(proof, admin)
    assert sub.status == SubscriptionStatus.ACTIVE
    assert sub.sessions_remaining == 4


def test_double_approval_is_rejected():
    from apps.common.exceptions import BusinessRuleError

    admin = make_admin()
    student = make_student()
    plan = make_plan()
    proof = make_pending_payment_proof(student, plan)
    approve_payment_proof(proof, admin)

    proof.refresh_from_db()
    with pytest.raises(BusinessRuleError):
        approve_payment_proof(proof, admin)


def test_rejection_records_reviewer():
    admin = make_admin()
    student = make_student()
    plan = make_plan()
    proof = make_pending_payment_proof(student, plan)

    reject_payment_proof(proof, admin, note="Receipt unreadable")
    proof.refresh_from_db()
    assert proof.status == PaymentProofStatus.REJECTED
    assert proof.reviewed_by_id == admin.id
    assert student.payment_status != PaymentStatus.APPROVED or True  # mirror set to rejected
    student.refresh_from_db()
    assert student.payment_status == PaymentStatus.REJECTED


def test_sessions_remaining_cannot_go_below_zero_db_constraint():
    """The CHECK constraint backstops any path that tries to drive it negative."""
    student = make_student()
    plan = make_plan()
    sub = make_active_subscription(student, plan, sessions=0)

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            # Force an unguarded decrement below zero.
            Subscription.objects.filter(pk=sub.pk).update(
                sessions_remaining=F("sessions_remaining") - 1
            )
