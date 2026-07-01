"""
onboarding — goals, placement question bank, attempts and results.

Maps database design tables: goals, placement_questions, placement_attempts,
placement_results.
"""
from django.db import models

from apps.common.enums import CEFRLevel, PlacementSkill
from apps.common.models import BaseModel, SoftDeleteModel, TimeStampedModel, UUIDModel


class Goal(UUIDModel, TimeStampedModel):
    """Reference data — what the student wants to use English for."""

    code = models.CharField(max_length=40, unique=True)
    label = models.CharField(max_length=80)
    description = models.CharField(max_length=160, null=True, blank=True)
    icon = models.CharField(max_length=40, null=True, blank=True)
    accent = models.CharField(max_length=60, null=True, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        db_table = "goals"

    def __str__(self):
        return self.label


class PlacementQuestion(BaseModel):
    """Question bank. `correct_index` is SERVER-ONLY and never serialized to students."""

    prompt = models.TextField()
    options = models.JSONField(default=list)  # ordered string array
    correct_index = models.PositiveSmallIntegerField()
    skill = models.CharField(max_length=20, choices=PlacementSkill.choices)
    active = models.BooleanField(default=True)

    class Meta:
        db_table = "placement_questions"
        indexes = [
            models.Index(
                fields=["active"],
                name="placement_q_active_idx",
                condition=models.Q(active=True),
            ),
        ]

    def __str__(self):
        return self.prompt[:60]


class PlacementAttempt(UUIDModel, TimeStampedModel):
    student = models.ForeignKey(
        "accounts.StudentProfile",
        on_delete=models.CASCADE,
        related_name="placement_attempts",
    )
    answers = models.JSONField(default=list)  # [{questionId, selectedIndex}]
    submitted_at = models.DateTimeField()

    class Meta:
        db_table = "placement_attempts"
        indexes = [models.Index(fields=["student", "-submitted_at"])]

    def __str__(self):
        return f"Attempt<{self.student_id}>"


class PlacementResult(UUIDModel, TimeStampedModel, SoftDeleteModel):
    attempt = models.OneToOneField(
        PlacementAttempt, on_delete=models.CASCADE, related_name="result"
    )
    student = models.ForeignKey(
        "accounts.StudentProfile",
        on_delete=models.CASCADE,
        related_name="placement_results",
    )
    level = models.CharField(max_length=2, choices=CEFRLevel.choices)
    level_label = models.CharField(max_length=40)
    summary = models.TextField(null=True, blank=True)
    skills = models.JSONField(default=list)  # [{label, value, color}]

    class Meta:
        db_table = "placement_results"
        indexes = [models.Index(fields=["student", "-created_at"])]

    def __str__(self):
        return f"Result<{self.student_id} {self.level}>"
