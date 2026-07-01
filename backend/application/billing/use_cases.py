"""
Billing use cases.

Thin orchestration over the existing transactional domain services
(apps.billing.services). Each use case: validates actor permissions, delegates
to the service (which runs in transaction.atomic and writes AdminAction), emits a
domain event, and returns a DTO — never a raw Django model.
"""
from django.db import IntegrityError, transaction

from apps.billing import services as billing_services
from apps.billing.models import File, PaymentProof
from apps.common.enums import PaymentProofStatus, PaymentStatus
from application import mappers
from application.permissions import ensure_admin, get_student_profile
from domain import events as domain_events
from domain.dtos import (
    PaymentApprovalResult,
    PaymentDecisionResult,
    PaymentProofDetailResult,
    RefundNoteResult,
    SubscriptionResult,
)
from domain.exceptions import DuplicateTransactionNumber
from infrastructure.container import (
    default_event_bus,
    default_file_storage,
    default_payment_repository,
    default_plan_repository,
    default_subscription_repository,
)


class ApprovePaymentProofUseCase:
    def __init__(self, *, payments=None, events=None):
        self.payments = payments or default_payment_repository()
        self.events = events or default_event_bus()

    def execute(self, *, actor, proof_id) -> PaymentApprovalResult:
        ensure_admin(actor)
        proof = self.payments.get(proof_id)
        subscription = billing_services.approve_payment_proof(proof, actor)
        self.events.publish(
            domain_events.PaymentApproved(
                proof_id=str(proof.id),
                subscription_id=str(subscription.id),
                student_id=str(proof.student_id),
            )
        )
        return PaymentApprovalResult(
            proof_id=str(proof.id),
            subscription_id=str(subscription.id),
            subscription_status=subscription.status,
            sessions_remaining=subscription.sessions_remaining,
            started_at=subscription.started_at,
            expires_at=subscription.expires_at,
        )


class RejectPaymentProofUseCase:
    def __init__(self, *, payments=None, events=None):
        self.payments = payments or default_payment_repository()
        self.events = events or default_event_bus()

    def execute(self, *, actor, proof_id, note=None) -> PaymentDecisionResult:
        ensure_admin(actor)
        proof = self.payments.get(proof_id)
        proof = billing_services.reject_payment_proof(proof, actor, note=note)
        self.events.publish(
            domain_events.PaymentRejected(
                proof_id=str(proof.id), student_id=str(proof.student_id)
            )
        )
        return PaymentDecisionResult(
            proof_id=str(proof.id),
            status=proof.status,
            reviewed_by_id=str(proof.reviewed_by_id) if proof.reviewed_by_id else None,
        )


class ReopenPaymentProofUseCase:
    def __init__(self, *, payments=None):
        self.payments = payments or default_payment_repository()

    def execute(self, *, actor, proof_id) -> PaymentDecisionResult:
        ensure_admin(actor)
        proof = self.payments.get(proof_id)
        proof = billing_services.reopen_payment_proof(proof, actor)
        return PaymentDecisionResult(
            proof_id=str(proof.id),
            status=proof.status,
            reviewed_by_id=None,
        )


class ExtendSubscriptionUseCase:
    def __init__(self, *, subscriptions=None):
        self.subscriptions = subscriptions or default_subscription_repository()

    def execute(self, *, actor, subscription_id, new_expires_at, reason=None) -> SubscriptionResult:
        ensure_admin(actor)
        subscription = self.subscriptions.get(subscription_id)
        subscription = billing_services.extend_subscription(
            subscription, actor, new_expires_at=new_expires_at, reason=reason
        )
        return SubscriptionResult(
            subscription_id=str(subscription.id),
            status=subscription.status,
            sessions_remaining=subscription.sessions_remaining,
            expires_at=subscription.expires_at,
        )


class TopUpSubscriptionUseCase:
    def __init__(self, *, subscriptions=None):
        self.subscriptions = subscriptions or default_subscription_repository()

    def execute(self, *, actor, subscription_id, sessions, reason=None) -> SubscriptionResult:
        ensure_admin(actor)
        subscription = self.subscriptions.get(subscription_id)
        subscription = billing_services.topup_subscription(
            subscription, actor, sessions=sessions, reason=reason
        )
        return SubscriptionResult(
            subscription_id=str(subscription.id),
            status=subscription.status,
            sessions_remaining=subscription.sessions_remaining,
            expires_at=subscription.expires_at,
        )


class SubmitPaymentProofUseCase:
    """
    Student submits a manual bank-transfer proof (verification workflow — NOT an
    online payment). Stores the receipt image, enforces a unique transaction
    number, starts the proof in `pending_review`, and NEVER auto-approves. Any
    `raw_ocr_data` is informational only. Admin approval stays manual.
    """

    def __init__(self, *, payments=None, plans=None, file_storage=None, events=None):
        self.payments = payments or default_payment_repository()
        self.plans = plans or default_plan_repository()
        self.file_storage = file_storage or default_file_storage()
        self.events = events or default_event_bus()

    @transaction.atomic
    def execute(self, *, actor, plan_id, transaction_number, transfer_datetime, amount,
                receipt_filename, receipt_content_type, receipt_data=None,
                sender_name=None, receiver_name=None, raw_ocr_data=None) -> PaymentProofDetailResult:
        student = get_student_profile(actor)
        plan = self.plans.get(plan_id)  # DoesNotExist → 404

        if self.payments.transaction_number_exists(transaction_number):
            raise DuplicateTransactionNumber()

        stored = self.file_storage.save(
            filename=receipt_filename, content_type=receipt_content_type, data=receipt_data
        )
        receipt = File.objects.create(
            storage_key=stored["storage_key"],
            filename=receipt_filename,
            content_type=receipt_content_type,
            uploaded_by=actor,
        )

        try:
            proof = PaymentProof.objects.create(
                student=student,
                subscription=None,  # the approval step creates/activates the subscription
                plan=plan,
                plan_name=plan.name,
                amount=amount,
                currency=plan.currency,
                transaction_number=transaction_number,
                transfer_datetime=transfer_datetime,
                sender_name=sender_name,
                receiver_name=receiver_name,
                raw_ocr_data=raw_ocr_data,
                receipt_file=receipt,
                receipt_name=receipt_filename,
                status=PaymentProofStatus.PENDING,  # "pending_review"
            )
        except IntegrityError:  # unique transaction_number race backstop
            raise DuplicateTransactionNumber()

        # Denormalized mirror for the student dashboard.
        student.payment_status = PaymentStatus.PENDING
        student.save(update_fields=["payment_status", "updated_at"])

        self.events.publish(
            domain_events.PaymentProofSubmitted(
                proof_id=str(proof.id),
                student_id=str(student.id),
                transaction_number=transaction_number,
            )
        )
        receipt_url = self.file_storage.url_for(storage_key=receipt.storage_key)
        return mappers.payment_proof_detail(proof, receipt_url=receipt_url)


class RecordRefundNoteUseCase:
    def __init__(self, *, subscriptions=None):
        self.subscriptions = subscriptions or default_subscription_repository()

    def execute(self, *, actor, subscription_id, amount, currency, reason) -> RefundNoteResult:
        ensure_admin(actor)
        subscription = self.subscriptions.get(subscription_id)
        action = billing_services.record_refund_note(
            subscription, actor, amount=amount, currency=currency, reason=reason
        )
        return RefundNoteResult(
            admin_action_id=str(action.id),
            subscription_id=str(subscription.id),
            amount=action.amount,
            currency=action.currency,
        )
