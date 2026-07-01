"""
ai_reports — post-session AI report.

Maps database design table: ai_reports. A report is only ever created once its
session is completed (enforced by services, not a DB constraint). OpenAI
integration itself is out of scope this phase — generation is a stub elsewhere.
"""
from django.core.exceptions import ValidationError
from django.db import models

from apps.common.enums import AIReportStatus
from apps.common.models import UUIDModel, TimeStampedModel, SoftDeleteModel


class AIReport(UUIDModel, TimeStampedModel, SoftDeleteModel):
    session = models.OneToOneField(
        "live_sessions.Session", on_delete=models.CASCADE, related_name="report"
    )
    booking = models.OneToOneField(
        "scheduling.Booking", on_delete=models.CASCADE, related_name="report"
    )
    student = models.ForeignKey(
        "accounts.StudentProfile", on_delete=models.CASCADE, related_name="reports"
    )
    topic_title = models.CharField(max_length=120)  # snapshot
    instructor_name = models.CharField(max_length=150)  # snapshot
    session_date = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField()
    overall_score = models.PositiveSmallIntegerField(null=True, blank=True)  # 0-100
    skills = models.JSONField(default=list)  # [{label, value, color}]
    mistakes = models.JSONField(default=list)  # [{label, example}]
    recommendations = models.JSONField(default=list)  # string[]
    instructor_note = models.TextField(null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=AIReportStatus.choices, default=AIReportStatus.PENDING
    )
    generated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "ai_reports"
        indexes = [models.Index(fields=["student", "-session_date"])]
        constraints = [
            models.CheckConstraint(
                check=(
                    ~models.Q(status=AIReportStatus.READY)
                    | (
                        models.Q(overall_score__isnull=False)
                        & models.Q(generated_at__isnull=False)
                    )
                ),
                name="chk_ready_report_complete",
            ),
        ]

    def clean(self):
        if self.status == AIReportStatus.READY and (
            self.overall_score is None or self.generated_at is None
        ):
            raise ValidationError(
                "A ready report must have overall_score and generated_at set."
            )

    def __str__(self):
        return f"AIReport<{self.booking_id} {self.status}>"
