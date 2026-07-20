"""
ai_tutor — a separate, optional product: short (≤5 min) AI speaking-practice
sessions with their own subscription, independent of the live-instructor session
credits.

  AITutorSubscription — one active per student; activated by an approved payment
                        proof whose plan.kind == "ai_tutor".
  AITutorSession      — one practice conversation, hard-capped to 5 minutes.
"""
from django.db import models
from django.utils import timezone

from apps.common.enums import AITutorSessionStatus, SubscriptionStatus
from apps.common.models import BaseModel, SoftDeleteModel

# Hard cap on a single practice conversation.
AI_TUTOR_SESSION_MINUTES = 5


class AITutorSubscription(BaseModel, SoftDeleteModel):
    """A student's AI-tutor access. Mirrors the shape the payment-approval flow
    expects (id/status/started_at/expires_at) so it can be activated through the
    same path as a session subscription — but it grants AI practice, not session
    credits."""

    student = models.ForeignKey(
        "accounts.StudentProfile", on_delete=models.CASCADE, related_name="ai_tutor_subscriptions"
    )
    plan = models.ForeignKey(
        "billing.Plan", on_delete=models.PROTECT, related_name="ai_tutor_subscriptions"
    )
    status = models.CharField(
        max_length=20, choices=SubscriptionStatus.choices, default=SubscriptionStatus.PENDING
    )
    started_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    activated_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "ai_tutor_subscriptions"
        constraints = [
            models.UniqueConstraint(
                fields=["student"],
                condition=models.Q(status=SubscriptionStatus.ACTIVE),
                name="uniq_active_ai_tutor_sub_per_student",
            ),
        ]
        indexes = [models.Index(fields=["student", "status"])]

    # Compatibility shim: the payment-approval use case reads `sessions_remaining`.
    @property
    def sessions_remaining(self) -> int:
        return 0

    @property
    def is_active(self) -> bool:
        return (
            self.status == SubscriptionStatus.ACTIVE
            and self.expires_at is not None
            and self.expires_at > timezone.now()
        )

    def __str__(self):
        return f"AITutorSubscription<{self.student_id} {self.status}>"


class AITutorSession(BaseModel):
    """A single AI speaking-practice conversation, hard-capped to 5 minutes. The
    transcript is stored inline (small, short-lived practice)."""

    student = models.ForeignKey(
        "accounts.StudentProfile", on_delete=models.CASCADE, related_name="ai_tutor_sessions"
    )
    subscription = models.ForeignKey(
        AITutorSubscription, on_delete=models.PROTECT, related_name="sessions"
    )
    topic = models.CharField(max_length=120, blank=True, default="")
    started_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=10, choices=AITutorSessionStatus.choices, default=AITutorSessionStatus.ACTIVE
    )
    # [{"role": "tutor"|"student", "text": str, "at": iso}]
    messages = models.JSONField(default=list)

    class Meta:
        db_table = "ai_tutor_sessions"
        indexes = [
            models.Index(fields=["student", "-started_at"]),
            models.Index(fields=["status"]),
        ]

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    def __str__(self):
        return f"AITutorSession<{self.student_id} {self.status}>"
