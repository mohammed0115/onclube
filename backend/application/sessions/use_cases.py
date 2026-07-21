"""
Session use cases.

Live-room lifecycle. Video provisioning goes through the VideoProvider port —
JoinSessionUseCase NEVER mints tokens itself, and the current adapter is a stub
(no real Agora). CompleteSessionUseCase prepares a PENDING AI report but does NOT
call OpenAI; report content is filled later by GenerateSessionReportUseCase.
"""
import logging

from django.db import transaction
from django.utils import timezone

from apps.ai_reports.models import AIReport
from apps.common.enums import (
    AIReportStatus,
    BookingStatus,
    SessionStatus,
    SubscriptionStatus,
    TranscriptSource,
    UserRole,
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

_logger = logging.getLogger("sessions.use_cases")
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
        # The prepared discussion questions the instructor walks through in-call.
        # Availability-first bookings carry the instructor-authored lesson questions
        # (no topic); legacy topic bookings fall back to approved topic questions.
        if booking.lesson_questions:
            questions = tuple(booking.lesson_questions)
        elif booking.topic_id:
            questions = tuple(
                booking.topic.questions.filter(approved=True)
                .order_by("sort_order")
                .values_list("text", flat=True)
            )
        else:
            questions = ()
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
            questions=questions,
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


def _ensure_session_instructor(actor, session):
    """The session's own instructor (or an admin) — for writing notes/reviewing."""
    from domain.exceptions import PermissionDenied
    is_admin = getattr(actor, "role", None) == UserRole.ADMIN
    is_instructor = (
        getattr(actor, "role", None) == UserRole.INSTRUCTOR
        and getattr(session.booking.instructor, "user_id", None) == getattr(actor, "id", None)
    )
    if not (is_admin or is_instructor):
        raise PermissionDenied("Only the session's instructor may do this.")


class SaveSessionNotesUseCase:
    """Instructor writes structured post-session notes
    (participation / strengths / weaknesses / homework / next_focus)."""

    _FIELDS = ("participation", "strengths", "weaknesses", "homework", "next_focus")

    def __init__(self, *, sessions=None):
        self.sessions = sessions or default_session_repository()

    def execute(self, *, actor, session_id, notes) -> dict:
        session = self.sessions.get(session_id)
        _ensure_session_instructor(actor, session)
        cleaned = {k: (notes.get(k) or "") for k in self._FIELDS}
        session.instructor_notes = cleaned
        session.save(update_fields=["instructor_notes", "updated_at"])
        return {"sessionId": str(session.id), "notes": cleaned}


class AcceptReportUseCase:
    """Instructor accepts the AI report as reviewed (optionally leaving a note)."""

    def __init__(self, *, sessions=None):
        self.sessions = sessions or default_session_repository()

    def execute(self, *, actor, session_id, note="") -> dict:
        session = self.sessions.get(session_id)
        _ensure_session_instructor(actor, session)
        report = AIReport.objects.filter(session=session).first()
        if report is None:
            from apps.common.exceptions import BusinessRuleError
            raise BusinessRuleError("No report to accept yet.", code="report_not_ready")
        report.instructor_reviewed = True
        if note:
            report.instructor_note = note
        report.save(update_fields=["instructor_reviewed", "instructor_note", "updated_at"])
        return {"sessionId": str(session.id), "reviewed": True}


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

        now = timezone.now()
        booking = session.booking
        self._finalize(session, booking, now)
        self._make_report_shell(session, booking)
        self.events.publish(
            domain_events.SessionCompleted(
                session_id=str(session.id),
                booking_id=str(booking.id),
                ended_at=session.ended_at,
            )
        )
        self._generate_report(actor, session.id)

        # Group sessions: every student at this instructor+time shares ONE room. When
        # the room is completed we must finalize EACH student's own booking + session
        # and produce EACH report — otherwise the other group members stay UPCOMING
        # with no report even though their credit was already spent.
        from apps.scheduling.models import Booking

        siblings = Booking.objects.filter(
            instructor_id=booking.instructor_id,
            scheduled_at=booking.scheduled_at,
            status=BookingStatus.UPCOMING,
            deleted_at__isnull=True,
        ).exclude(id=booking.id)
        for sib in siblings:
            sib_session = Session.objects.filter(booking=sib).order_by("created_at").first()
            if sib_session is None:
                # No room row for this member — still release them from UPCOMING limbo.
                sib.status = BookingStatus.COMPLETED
                sib.save(update_fields=["status", "updated_at"])
                continue
            if sib_session.status != SessionStatus.COMPLETED:
                self._finalize(sib_session, sib, now)
            self._make_report_shell(sib_session, sib)
            self.events.publish(
                domain_events.SessionCompleted(
                    session_id=str(sib_session.id),
                    booking_id=str(sib.id),
                    ended_at=sib_session.ended_at,
                )
            )
            self._generate_report(actor, sib_session.id)

        return self._result(session, report_pending=True)

    def _finalize(self, session, booking, now):
        """Transition a session (and its booking) to COMPLETED, backfilling the
        channel/started_at invariants a completed session must satisfy (§2.6)."""
        if not session.agora_channel:
            session.agora_channel = f"session-{session.id}"
        if session.started_at is None:  # started == ended for a zero-length room
            session.started_at = now
        session.status = SessionStatus.COMPLETED
        session.ended_at = now
        self.sessions.save(session)
        booking.status = BookingStatus.COMPLETED
        booking.save(update_fields=["status", "updated_at"])

    @staticmethod
    def _make_report_shell(session, booking):
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

    def _generate_report(self, actor, session_id):
        """Best-effort report generation. The provider degrades to the heuristic, so a
        report is produced from whatever transcript exists. Savepoint-isolated: a
        failure (or an actor who is not this session's participant, e.g. a groupmate)
        leaves the report PENDING for an instructor/admin to regenerate, but never
        rolls back the completion."""
        try:
            from application.ai_reports.use_cases import GenerateAISessionReportUseCase

            with transaction.atomic():
                GenerateAISessionReportUseCase().execute(actor=actor, session_id=session_id)
        except Exception:  # noqa: BLE001 — report stays PENDING, completion stands
            _logger.warning("AI report generation failed for session %s; left PENDING", session_id)

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
