"""
Session use cases.

Live-room lifecycle. Video provisioning goes through the VideoProvider port —
JoinSessionUseCase NEVER mints tokens itself, and the current adapter is a stub
(no real Agora). CompleteSessionUseCase prepares a PENDING AI report but does NOT
call OpenAI; report content is filled later by GenerateSessionReportUseCase.
"""
from django.db import transaction
from django.utils import timezone

from apps.ai_reports.models import AIReport
from apps.common.enums import AIReportStatus, BookingStatus, SessionStatus, TranscriptSource
from apps.sessions.models import SessionTranscript
from application import mappers
from application.permissions import ensure_session_participant
from domain import events as domain_events
from domain.dtos import SessionResult, TranscriptResult, VideoJoinResult
from domain.exceptions import InvalidStateTransition, SessionNotJoinable
from domain.rules import sessions as session_rules
from infrastructure.container import (
    default_event_bus,
    default_session_repository,
    default_video_provider,
)


class JoinSessionUseCase:
    def __init__(self, *, sessions=None, video=None):
        self.sessions = sessions or default_session_repository()
        self.video = video or default_video_provider()

    def execute(self, *, actor, session_id) -> VideoJoinResult:
        session = self.sessions.get(session_id)
        ensure_session_participant(actor, session)
        if not session_rules.can_join(session.status):
            raise SessionNotJoinable()

        # Provision a channel on first join (still no real token here).
        if not session.agora_channel:
            session.agora_channel = self.video.create_channel(session_id=session.id)
            self.sessions.save(session)

        token = self.video.issue_join(channel=session.agora_channel, identity=actor.id)
        return VideoJoinResult(
            session_id=str(session.id),
            provider=token.provider,
            channel=token.channel,
            token=token.token,
            uid=token.uid,
            expires_at=token.expires_at,
            app_id=getattr(token, "app_id", None),
        )


class StartSessionUseCase:
    def __init__(self, *, sessions=None, video=None, events=None):
        self.sessions = sessions or default_session_repository()
        self.video = video or default_video_provider()
        self.events = events or default_event_bus()

    @transaction.atomic
    def execute(self, *, actor, session_id) -> SessionResult:
        session = self.sessions.get(session_id)
        ensure_session_participant(actor, session)

        if session.status == SessionStatus.LIVE:  # idempotent
            return self._result(session)
        if session.status != SessionStatus.SCHEDULED:
            raise InvalidStateTransition("Only a scheduled session can start.")

        if not session.agora_channel:
            session.agora_channel = self.video.create_channel(session_id=session.id)
        session.status = SessionStatus.LIVE
        session.started_at = timezone.now()
        self.sessions.save(session)

        self.events.publish(
            domain_events.SessionStarted(
                session_id=str(session.id),
                booking_id=str(session.booking_id),
                started_at=session.started_at,
            )
        )
        return self._result(session)

    @staticmethod
    def _result(session):
        return SessionResult(
            session_id=str(session.id),
            status=session.status,
            started_at=session.started_at,
            ended_at=session.ended_at,
        )


class CompleteSessionUseCase:
    def __init__(self, *, sessions=None, events=None):
        self.sessions = sessions or default_session_repository()
        self.events = events or default_event_bus()

    @transaction.atomic
    def execute(self, *, actor, session_id) -> SessionResult:
        session = self.sessions.get(session_id)
        ensure_session_participant(actor, session)

        if session.status == SessionStatus.COMPLETED:  # idempotent
            return self._result(session)
        if not session_rules.can_complete(session.status):
            raise InvalidStateTransition("Only a scheduled/live session can complete.")

        # A completed session must carry a channel (§2.6). Backfill a placeholder
        # if the room was never joined.
        if not session.agora_channel:
            session.agora_channel = f"session-{session.id}"
        session.status = SessionStatus.COMPLETED
        session.ended_at = timezone.now()
        self.sessions.save(session)

        booking = session.booking
        booking.status = BookingStatus.COMPLETED
        booking.save(update_fields=["status", "updated_at"])

        # Prepare (but do NOT generate) the AI report — no OpenAI call here.
        AIReport.objects.get_or_create(
            session=session,
            defaults=dict(
                booking=booking,
                student=booking.student,
                topic_title=booking.topic_title,
                instructor_name=booking.instructor_name,
                session_date=booking.scheduled_at,
                duration_minutes=booking.duration_minutes,
                status=AIReportStatus.PENDING,
            ),
        )

        self.events.publish(
            domain_events.SessionCompleted(
                session_id=str(session.id),
                booking_id=str(booking.id),
                ended_at=session.ended_at,
            )
        )
        return self._result(session, report_pending=True)

    @staticmethod
    def _result(session, report_pending=False):
        return SessionResult(
            session_id=str(session.id),
            status=session.status,
            started_at=session.started_at,
            ended_at=session.ended_at,
            report_pending=report_pending,
        )


class AttachTranscriptUseCase:
    def __init__(self, *, sessions=None):
        self.sessions = sessions or default_session_repository()

    def execute(self, *, actor, session_id, content, source=TranscriptSource.MANUAL) -> TranscriptResult:
        session = self.sessions.get(session_id)
        ensure_session_participant(actor, session)
        transcript, _ = SessionTranscript.objects.update_or_create(
            session=session, defaults=dict(content=content, source=source)
        )
        return mappers.transcript_result(transcript)
