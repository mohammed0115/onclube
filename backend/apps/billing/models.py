"""
billing — plans, per-student subscriptions, payment proofs, uploaded files.

Maps database design tables: plans, subscriptions, payment_proofs, files.
Encodes critical constraints §2.2 (approval→active), §2.3 (sessions ≥ 0) and
§2.7 (5-year retention).
"""
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.common.enums import PaymentProofStatus, PlanKind, SubscriptionStatus
from apps.common.models import BaseModel, SoftDeleteModel, TimeStampedModel, UUIDModel

RETENTION_YEARS = 5


def plus_years(dt, years):
    """Add calendar years, clamping Feb-29 to Feb-28 on non-leap targets."""
    try:
        return dt.replace(year=dt.year + years)
    except ValueError:
        return dt.replace(year=dt.year + years, day=28)


class File(UUIDModel, TimeStampedModel):
    """Receipt / upload metadata. Bytes live in object storage."""

    storage_key = models.CharField(max_length=512, unique=True)
    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size_bytes = models.BigIntegerField(null=True, blank=True)
    uploaded_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        db_table = "files"

    def __str__(self):
        return self.filename


class Plan(BaseModel):
    """Catalog plan. Soft-deactivated via `active`, never row-deleted."""

    code = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=60)
    # Which product this plan buys: live instructor sessions, or AI-tutor practice.
    kind = models.CharField(
        max_length=20, choices=PlanKind.choices, default=PlanKind.SESSIONS
    )
    emoji = models.CharField(max_length=8, null=True, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="SDG")
    cadence = models.CharField(max_length=20, default="/ month")
    billing_period_days = models.PositiveIntegerField(default=30)
    description = models.CharField(max_length=200, null=True, blank=True)
    sessions_per_month = models.PositiveIntegerField()
    features = models.JSONField(default=list)
    recommended = models.BooleanField(default=False)
    active = models.BooleanField(default=True)

    class Meta:
        db_table = "plans"
        indexes = [
            models.Index(
                fields=["active"],
                name="plan_active_idx",
                condition=models.Q(active=True),
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"


class Subscription(BaseModel, SoftDeleteModel):
    """Per-student plan instance. Activated only by admin payment approval."""

    student = models.ForeignKey(
        "accounts.StudentProfile",
        on_delete=models.CASCADE,
        related_name="subscriptions",
    )
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="subscriptions")
    status = models.CharField(
        max_length=20,
        choices=SubscriptionStatus.choices,
        default=SubscriptionStatus.PENDING,
    )
    started_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    sessions_remaining = models.PositiveIntegerField(default=0)
    activated_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    extended_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    extended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "subscriptions"
        indexes = [
            models.Index(fields=["student", "status"]),
            models.Index(fields=["status", "expires_at"]),
        ]
        constraints = [
            # At most one ACTIVE subscription per student (§2.2 / §1.9).
            models.UniqueConstraint(
                fields=["student"],
                condition=models.Q(status=SubscriptionStatus.ACTIVE),
                name="uniq_active_subscription_per_student",
            ),
            # sessions_remaining can never go negative (§2.3).
            models.CheckConstraint(
                check=models.Q(sessions_remaining__gte=0),
                name="chk_sub_sessions_nonneg",
            ),
            # active ⇒ started_at AND expires_at present (§2.2).
            models.CheckConstraint(
                check=(
                    ~models.Q(status=SubscriptionStatus.ACTIVE)
                    | (
                        models.Q(started_at__isnull=False)
                        & models.Q(expires_at__isnull=False)
                    )
                ),
                name="chk_active_sub_has_dates",
            ),
        ]

    def clean(self):
        if self.status == SubscriptionStatus.ACTIVE and (
            self.started_at is None or self.expires_at is None
        ):
            raise ValidationError(
                "An active subscription must have started_at and expires_at set."
            )

    @property
    def is_usable(self) -> bool:
        """Active, not expired, with credit remaining (§2.4)."""
        return (
            self.status == SubscriptionStatus.ACTIVE
            and self.expires_at is not None
            and self.expires_at > timezone.now()
            and self.sessions_remaining > 0
        )

    def __str__(self):
        return f"Subscription<{self.student_id} {self.plan.code} {self.status}>"


class PaymentProof(BaseModel):
    """
    Manual-review payment proof. Not soft-deletable — retained until `retain_until`
    (submitted_at + 5 years, §2.7). Decisions require a named admin (§2.2).
    """

    student = models.ForeignKey(
        "accounts.StudentProfile", on_delete=models.PROTECT, related_name="payment_proofs"
    )
    subscription = models.ForeignKey(
        Subscription,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="payment_proofs",
    )
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="payment_proofs")
    plan_name = models.CharField(max_length=60)  # snapshot
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="SDG")
    # Bank transaction number — unique to prevent receipt reuse.
    transaction_number = models.CharField(max_length=60, unique=True)
    transfer_datetime = models.DateTimeField()
    sender_name = models.CharField(max_length=150, null=True, blank=True)
    receiver_name = models.CharField(max_length=150, null=True, blank=True)
    # Optional OCR payload — informational only; NEVER used to auto-approve.
    raw_ocr_data = models.JSONField(null=True, blank=True)
    receipt_file = models.ForeignKey(
        File, on_delete=models.PROTECT, related_name="payment_proofs"
    )
    receipt_name = models.CharField(max_length=255)
    status = models.CharField(
        max_length=20,
        choices=PaymentProofStatus.choices,
        default=PaymentProofStatus.PENDING,
    )
    reviewed_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    review_note = models.TextField(null=True, blank=True)
    submitted_at = models.DateTimeField(default=timezone.now)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    retain_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "payment_proofs"
        indexes = [
            models.Index(fields=["status", "submitted_at"]),
            models.Index(fields=["student", "-submitted_at"]),
            models.Index(fields=["retain_until"]),
        ]
        constraints = [
            # Decided ⇒ reviewer + timestamp present (§2.2).
            models.CheckConstraint(
                check=(
                    models.Q(status=PaymentProofStatus.PENDING)
                    | (
                        models.Q(reviewed_by__isnull=False)
                        & models.Q(reviewed_at__isnull=False)
                    )
                ),
                name="chk_decided_proof_has_reviewer",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.submitted_at is None:
            self.submitted_at = timezone.now()
        if self.retain_until is None:
            self.retain_until = plus_years(self.submitted_at, RETENTION_YEARS)
        super().save(*args, **kwargs)

    def clean(self):
        if self.status in (PaymentProofStatus.APPROVED, PaymentProofStatus.REJECTED) and (
            self.reviewed_by_id is None or self.reviewed_at is None
        ):
            raise ValidationError(
                "A decided payment proof must record reviewed_by and reviewed_at."
            )

    def __str__(self):
        return f"PaymentProof<{self.transaction_number or self.id} {self.status}>"
