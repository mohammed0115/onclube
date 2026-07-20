"""
AI use cases.

All AI work goes through the AIProvider port. The current adapter is a STUB —
no OpenAI, no network. Product rules honored here:
  - AI-generated questions are persisted as drafts (approved=False) until an
    instructor accepts them.
  - AI subtopic suggestions are returned as proposals (not persisted).
  - A session report is generated from (mock) transcript input only after the
    session is completed, and never regenerated once ready.
"""
from django.db import transaction
from django.utils import timezone

from apps.common.enums import AIReportStatus, UserRole
from apps.onboarding.models import PlacementAttempt, PlacementResult
from apps.scheduling.models import Question
from apps.ai_reports.models import AIReport
from apps.sessions.models import SessionTranscript
from application.permissions import (
    ensure_session_participant,
    ensure_student_owns,
    get_instructor_profile,
)
from domain import events as domain_events
from domain.dtos import AIReportResult, PlacementResultDTO, SuggestionResult
from domain.exceptions import (
    AIReportAlreadyGenerated,
    InvalidStateTransition,
    PermissionDenied,
)
from domain.rules import sessions as session_rules
from domain.session_report import SessionReportContext
from infrastructure.container import (
    default_ai_provider,
    default_event_bus,
    default_session_report_provider,
    default_session_repository,
    default_topic_repository,
)


def _ensure_topic_owner(actor, topic):
    """Owning instructor or an admin may use AI on a topic."""
    if actor is not None and getattr(actor, "role", None) == UserRole.ADMIN:
        return
    instructor = get_instructor_profile(actor)
    if topic.instructor_id != instructor.id:
        raise PermissionDenied("You can only use AI on your own topics.")


class GeneratePlacementResultUseCase:
    def __init__(self, *, ai=None):
        self.ai = ai or default_ai_provider()

    @transaction.atomic
    def execute(self, *, actor, attempt_id) -> PlacementResultDTO:
        attempt = PlacementAttempt.objects.select_related("student__user").get(pk=attempt_id)
        ensure_student_owns(actor, attempt.student)

        data = self.ai.score_placement(answers=attempt.answers)
        result = PlacementResult.objects.create(
            attempt=attempt,
            student=attempt.student,
            level=data["level"],
            level_label=data["level_label"],
            summary=data["summary"],
            skills=data["skills"],
        )
        student = attempt.student
        student.level = data["level"]
        student.placement_result = result
        student.save(update_fields=["level", "placement_result", "updated_at"])

        return PlacementResultDTO(
            result_id=str(result.id),
            level=result.level,
            level_label=result.level_label,
            skills=result.skills,
        )


class GenerateTopicSubtopicsUseCase:
    def __init__(self, *, topics=None, ai=None):
        self.topics = topics or default_topic_repository()
        self.ai = ai or default_ai_provider()

    def execute(self, *, actor, topic_id) -> SuggestionResult:
        topic = self.topics.get(topic_id)
        _ensure_topic_owner(actor, topic)
        items = self.ai.suggest_subtopics(
            topic_title=topic.title, topic_description=topic.description or ""
        )
        # Proposals only — instructor accepts them later (persists with ai_generated=True).
        return SuggestionResult(topic_id=str(topic.id), items=items, created_ids=[])


class GenerateDiscussionQuestionsUseCase:
    def __init__(self, *, topics=None, ai=None):
        self.topics = topics or default_topic_repository()
        self.ai = ai or default_ai_provider()

    @transaction.atomic
    def execute(self, *, actor, topic_id) -> SuggestionResult:
        topic = self.topics.get(topic_id)
        _ensure_topic_owner(actor, topic)

        texts = self.ai.generate_questions(
            topic_title=topic.title, topic_description=topic.description or ""
        )
        start = topic.questions.count()
        created = []
        for offset, text in enumerate(texts, start=1):
            q = Question.objects.create(
                topic=topic,
                text=text,
                ai_assisted=True,
                approved=False,  # draft until the instructor approves
                sort_order=start + offset,
            )
            created.append(str(q.id))
        return SuggestionResult(topic_id=str(topic.id), items=texts, created_ids=created)


def _transcript_lines(session) -> tuple:
    """Extract FINALIZED transcript text lines (read-only). Never partial/live."""
    existing = SessionTranscript.objects.filter(session=session).first()
    content = existing.content if existing else []
    lines = []
    if isinstance(content, list):
        for seg in content:
            if isinstance(seg, dict) and seg.get("text"):
                lines.append(str(seg["text"]))
    return tuple(lines)


class GenerateAISessionReportUseCase:
    """Sprint 9 — produce the structured AI Session Report from completed-session
    artifacts, via the provider-neutral SessionReportProvider. Generate-once and
    idempotent; regeneration requires an explicit admin action. Never touches the
    transcript, attendance, or recording."""

    def __init__(self, *, sessions=None, reports_provider=None, events=None):
        self.sessions = sessions or default_session_repository()
        self.reports_provider = reports_provider or default_session_report_provider()
        self.events = events or default_event_bus()

    @transaction.atomic
    def execute(self, *, actor, session_id, regenerate: bool = False) -> AIReportResult:
        session = self.sessions.get(session_id)
        ensure_session_participant(actor, session)  # admin may act; others must be participants

        if not session_rules.is_completed(session.status):
            raise InvalidStateTransition("Session must be completed before report generation.")

        booking = session.booking
        report, _ = AIReport.objects.get_or_create(
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

        already_generated = report.status == AIReportStatus.READY and report.content is not None
        if already_generated and not regenerate:
            # Idempotent: return the existing report without re-calling the provider.
            return self._result(report)
        if regenerate:
            is_admin = getattr(actor, "role", None) == UserRole.ADMIN
            is_instructor = (
                getattr(actor, "role", None) == UserRole.INSTRUCTOR
                and getattr(booking.instructor, "user_id", None) == getattr(actor, "id", None)
            )
            if not (is_admin or is_instructor):
                raise PermissionDenied("Only an admin or the session's instructor may regenerate a report.")

        student = booking.student
        goal_obj = getattr(student, "goal", None)
        context = SessionReportContext(
            topic_title=booking.topic_title,
            instructor_name=booking.instructor_name,
            duration_minutes=booking.duration_minutes,
            goal=getattr(goal_obj, "label", None) or getattr(goal_obj, "code", None),
            level=student.level or None,
            transcript_lines=_transcript_lines(session),  # read-only
            teacher_notes=report.instructor_note,
        )

        generated = self.reports_provider.generate(context=context)
        content = generated.content

        report.content = content.to_camel_dict()  # validated 11 fields only
        report.provider_name = generated.provider_name  # server-side meta (not serialized)
        report.fallback_used = generated.fallback_used
        report.overall_score = content.confidence_score  # satisfies chk_ready_report_complete
        report.status = AIReportStatus.READY
        report.generated_at = timezone.now()
        report.save()

        # Congratulate the student and surface strengths + what to work on. The
        # in-app notification shows immediately; the same Notification is emailed by
        # the notifications post_save signal when NOTIFICATION_EMAILS_ENABLED is on.
        # Gated on `not regenerate` so a forced re-run doesn't re-notify/re-email.
        if not regenerate:
            from django.conf import settings

            from apps.common.enums import NotificationType
            from apps.notifications.models import Notification

            strengths = ", ".join(content.strengths[:2]) if content.strengths else ""
            weaknesses = ", ".join(content.weaknesses[:2]) if content.weaknesses else ""
            link = settings.FRONTEND_URL.rstrip("/") + f"/student/report/{report.id}"
            body = (
                f'Great work in "{booking.topic_title}"! Your confidence score is '
                f"{content.confidence_score}/100. "
                + (f"Strengths: {strengths}. " if strengths else "")
                + (f"To work on: {weaknesses}. " if weaknesses else "")
                + (f"Next focus: {content.next_lesson_focus} " if content.next_lesson_focus else "")
                + f"See your full report: {link}"
            )
            Notification.objects.create(
                user=booking.student.user,
                type=NotificationType.REPORT_READY,
                title="🎉 Great work! Your session report is ready",
                body=body,
                data={"report_id": str(report.id), "session_id": str(session.id)},
            )

        self.events.publish(
            domain_events.AIReportGenerated(report_id=str(report.id), session_id=str(session.id))
        )
        return self._result(report)

    @staticmethod
    def _result(report) -> AIReportResult:
        return AIReportResult(
            report_id=str(report.id),
            session_id=str(report.session_id),
            status=report.status,
            overall_score=report.overall_score,
        )


class GenerateSessionReportUseCase:
    def __init__(self, *, sessions=None, ai=None, events=None):
        self.sessions = sessions or default_session_repository()
        self.ai = ai or default_ai_provider()
        self.events = events or default_event_bus()

    @transaction.atomic
    def execute(self, *, actor, session_id, transcript=None) -> AIReportResult:
        session = self.sessions.get(session_id)
        ensure_session_participant(actor, session)

        if not session_rules.is_completed(session.status):
            raise InvalidStateTransition("Session must be completed before report generation.")

        report = AIReport.objects.filter(session=session).first()
        if report is not None and report.status == AIReportStatus.READY:
            raise AIReportAlreadyGenerated()

        if transcript is None:
            existing = SessionTranscript.objects.filter(session=session).first()
            transcript = existing.content if existing else []

        data = self.ai.analyze_session(transcript=transcript)
        booking = session.booking
        if report is None:
            report = AIReport(
                session=session,
                booking=booking,
                student=booking.student,
                topic_title=booking.topic_title,
                instructor_name=booking.instructor_name,
                session_date=booking.scheduled_at,
                duration_minutes=booking.duration_minutes,
            )
        report.overall_score = data["overall_score"]
        report.skills = data["skills"]
        report.mistakes = data["mistakes"]
        report.recommendations = data["recommendations"]
        report.status = AIReportStatus.READY
        report.generated_at = timezone.now()
        report.save()

        # Tell the student their report is ready (Scenario 12 / 5).
        from apps.notifications.models import Notification
        from apps.common.enums import NotificationType

        Notification.objects.create(
            user=booking.student.user,
            type=NotificationType.REPORT_READY,
            title="Your session report is ready",
            body=f"{booking.topic_title} — overall score {report.overall_score}.",
            data={"report_id": str(report.id), "session_id": str(session.id)},
        )

        self.events.publish(
            domain_events.AIReportGenerated(
                report_id=str(report.id), session_id=str(session.id)
            )
        )
        return AIReportResult(
            report_id=str(report.id),
            session_id=str(session.id),
            status=report.status,
            overall_score=report.overall_score,
        )
