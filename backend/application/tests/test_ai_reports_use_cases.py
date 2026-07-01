"""Use-case tests — AI reports (provider seam, draft questions)."""
import pytest

from apps.common.enums import AIReportStatus, SessionStatus
from apps.common.factories import make_booking, make_instructor, make_session, make_topic
from apps.scheduling.models import Question
from application.ai_reports.use_cases import (
    GenerateDiscussionQuestionsUseCase,
    GenerateSessionReportUseCase,
)
from application.ports.gateways import AIProvider
from infrastructure.container import default_ai_provider

pytestmark = pytest.mark.django_db


class SpyAIProvider(AIProvider):
    """Records calls; returns deterministic offline data. Definitely not OpenAI."""

    def __init__(self):
        self.calls = []

    def score_placement(self, *, answers):
        self.calls.append("score_placement")
        return {"level": "B1", "level_label": "Intermediate", "summary": "", "skills": []}

    def suggest_subtopics(self, *, topic_title, topic_description):
        self.calls.append("suggest_subtopics")
        return ["a", "b"]

    def generate_questions(self, *, topic_title, topic_description):
        self.calls.append("generate_questions")
        return ["Draft question 1?", "Draft question 2?"]

    def analyze_session(self, *, transcript):
        self.calls.append("analyze_session")
        return {
            "overall_score": 88,
            "skills": [{"label": "Fluency", "value": 80, "color": "#10B981"}],
            "mistakes": [],
            "recommendations": ["Keep practising."],
        }


def test_ai_generated_questions_are_unapproved_by_default():
    instructor = make_instructor()
    topic = make_topic(instructor, with_approved_question=False, with_unapproved_question=False)

    result = GenerateDiscussionQuestionsUseCase(ai=SpyAIProvider()).execute(
        actor=instructor.user, topic_id=topic.id
    )

    assert len(result.created_ids) == 2
    created = Question.objects.filter(id__in=result.created_ids)
    assert created.count() == 2
    assert all(q.approved is False for q in created)
    assert all(q.ai_assisted is True for q in created)


def test_generate_session_report_use_case_does_not_call_real_openai():
    # The default (production) AI provider is itself a stub — no OpenAI wired.
    assert default_ai_provider().provider_name == "stub"

    booking = make_booking()
    session = make_session(
        booking, status=SessionStatus.COMPLETED, agora_channel="chan-1"
    )
    actor = booking.student.user

    spy = SpyAIProvider()
    result = GenerateSessionReportUseCase(ai=spy).execute(
        actor=actor,
        session_id=session.id,
        transcript=[{"speaker": "student", "text": "hello", "ts": 0}],
    )

    # Report was produced via the injected provider seam, not a real OpenAI call.
    assert "analyze_session" in spy.calls
    assert result.status == AIReportStatus.READY
    assert result.overall_score == 88
