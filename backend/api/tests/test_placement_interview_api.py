"""
Speaking-interview API + use-case tests (Sprint 2).

Covers: fixed question set & order, interviewer script shape, no prompt/answer-key
leakage, authentication, provider abstraction, and that the interview is
independent of the assessment engine (no scoring fields).
"""
import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.common.factories import make_student
from application.placement.interview import GetSpeakingInterviewUseCase
from infrastructure.gateways.interviewer import _SYSTEM_INSTRUCTIONS

pytestmark = pytest.mark.django_db

FIXED_SPOKEN = [
    "What is your name?",
    "How old are you?",
    "Where are you from?",
    "What do you do for a living?",
    "Why do you want to learn English?",
]


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_interview_returns_the_five_fixed_questions_in_order():
    call_command("seed_placement")
    resp = client_for(make_student().user).get("/api/v1/placement/interview/")
    assert resp.status_code == 200
    steps = resp.data["steps"]
    assert [s["prompt"] for s in steps] == FIXED_SPOKEN
    assert [s["order"] for s in steps] == [1, 2, 3, 4, 5]


def test_interview_has_greeting_instructions_and_closing():
    call_command("seed_placement")
    data = client_for(make_student().user).get("/api/v1/placement/interview/").data
    assert data["greeting"] and data["instructions"] and data["closing"] and data["encouragement"]
    # Each step carries a preamble + a meaning-preserving clarification.
    for step in data["steps"]:
        assert step["preamble"]
        assert step["clarification"]


def test_interview_never_leaks_prompt_or_scoring_fields():
    call_command("seed_placement")
    data = client_for(make_student().user).get("/api/v1/placement/interview/").data
    flat = str(data).lower()
    # The server-only system prompt must never appear in the payload.
    assert "you are an english placement interviewer" not in flat
    assert _SYSTEM_INSTRUCTIONS.lower() not in flat
    # No assessment leakage — the interviewer does not score.
    for banned in ("cefr", "score", "correct", "grammar_score", "pronunciation", "recommend"):
        assert banned not in flat


def test_interview_requires_authentication():
    assert APIClient().get("/api/v1/placement/interview/").status_code == 401


def test_interview_uses_the_injected_interviewer_and_fixed_questions():
    # Provider abstraction: a fake interviewer is honoured; questions still come
    # from the fixed repository (the provider cannot invent or reorder them).
    call_command("seed_placement")
    student = make_student()

    class FakeInterviewer:
        def greeting(self):
            return "FAKE-GREETING"

        def instructions(self):
            return "FAKE-INSTRUCTIONS"

        def preamble(self, *, order, total):
            return f"FAKE-PREAMBLE-{order}/{total}"

        def clarification(self, *, prompt):
            return f"FAKE-CLARIFY::{prompt}"

        def encouragement(self):
            return "FAKE-ENCOURAGE"

        def closing(self):
            return "FAKE-CLOSING"

    dto = GetSpeakingInterviewUseCase(interviewer=FakeInterviewer()).execute(actor=student.user)
    assert dto.greeting == "FAKE-GREETING"
    assert [s.prompt for s in dto.steps] == FIXED_SPOKEN  # questions unchanged
    assert dto.steps[0].preamble == "FAKE-PREAMBLE-1/5"
    # Clarification preserves the question meaning (wraps the exact prompt).
    assert dto.steps[0].clarification.endswith(FIXED_SPOKEN[0])


def test_seed_creates_the_five_fixed_spoken_questions():
    from apps.placement.models import PlacementQuestion

    call_command("seed_placement")
    spoken = list(PlacementQuestion.objects.filter(question_type="spoken").order_by("order"))
    assert [q.prompt for q in spoken] == FIXED_SPOKEN
    # Spoken interview questions carry no answer key.
    for q in spoken:
        assert q.options == [] and q.correct_answer == ""
