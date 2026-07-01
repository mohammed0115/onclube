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
from infrastructure.container import (
    default_ai_provider,
    default_event_bus,
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
