"""
AI Session Report use case — Sprint 9 (completed-only, idempotency / generate-once,
admin-only regeneration, transcript read-only).
"""
import pytest

from apps.common.enums import AIReportStatus, SessionStatus, TranscriptSource
from apps.common.factories import make_admin, make_booking, make_session, make_student
from apps.sessions.models import SessionTranscript
from application.ai_reports.use_cases import GenerateAISessionReportUseCase
from domain.exceptions import InvalidStateTransition, PermissionDenied
from domain.session_report import (
    GeneratedSessionReport,
    HeuristicSessionReportProvider,
    SessionReportContent,
    SessionReportProvider,
)

pytestmark = pytest.mark.django_db


class SpyReportProvider(SessionReportProvider):
    """Counts generate() calls and returns a fixed valid report."""

    def __init__(self):
        self.calls = 0

    def generate(self, *, context):
        self.calls += 1
        content = SessionReportContent(
            overall_summary="spy summary",
            grammar_feedback="g",
            vocabulary_feedback="v",
            fluency_feedback="f",
            pronunciation_feedback="p",
            strengths=["s"],
            weaknesses=["w"],
            recommended_topics=["t"],
            homework=["h"],
            next_lesson_focus="focus",
            confidence_score=70,
        )
        return GeneratedSessionReport(content=content, provider_name="spy", fallback_used=False)


def _completed_session(with_transcript=True):
    booking = make_booking(days_ahead=0)
    session = make_session(booking, status=SessionStatus.COMPLETED, agora_channel="c1")
    if with_transcript:
        SessionTranscript.objects.create(
            session=session,
            content=[{"speaker": "student", "text": "I fixed a bug today.", "ts": 0}],
            source=TranscriptSource.MANUAL,
        )
    return booking, session


def test_report_requires_a_completed_session():
    booking = make_booking(days_ahead=0)
    session = make_session(booking, status=SessionStatus.SCHEDULED)
    with pytest.raises(InvalidStateTransition):
        GenerateAISessionReportUseCase(reports_provider=SpyReportProvider()).execute(
            actor=booking.student.user, session_id=session.id
        )


def test_generate_produces_the_11_field_content_and_marks_ready():
    booking, session = _completed_session()
    GenerateAISessionReportUseCase(reports_provider=HeuristicSessionReportProvider()).execute(
        actor=booking.student.user, session_id=session.id
    )
    report = session.report
    report.refresh_from_db()
    assert report.status == AIReportStatus.READY
    assert report.overall_score is not None and report.generated_at is not None
    assert {
        "overallSummary", "grammarFeedback", "vocabularyFeedback", "fluencyFeedback",
        "pronunciationFeedback", "strengths", "weaknesses", "recommendedTopics",
        "homework", "nextLessonFocus", "confidenceScore",
    }.issubset(report.content)
    # Per-skill numeric scores are persisted for the progress dashboard.
    assert {r["label"] for r in report.skills} >= {
        "Grammar", "Vocabulary", "Fluency", "Pronunciation", "Confidence",
    }
    assert all(0 <= r["value"] <= 100 for r in report.skills)
    # Server-side meta stored but NOT part of content.
    assert report.provider_name == "heuristic"
    assert "providerName" not in report.content and "prompt" not in report.content


def test_generate_is_idempotent_and_generates_once():
    booking, session = _completed_session()
    spy = SpyReportProvider()
    uc = GenerateAISessionReportUseCase(reports_provider=spy)
    r1 = uc.execute(actor=booking.student.user, session_id=session.id)
    r2 = uc.execute(actor=booking.student.user, session_id=session.id)  # no regeneration
    assert spy.calls == 1  # generated once
    assert r1.report_id == r2.report_id and r2.status == AIReportStatus.READY


def test_regeneration_requires_an_admin():
    booking, session = _completed_session()
    spy = SpyReportProvider()
    uc = GenerateAISessionReportUseCase(reports_provider=spy)
    uc.execute(actor=booking.student.user, session_id=session.id)  # first generation
    # A participant cannot regenerate.
    with pytest.raises(PermissionDenied):
        uc.execute(actor=booking.student.user, session_id=session.id, regenerate=True)
    assert spy.calls == 1
    # An admin can.
    uc.execute(actor=make_admin(), session_id=session.id, regenerate=True)
    assert spy.calls == 2


def test_generation_never_modifies_the_transcript():
    booking, session = _completed_session()
    before = SessionTranscript.objects.get(session=session).content
    GenerateAISessionReportUseCase(reports_provider=SpyReportProvider()).execute(
        actor=booking.student.user, session_id=session.id
    )
    after = SessionTranscript.objects.get(session=session).content
    assert after == before  # transcript is read-only


def test_wrong_student_cannot_generate():
    booking, session = _completed_session()
    with pytest.raises(PermissionDenied):
        GenerateAISessionReportUseCase(reports_provider=SpyReportProvider()).execute(
            actor=make_student().user, session_id=session.id
        )
