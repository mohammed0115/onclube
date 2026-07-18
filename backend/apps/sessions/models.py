"""
sessions — live-room runtime record and transcript.

App label is "live_sessions" (see apps.py) to avoid clashing with
django.contrib.sessions. Maps database design tables: sessions,
session_transcripts. Encodes §2.6 (Agora channel belongs to a valid session).

NOTE: Agora RTC tokens are minted server-side at join time and never stored, so
no token column exists. Agora SDK integration itself is out of scope this phase.
"""
from django.core.exceptions import ValidationError
from django.db import models

from apps.common.enums import SessionStatus, TranscriptSource
from apps.common.models import BaseModel, SoftDeleteModel, TimeStampedModel, UUIDModel


class Session(BaseModel, SoftDeleteModel):
    booking = models.OneToOneField(
        "scheduling.Booking", on_delete=models.CASCADE, related_name="session"
    )
    status = models.CharField(
        max_length=20, choices=SessionStatus.choices, default=SessionStatus.SCHEDULED
    )
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    agora_channel = models.CharField(
        max_length=64, null=True, blank=True, unique=True
    )
    student_notes = models.TextField(null=True, blank=True)
    # Structured post-session notes written by the instructor:
    # {participation, strengths, weaknesses, homework, next_focus}
    instructor_notes = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "sessions"
        constraints = [
            # live/completed sessions must have an Agora channel (§2.6).
            models.CheckConstraint(
                check=(
                    ~models.Q(status__in=[SessionStatus.LIVE, SessionStatus.COMPLETED])
                    | models.Q(agora_channel__isnull=False)
                ),
                name="chk_active_session_has_channel",
            ),
            models.CheckConstraint(
                check=(
                    models.Q(ended_at__isnull=True)
                    | models.Q(started_at__isnull=False, ended_at__gte=models.F("started_at"))
                ),
                name="chk_session_end_after_start",
            ),
        ]

    def clean(self):
        if self.status in (SessionStatus.LIVE, SessionStatus.COMPLETED) and not self.agora_channel:
            raise ValidationError(
                "A live or completed session must have an Agora channel."
            )

    def __str__(self):
        return f"Session<{self.booking_id} {self.status}>"


class SessionTranscript(UUIDModel, TimeStampedModel):
    session = models.OneToOneField(
        Session, on_delete=models.CASCADE, related_name="transcript"
    )
    content = models.JSONField(default=list)  # [{speaker, text, ts}]
    source = models.CharField(
        max_length=10, choices=TranscriptSource.choices, default=TranscriptSource.ASR
    )

    class Meta:
        db_table = "session_transcripts"

    def __str__(self):
        return f"Transcript<{self.session_id}>"
