"""
Billing business-rule services.

These are the ONLY supported paths for mutating payment/subscription state. Each
admin decision is wrapped in a transaction and recorded in admin_ops.AdminAction
(§6). Approval is the single place a subscription becomes active (§2.2).
"""
from django.db import transaction
from django.utils import timezone

from apps.admin_ops.models import AdminAction
from apps.common.enums import (
    AdminActionType,
    NotificationType,
    PaymentProofStatus,
    PaymentStatus,
    SubscriptionStatus,
)
from apps.common.exceptions import BusinessRuleError
from apps.notifications.models import Notification
from domain.exceptions import PaymentAlreadyDecided

from .models import PaymentProof, Subscription, plus_years


def _log_admin_action(admin, action_type, target, *, amount=None, currency=None,
                      reason=None, metadata=None):
    AdminAction.objects.create(
        admin=admin,
        action_type=action_type,
        target_table=target._meta.db_table,
        target_id=target.pk,
        amount=amount,
        currency=currency,
        reason=reason,
        metadata=metadata,
    )


@transaction.atomic
def approve_payment_proof(proof: PaymentProof, admin) -> Subscription:
    """
    Manually approve a pending proof and activate its subscription (§2.2).

    Single transaction: proof -> approved, subscription -> active with dates and
    session credits, student mirror updated, audit + notification written.
    """
    proof = PaymentProof.objects.select_for_update().get(pk=proof.pk)
    if proof.status != PaymentProofStatus.PENDING:
        raise PaymentAlreadyDecided("Only a pending proof can be approved.")

    now = timezone.now()
    plan = proof.plan

    subscription = proof.subscription
    if subscription is None:
        subscription = Subscription.objects.create(
            student=proof.student,
            plan=plan,
            status=SubscriptionStatus.PENDING,
        )

    subscription.status = SubscriptionStatus.ACTIVE
    subscription.started_at = now
    subscription.expires_at = now + timezone.timedelta(days=plan.billing_period_days)
    subscription.sessions_remaining = plan.sessions_per_month
    subscription.activated_by = admin
    subscription.full_clean()
    subscription.save()

    proof.status = PaymentProofStatus.APPROVED
    proof.reviewed_by = admin
    proof.reviewed_at = now
    proof.subscription = subscription
    proof.full_clean(exclude=["retain_until"])
    proof.save()

    # Update denormalized student mirror.
    student = proof.student
    student.payment_status = PaymentStatus.APPROVED
    student.sessions_remaining = subscription.sessions_remaining
    student.active_subscription = subscription
    student.save(
        update_fields=["payment_status", "sessions_remaining", "active_subscription", "updated_at"]
    )

    _log_admin_action(
        admin, AdminActionType.PAYMENT_APPROVE, proof,
        metadata={"subscription_id": str(subscription.pk)},
    )
    Notification.objects.create(
        user=student.user,
        type=NotificationType.PAYMENT_APPROVED,
        title="Payment approved",
        body=f"Your {plan.name} plan is now active.",
        data={"subscription_id": str(subscription.pk)},
    )
    return subscription


@transaction.atomic
def reject_payment_proof(proof: PaymentProof, admin, *, note=None) -> PaymentProof:
    proof = PaymentProof.objects.select_for_update().get(pk=proof.pk)
    if proof.status != PaymentProofStatus.PENDING:
        raise PaymentAlreadyDecided("Only a pending proof can be rejected.")
    proof.status = PaymentProofStatus.REJECTED
    proof.reviewed_by = admin
    proof.reviewed_at = timezone.now()
    proof.review_note = note
    proof.full_clean(exclude=["retain_until"])
    proof.save()

    student = proof.student
    student.payment_status = PaymentStatus.REJECTED
    student.save(update_fields=["payment_status", "updated_at"])

    _log_admin_action(admin, AdminActionType.PAYMENT_REJECT, proof, reason=note)
    Notification.objects.create(
        user=student.user,
        type=NotificationType.PAYMENT_REJECTED,
        title="Payment needs attention",
        body=note or "Your payment proof was rejected. Please re-submit.",
    )
    return proof


@transaction.atomic
def reopen_payment_proof(proof: PaymentProof, admin) -> PaymentProof:
    proof = PaymentProof.objects.select_for_update().get(pk=proof.pk)
    prior = proof.status
    proof.status = PaymentProofStatus.PENDING
    proof.reviewed_by = None
    proof.reviewed_at = None
    proof.save()
    _log_admin_action(
        admin, AdminActionType.PAYMENT_REOPEN, proof, metadata={"prior_status": prior}
    )
    return proof


@transaction.atomic
def extend_subscription(subscription: Subscription, admin, *, new_expires_at,
                        reason=None) -> Subscription:
    """Admin manual extension (§6). May revive an expired subscription."""
    subscription = Subscription.objects.select_for_update().get(pk=subscription.pk)
    old_expires = subscription.expires_at
    subscription.expires_at = new_expires_at
    if subscription.status == SubscriptionStatus.EXPIRED:
        subscription.status = SubscriptionStatus.ACTIVE
        if subscription.started_at is None:
            subscription.started_at = timezone.now()
    subscription.extended_by = admin
    subscription.extended_at = timezone.now()
    subscription.full_clean()
    subscription.save()
    _log_admin_action(
        admin, AdminActionType.SUBSCRIPTION_EXTEND, subscription, reason=reason,
        metadata={
            "old_expires_at": old_expires.isoformat() if old_expires else None,
            "new_expires_at": new_expires_at.isoformat(),
        },
    )
    return subscription


@transaction.atomic
def topup_subscription(subscription: Subscription, admin, *, sessions,
                       reason=None) -> Subscription:
    """Admin manual session top-up (§6)."""
    if sessions <= 0:
        raise BusinessRuleError("Top-up must be a positive number of sessions.")
    subscription = Subscription.objects.select_for_update().get(pk=subscription.pk)
    subscription.sessions_remaining += sessions
    subscription.save(update_fields=["sessions_remaining", "updated_at"])

    student = subscription.student
    if student.active_subscription_id == subscription.pk:
        student.sessions_remaining = subscription.sessions_remaining
        student.save(update_fields=["sessions_remaining", "updated_at"])

    _log_admin_action(
        admin, AdminActionType.SUBSCRIPTION_TOPUP, subscription,
        amount=sessions, reason=reason,
    )
    return subscription


@transaction.atomic
def record_refund_note(subscription: Subscription, admin, *, amount, currency,
                       reason) -> AdminAction:
    """
    Record a manual money refund (§6). No balance mutation — money moves
    out-of-band; this is purely the audit record.
    """
    action = AdminAction.objects.create(
        admin=admin,
        action_type=AdminActionType.REFUND_NOTE,
        target_table=subscription._meta.db_table,
        target_id=subscription.pk,
        amount=amount,
        currency=currency,
        reason=reason,
    )
    return action
