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
from apps.common.enums import (
    AIReportStatus,
    BookingStatus,
    SessionStatus,
    SubscriptionStatus,
    TranscriptSource,
)
from apps.sessions.models import Session, SessionTranscript
from application import mappers
from application.permissions import (
    ensure_booking_viewer,
    ensure_session_joiner,
    ensure_session_participant,
    session_joiner_role,
)
from domain import events as domain_events
from domain.dtos import SessionResult, TranscriptResult, VideoJoinResult, WaitingRoomResult
from domain.exceptions import (
    DomainError,
    InvalidStateTransition,
    NoActiveSubscription,
    PermissionDenied,
    SessionExpired,
    SessionNotJoinable,
    SubscriptionExpired,
)
from domain.rules import sessions as session_rules
from infrastructure.container import (
    default_booking_repository,
    default_event_bus,
    default_meeting_token_provider,
    default_session_repository,
    default_video_provider,
)


def _ensure_joinable(session, actor, now):
    """Full join validation. Returns the joiner role ("student"/"instructor") or
    raises the appropriate domain/permission error. No admin bypass."""
    role = ensure_session_joiner(actor, session)  # assigned student/instructor only
    booking = session.booking
    if session.status in (SessionStatus.COMPLETED, SessionStatus.CANCELLED):
        raise SessionNotJoinable()
    if session_rules.is_expired(
        status=session.status, scheduled_at=booking.scheduled_at,
        duration_minutes=booking.duration_minutes, now=now,
    ):
        raise SessionExpired()
    if not session_rules.can_join(session.status):
        raise SessionNotJoinable()
    if not session_rules.join_window_open(
        scheduled_at=booking.scheduled_at, duration_minutes=booking.duration_minutes, now=now
    ):
        raise SessionNotJoinable()
    if role == "student":
        if booking.status != BookingStatus.UPCOMING:
            raise SessionNotJoinable()
        sub = booking.subscription
        if sub.status != SubscriptionStatus.ACTIVE:
            raise NoActiveSubscription()
        if sub.expires_at is None or sub.expires_at <= now:
            raise SubscriptionExpired()
    return role


class CreateSessionUseCase:
    """Get-or-create the (waiting) session for a booking. Idempotent."""

    def __init__(self, *, sessions=None, bookings=None):
        self.sessions = sessions or default_session_repository()
        self.bookings = bookings or default_booking_repository()

    def execute(self, *, actor, booking_id) -> SessionResult:
        booking = self.bookings.get(booking_id)
        ensure_booking_viewer(actor, booking)  # participant/admin of the booking
        session = self.sessions.get_by_booking(booking)
        if session is None:
            session = Session.objects.create(booking=booking, status=SessionStatus.SCHEDULED)
        return SessionResult(
            session_id=str(session.id), status=session.status,
            started_at=session.started_at, ended_at=session.ended_at,
        )


class GetSessionUseCase:
    """Waiting-room view for a participant (student/instructor) or admin (read)."""

    def __init__(self, *, sessions=None):
        self.sessions = sessions or default_session_repository()

    def execute(self, *, actor, session_id) -> WaitingRoomResult:
        session = self.sessions.get(session_id)
        ensure_session_participant(actor, session)  # admin may VIEW (not join)
        now = timezone.now()
        booking = session.booking
        opens_at, closes_at = session_rules.join_window(booking.scheduled_at, booking.duration_minutes)
        phase = session_rules.session_phase(
            status=session.status, scheduled_at=booking.scheduled_at,
            duration_minutes=booking.duration_minutes, now=now,
        )
        role = session_joiner_role(actor, session)  # None for admin
        try:
            _ensure_joinable(session, actor, now)
            can_join = True
        except (PermissionDenied, DomainError):
            can_join = False
        return WaitingRoomResult(
            session_id=str(session.id),
            booking_id=str(session.booking_id),
            topic_title=booking.topic_title,
            instructor_name=booking.instructor_name,
            scheduled_at=booking.scheduled_at,
            duration_minutes=booking.duration_minutes,
            phase=phase,
            can_join=can_join,
            join_opens_at=opens_at,
            join_closes_at=closes_at,
            viewer_role=role or "admin",
        )


class JoinSessionUseCase:
    def __init__(self, *, sessions=None, video=None, tokens=None):
        self.sessions = sessions or default_session_repository()
        self.video = video or default_video_provider()
        self.tokens = tokens or default_meeting_token_provider()

    def execute(self, *, actor, session_id) -> VideoJoinResult:
        session = self.sessions.get(session_id)
        _ensure_joinable(session, actor, timezone.now())

        # Provision the channel on first join (VideoProvider), then mint the token
        # (MeetingTokenProvider) — two distinct provider responsibilities.
        if not session.agora_channel:
            session.agora_channel = self.video.create_channel(session_id=session.id)
            self.sessions.save(session)

        token = self.tokens.issue(channel=session.agora_channel, identity=actor.id)
        return VideoJoinResult(
            session_id=str(session.id),
            provider=token.provider,
            channel=token.channel,
            token=token.token,
            uid=token.uid,
            expires_at=token.expires_at,
            app_id=getattr(token, "app_id", None),
        )


class LeaveSessionUseCase:
    """A participant leaves the room. No presence/attendance is tracked (out of
    scope), so this validates authorization and returns the current session."""

    def __init__(self, *, sessions=None):
        self.sessions = sessions or default_session_repository()

    def execute(self, *, actor, session_id) -> SessionResult:
        session = self.sessions.get(session_id)
        ensure_session_joiner(actor, session)  # assigned participant only
        return SessionResult(
            session_id=str(session.id), status=session.status,
            started_at=session.started_at, ended_at=session.ended_at,
        )


class StartSessionUseCase:
    def __init__(self, *, sessions=None, video=None, events=None):
        self.sessions = sessions or default_session_repository()
        self.video = video or default_video_provider()
        self.events = events or default_event_bus()

    @transaction.atomic
    def execute(self, *, actor, session_id) -> SessionResult:
        session = self.sessions.get(session_id)
        ensure_session_joiner(actor, session)  # assigned participant only (no admin)

        if session.status == SessionStatus.LIVE:  # idempotent
            return self._result(session)
        if not session_rules.can_start(session.status):
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


class EndSessionUseCase:
    """End the live session (lifecycle transition only). No transcript, no AI, no
    report — those are separate journeys. Assigned participant only (no admin)."""

    def __init__(self, *, sessions=None, events=None):
        self.sessions = sessions or default_session_repository()
        self.events = events or default_event_bus()

    @transaction.atomic
    def execute(self, *, actor, session_id) -> SessionResult:
        session = self.sessions.get(session_id)
        ensure_session_joiner(actor, session)

        if session.status == SessionStatus.COMPLETED:  # idempotent
            return self._result(session)
        if not session_rules.can_end(session.status):
            raise InvalidStateTransition("Only a scheduled/live session can end.")

        now = timezone.now()
        if not session.agora_channel:  # completed sessions must carry a channel (§2.6)
            session.agora_channel = f"session-{session.id}"
        if session.started_at is None:  # ending without a start → started == ended
            session.started_at = now
        session.status = SessionStatus.COMPLETED
        session.ended_at = now
        self.sessions.save(session)

        booking = session.booking
        booking.status = BookingStatus.COMPLETED
        booking.save(update_fields=["status", "updated_at"])

        self.events.publish(
            domain_events.SessionCompleted(
                session_id=str(session.id),
                booking_id=str(booking.id),
                ended_at=session.ended_at,
            )
        )
        return self._result(session)

    @staticmethod
    def _result(session):
        return SessionResult(
            session_id=str(session.id), status=session.status,
            started_at=session.started_at, ended_at=session.ended_at,
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
