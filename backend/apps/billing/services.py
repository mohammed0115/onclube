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

    # AI-tutor plans activate a SEPARATE subscription (not session credits), so they
    # don't touch the student's session mirror or the one-active-session-sub rule.
    from apps.common.enums import PlanKind

    if plan.kind == PlanKind.AI_TUTOR:
        return _activate_ai_tutor_subscription(proof, admin, now)

    # One active subscription per student (§2.2): block a second activation with a
    # clean domain error rather than letting the partial-unique constraint 500.
    existing_active = (
        Subscription.objects.filter(student=proof.student, status=SubscriptionStatus.ACTIVE)
        .exclude(pk=proof.subscription_id)  # allow re-activating the proof's OWN subscription
        .first()
    )
    if existing_active is not None:
        raise BusinessRuleError(
            "This student already has an active subscription.",
            code="subscription_already_active",
        )

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

    # Freshly added credits should immediately materialise any APPROVED recurring
    # schedule the student already has (idempotent). Generation must never block
    # payment approval, so failures here are swallowed.
    try:
        from apps.scheduling.services import generate_bookings_from_schedule

        generate_bookings_from_schedule(student, now=now)
    except Exception:  # pragma: no cover - defensive
        pass
    return subscription


def _activate_ai_tutor_subscription(proof, admin, now):
    """Activate (or promote) an AI-tutor subscription from an approved proof.
    Returns the AITutorSubscription (compatible with the approval result: it has
    id/status/started_at/expires_at and a sessions_remaining shim)."""
    from apps.ai_tutor.models import AITutorSubscription

    plan = proof.plan
    existing_active = (
        AITutorSubscription.objects.filter(
            student=proof.student, status=SubscriptionStatus.ACTIVE
        ).first()
    )
    if existing_active is not None:
        raise BusinessRuleError(
            "This student already has an active AI-tutor subscription.",
            code="ai_tutor_subscription_already_active",
        )

    sub = AITutorSubscription.objects.create(
        student=proof.student,
        plan=plan,
        status=SubscriptionStatus.ACTIVE,
        started_at=now,
        expires_at=now + timezone.timedelta(days=plan.billing_period_days),
        activated_by=admin,
    )

    proof.status = PaymentProofStatus.APPROVED
    proof.reviewed_by = admin
    proof.reviewed_at = now
    proof.full_clean(exclude=["retain_until"])
    proof.save()

    _log_admin_action(
        admin, AdminActionType.PAYMENT_APPROVE, proof,
        metadata={"ai_tutor_subscription_id": str(sub.pk), "kind": "ai_tutor"},
    )
    Notification.objects.create(
        user=proof.student.user,
        type=NotificationType.PAYMENT_APPROVED,
        title="AI Tutor is ready",
        body=f"Your {plan.name} plan is active — start a 5-minute practice any time.",
        data={"ai_tutor_subscription_id": str(sub.pk)},
    )
    return sub


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
def request_payment_info(proof: PaymentProof, admin, *, note) -> PaymentProof:
    """
    Ask the student for more information about a pending proof (§6 review).

    Moves a PENDING proof to NEEDS_INFO with a required note. This is NOT an
    approval or rejection: no subscription is activated and no credit is assigned.
    The student may re-submit (a new proof) or an admin may reopen it to PENDING.
    """
    proof = PaymentProof.objects.select_for_update().get(pk=proof.pk)
    if proof.status != PaymentProofStatus.PENDING:
        raise PaymentAlreadyDecided("Only a pending proof can be sent back for more information.")
    proof.status = PaymentProofStatus.NEEDS_INFO
    proof.reviewed_by = admin
    proof.reviewed_at = timezone.now()
    proof.review_note = note
    proof.full_clean(exclude=["retain_until"])
    proof.save()

    student = proof.student
    student.payment_status = PaymentStatus.NEEDS_INFO
    student.save(update_fields=["payment_status", "updated_at"])

    _log_admin_action(admin, AdminActionType.PAYMENT_REQUEST_INFO, proof, reason=note)
    Notification.objects.create(
        user=student.user,
        type=NotificationType.PAYMENT_INFO_REQUESTED,
        title="More information needed",
        body=note or "We need more information about your payment. Please review and re-submit.",
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

    # Newly topped-up credits materialise the student's approved recurring
    # schedule right away (idempotent; never blocks the top-up).
    try:
        from apps.scheduling.services import generate_bookings_from_schedule

        generate_bookings_from_schedule(student)
    except Exception:  # pragma: no cover - defensive
        pass
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
