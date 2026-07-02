"""
Placement persistence (Phase 8C).

Django models for the Phase-8 AI-led placement interview. These are the
durable home for the framework-free `domain.placement` rules. Scoring logic
lives ONLY in the domain — models/repositories never compute scores.

Integrity guarantees baked in here:
  * one active in_progress attempt per student
  * question order unique per type
  * result one-to-one with attempt
  * answers unique per (attempt, question)
  * NO pronunciation field anywhere
  * correct_answer / correct_index are server-side only (never in a public DTO)
"""
from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel, UUIDModel

# Placement uses a five-level CEFR ladder (no A0 / C2), matching domain.placement.cefr.
CEFR_BANDS = [("A1", "A1"), ("A2", "A2"), ("B1", "B1"), ("B2", "B2"), ("C1", "C1")]


class QuestionType(models.TextChoices):
    WRITTEN = "written", "Written"
    SPOKEN = "spoken", "Spoken"


class PlacementSkill(models.TextChoices):
    GRAMMAR = "grammar", "Grammar"
    VOCABULARY = "vocabulary", "Vocabulary"
    FLUENCY = "fluency", "Fluency"
    COMPREHENSION = "comprehension", "Comprehension"
    CONVERSATION = "conversation", "Conversation"


class AttemptStatus(models.TextChoices):
    IN_PROGRESS = "in_progress", "In progress"
    SUBMITTED = "submitted", "Submitted"
    ASSESSED = "assessed", "Assessed"
    RESET = "reset", "Reset"


class InterviewStatus(models.TextChoices):
    CREATED = "created", "Created"
    RUNNING = "running", "Running"
    COMPLETED = "completed", "Completed"
    FINALIZED = "finalized", "Transcript finalized"


class AnswerSource(models.TextChoices):
    VOICE = "voice", "Voice"      # captured by speech recognition — locked
    MANUAL = "manual", "Manual"   # typed fallback when recognition failed


class InstructorDifficulty(models.TextChoices):
    SUPPORTIVE = "supportive", "Supportive"
    BALANCED = "balanced", "Balanced"
    CHALLENGING = "challenging", "Challenging"


class PlacementQuestion(UUIDModel, TimeStampedModel):
    """Fixed, OneClub-owned placement question. Never AI-generated."""

    question_type = models.CharField(max_length=10, choices=QuestionType.choices, db_index=True)
    prompt = models.TextField()
    skill = models.CharField(max_length=20, choices=PlacementSkill.choices, default=PlacementSkill.CONVERSATION)
    cefr_band = models.CharField(max_length=2, choices=CEFR_BANDS, default="A1")
    order = models.PositiveIntegerField()
    is_active = models.BooleanField(default=True, db_index=True)

    # Oral guidance only — cached "other acceptable answers"; NEVER used to grade.
    ai_alternatives = models.JSONField(default=list, blank=True)
    scoring_rubric = models.JSONField(default=dict, blank=True)  # server-only

    # Server-only answer key (MCQ written items). NEVER serialized to students.
    options = models.JSONField(default=list, blank=True)
    correct_answer = models.TextField(blank=True)
    correct_index = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        db_table = "placement_question"
        ordering = ["question_type", "order"]
        constraints = [
            models.UniqueConstraint(
                fields=["question_type", "order"],
                name="uniq_placement_question_order_per_type",
            ),
        ]
        indexes = [models.Index(fields=["question_type", "is_active"])]

    def __str__(self):
        return f"[{self.question_type}#{self.order}] {self.prompt[:50]}"


class PlacementAttempt(UUIDModel, TimeStampedModel):
    student = models.ForeignKey(
        "accounts.StudentProfile", on_delete=models.CASCADE, related_name="placement_attempts_v2"
    )
    status = models.CharField(
        max_length=12, choices=AttemptStatus.choices, default=AttemptStatus.IN_PROGRESS, db_index=True
    )
    version = models.PositiveIntegerField(default=1)
    goal = models.ForeignKey(
        "onboarding.Goal", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    started_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    assessed_at = models.DateTimeField(null=True, blank=True)
    fallback_used = models.BooleanField(default=False)
    provider_name = models.CharField(max_length=40, blank=True, default="")

    class Meta:
        db_table = "placement_attempt"
        ordering = ["-started_at"]
        constraints = [
            # One active in_progress attempt per student.
            models.UniqueConstraint(
                fields=["student"],
                condition=models.Q(status=AttemptStatus.IN_PROGRESS),
                name="uniq_active_inprogress_attempt_per_student",
            ),
        ]
        indexes = [
            models.Index(fields=["student", "-started_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"PlacementAttempt<{self.id}> {self.student_id} {self.status} v{self.version}"


class PlacementWrittenAnswer(UUIDModel):
    attempt = models.ForeignKey(
        PlacementAttempt, on_delete=models.CASCADE, related_name="written_answers"
    )
    question = models.ForeignKey(PlacementQuestion, on_delete=models.PROTECT, related_name="+")
    answer_text = models.TextField(blank=True)
    score = models.FloatField(null=True, blank=True)  # optional snapshot
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "placement_written_answer"
        constraints = [
            models.UniqueConstraint(
                fields=["attempt", "question"], name="uniq_written_answer_per_attempt_question"
            ),
        ]
        indexes = [models.Index(fields=["attempt"])]

    def __str__(self):
        return f"WrittenAnswer<{self.attempt_id}/{self.question_id}>"


class PlacementSpokenAnswer(UUIDModel):
    attempt = models.ForeignKey(
        PlacementAttempt, on_delete=models.CASCADE, related_name="spoken_answers"
    )
    question = models.ForeignKey(PlacementQuestion, on_delete=models.PROTECT, related_name="+")
    transcript_text = models.TextField(blank=True)  # STT output; domain sees text only
    # How the transcript was produced. VOICE is locked (recognition succeeded);
    # MANUAL is the official transcript typed after recognition failed.
    source = models.CharField(max_length=6, choices=AnswerSource.choices, default=AnswerSource.MANUAL)
    stt_provider = models.CharField(max_length=40, blank=True, default="")
    stt_confidence = models.FloatField(null=True, blank=True)
    spoken_attempt_number = models.PositiveSmallIntegerField(default=1)
    score = models.FloatField(null=True, blank=True)  # optional snapshot
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "placement_spoken_answer"
        constraints = [
            models.UniqueConstraint(
                fields=["attempt", "question"], name="uniq_spoken_answer_per_attempt_question"
            ),
        ]
        indexes = [models.Index(fields=["attempt"])]

    def __str__(self):
        return f"SpokenAnswer<{self.attempt_id}/{self.question_id}>"


class InterviewSession(UUIDModel, TimeStampedModel):
    """
    Dedicated speaking-interview session (Sprint 2.5).

    Owns the interview LIFECYCLE and progress ONLY. It holds NO assessment fields
    (no CEFR, score, or recommendation) — the interview is fully isolated from the
    assessment engine. The finalized transcript is the ordered set of the attempt's
    PlacementSpokenAnswer rows.

    Lifecycle: created → running → completed → finalized.
    """

    attempt = models.OneToOneField(
        PlacementAttempt, on_delete=models.CASCADE, related_name="interview_session"
    )
    status = models.CharField(
        max_length=12, choices=InterviewStatus.choices,
        default=InterviewStatus.CREATED, db_index=True,
    )
    # Index of the next unanswered question (0-based); resume point.
    current_question_index = models.PositiveIntegerField(default=0)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "placement_interview_session"

    def __str__(self):
        return f"InterviewSession<{self.id}> {self.attempt_id} {self.status}"


class PlacementAssessmentResult(UUIDModel):
    """One-to-one with an attempt. Flat scores + recommendations. NO pronunciation."""

    attempt = models.OneToOneField(
        PlacementAttempt, on_delete=models.CASCADE, related_name="result"
    )
    cefr_level = models.CharField(max_length=2, choices=CEFR_BANDS)
    overall_conversation_score = models.PositiveSmallIntegerField(default=0)
    grammar_score = models.PositiveSmallIntegerField(default=0)
    vocabulary_score = models.PositiveSmallIntegerField(default=0)
    fluency_score = models.PositiveSmallIntegerField(default=0)
    confidence_score = models.PositiveSmallIntegerField(default=0)
    written_score = models.PositiveSmallIntegerField(default=0)
    spoken_score = models.PositiveSmallIntegerField(default=0)
    spoken_capped = models.BooleanField(default=False)
    spoken_ceiling = models.CharField(max_length=2, choices=CEFR_BANDS, default="C1")

    strengths = models.JSONField(default=list, blank=True)
    weaknesses = models.JSONField(default=list, blank=True)
    recommended_focus = models.JSONField(default=list, blank=True)
    recommended_conversation_topics = models.JSONField(default=list, blank=True)
    recommended_instructor_difficulty = models.CharField(
        max_length=12, choices=InstructorDifficulty.choices, default=InstructorDifficulty.BALANCED
    )

    evaluator_version = models.CharField(max_length=40, blank=True, default="")
    provider_name = models.CharField(max_length=40, blank=True, default="heuristic")
    fallback_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "placement_assessment_result"
        indexes = [models.Index(fields=["cefr_level"])]

    def __str__(self):
        return f"AssessmentResult<{self.attempt_id} {self.cefr_level}>"


class PlacementResetAudit(UUIDModel):
    """Immutable record of an admin reopening a student's spoken attempt."""

    student = models.ForeignKey(
        "accounts.StudentProfile", on_delete=models.CASCADE, related_name="placement_reset_audits"
    )
    attempt = models.ForeignKey(
        PlacementAttempt, on_delete=models.SET_NULL, null=True, blank=True, related_name="reset_audits"
    )
    reset_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    reason = models.TextField()
    reset_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "placement_reset_audit"
        ordering = ["-reset_at"]
        indexes = [models.Index(fields=["student", "-reset_at"])]

    def __str__(self):
        return f"ResetAudit<{self.student_id} {self.reset_at:%Y-%m-%d}>"
