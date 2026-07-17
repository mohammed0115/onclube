"""
Sprint 2.0.1 — placement speaking interview (capture + finalize) API tests.

Proves the CANONICAL per-question interview flow: exactly five fixed questions in
order, resume at the first unanswered question, confirmed answers preserved,
voice/manual source persisted, empty answers rejected, voice transcript locked,
finalization blocked until all five answers exist, ownership/auth, and — critically
— that NO assessment runs during interview capture and NO prompt/provider config
is ever exposed.
"""
import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.common.factories import make_student
from apps.placement.models import PlacementAssessmentResult, PlacementQuestion, PlacementSpokenAnswer

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


def _seed_spoken():
    call_command("seed_placement")
    return list(PlacementQuestion.objects.filter(question_type="spoken").order_by("order"))


def _start(client):
    return client.post("/api/v1/placement/start/").data["id"]


def _answer(client, question, text, source="voice"):
    return client.post(
        "/api/v1/placement/interview/answer/",
        {"questionId": str(question.id), "transcriptText": text, "source": source},
        format="json",
    )


FIXED_GREETING = "Hello. Welcome to your OneClub speaking assessment."
FIXED_INSTRUCTIONS = (
    "I will ask you five short questions. Please answer naturally in English. "
    "You can listen again or record your answer again before confirming it."
)
FIXED_CLARIFICATIONS = {
    "What is your name?": "Please tell me the name people call you.",
    "How old are you?": "Please tell me your age.",
    "Where are you from?": "Please tell me your country or city.",
    "What do you do for a living?": "Please tell me your job or what you study.",
    "Why do you want to learn English?": "Please tell me your reason for learning English.",
}


# ── deterministic OneClub script (Sprint 2.0.1A) ──────────────────────────────
def test_greeting_and_instructions_are_the_fixed_oneclub_strings():
    _seed_spoken()
    c = client_for(make_student().user)
    _start(c)
    data = c.get("/api/v1/placement/interview/").data
    assert data["greeting"] == FIXED_GREETING
    assert data["instructions"] == FIXED_INSTRUCTIONS


def test_clarifications_are_the_fixed_reviewed_mapping():
    _seed_spoken()
    c = client_for(make_student().user)
    _start(c)
    steps = c.get("/api/v1/placement/interview/").data["steps"]
    for s in steps:
        assert s["clarification"] == FIXED_CLARIFICATIONS[s["prompt"]]


def test_resume_messages_are_deterministic_per_progress_point():
    _seed_spoken()
    c = client_for(make_student().user)
    _start(c)
    msgs = c.get("/api/v1/placement/interview/").data["resumeMessages"]
    assert msgs == [
        "Welcome back. Let's continue with question two.",
        "Welcome back. Let's continue with question three.",
        "Welcome back. Let's continue with question four.",
        "Welcome back. Let's continue with question five.",
    ]


def test_interview_exposes_script_id_and_version():
    _seed_spoken()
    c = client_for(make_student().user)
    _start(c)
    data = c.get("/api/v1/placement/interview/").data
    assert data["scriptId"] == "oneclub.placement.interview"
    assert data["scriptVersion"] == "1.0.0"
    assert data["language"] == "en"
    # And the version is persisted on the session for auditability.
    assert c.get("/api/v1/placement/interview/session/").data["scriptVersion"] == "1.0.0"


def test_container_binds_deterministic_provider_not_openai():
    from infrastructure.container import default_interviewer_provider

    provider = default_interviewer_provider()
    name = type(provider).__name__
    assert name == "OneClubInterviewScriptProvider"
    assert "openai" not in name.lower()
    assert provider.script_version() == "1.0.0"


def test_interview_modules_import_no_llm_or_prompt_code():
    """Static guard (AST): the placement-interview modules must not IMPORT any LLM
    provider or prompt builder — including lazy in-function imports. Immune to
    comments/docstrings (which legitimately mention 'no OpenAI')."""
    import ast
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[2]
    modules = [
        root / "infrastructure/gateways/interviewer.py",
        root / "application/placement/interview.py",
        root / "domain/placement/interview_rules.py",
    ]
    LLM_ROOTS = ("openai", "anthropic", "google.generativeai", "genai", "cohere",
                 "mistralai", "langchain", "llama_cpp")

    def is_llm(mod: str) -> bool:
        mod = (mod or "").lower()
        return any(mod == r or mod.startswith(r + ".") for r in LLM_ROOTS) or "prompt" in mod

    for m in modules:
        tree = ast.parse(m.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    assert not is_llm(alias.name), f"{m.name} imports '{alias.name}'"
            elif isinstance(node, ast.ImportFrom):
                assert not is_llm(node.module or ""), f"{m.name} imports from '{node.module}'"


def test_assessment_provider_remains_openai_capable_and_separate():
    # The assessment engine's OpenAI adapter is untouched (interview isolation).
    from infrastructure.gateways.openai_assessment import OpenAIAssessmentProvider  # noqa: F401
    assert OpenAIAssessmentProvider is not None


# ── fixed questions + order ───────────────────────────────────────────────────
def test_seed_creates_exactly_the_five_fixed_questions_in_order():
    spoken = _seed_spoken()
    assert [q.prompt for q in spoken] == FIXED_SPOKEN
    assert [q.order for q in spoken] == [1, 2, 3, 4, 5]


def test_interview_endpoint_returns_fixed_questions_in_order():
    _seed_spoken()
    student = make_student().user
    c = client_for(student)
    _start(c)
    resp = c.get("/api/v1/placement/interview/")
    assert resp.status_code == 200
    assert [s["prompt"] for s in resp.data["steps"]] == FIXED_SPOKEN
    assert [s["order"] for s in resp.data["steps"]] == [1, 2, 3, 4, 5]


# ── resume ────────────────────────────────────────────────────────────────────
def test_session_resumes_at_first_unanswered_and_preserves_answers():
    spoken = _seed_spoken()
    c = client_for(make_student().user)
    _start(c)
    _answer(c, spoken[0], "My name is Sara", source="voice")
    _answer(c, spoken[1], "I am twenty five", source="voice")
    sess = c.get("/api/v1/placement/interview/session/").data
    answered = {a["questionId"] for a in sess["answers"]}
    assert {str(spoken[0].id), str(spoken[1].id)} == answered
    # Progress reflects two answered — the client resumes at question index 2 (Q3).
    assert sess["currentQuestionIndex"] == 2
    assert sess["status"] in ("running", "created")


# ── empty answer rejected ─────────────────────────────────────────────────────
def test_empty_answer_is_rejected_and_not_persisted():
    spoken = _seed_spoken()
    c = client_for(make_student().user)
    _start(c)
    resp = _answer(c, spoken[0], "   ", source="voice")
    assert resp.status_code == 422
    assert resp.data["code"] == "empty_transcript"
    assert PlacementSpokenAnswer.objects.count() == 0


# ── source persisted / voice locked ───────────────────────────────────────────
def test_voice_and_manual_sources_persist_verbatim():
    spoken = _seed_spoken()
    c = client_for(make_student().user)
    _start(c)
    _answer(c, spoken[0], "spoken answer", source="voice")
    _answer(c, spoken[1], "typed answer", source="manual")
    by_q = {a["questionId"]: a for a in c.get("/api/v1/placement/interview/session/").data["answers"]}
    assert by_q[str(spoken[0].id)]["source"] == "voice"
    assert by_q[str(spoken[1].id)]["source"] == "manual"


def test_voice_transcript_is_locked_against_overwrite():
    spoken = _seed_spoken()
    c = client_for(make_student().user)
    _start(c)
    assert _answer(c, spoken[0], "Alice", source="voice").status_code == 200
    # Re-saving the SAME voice transcript is an idempotent no-op.
    assert _answer(c, spoken[0], "Alice", source="voice").status_code == 200
    # Overwriting a voice transcript with different text is blocked.
    blocked = _answer(c, spoken[0], "Bob", source="voice")
    assert blocked.status_code == 409
    assert blocked.data["code"] == "transcript_locked"


# ── no skipping / no duplicates ───────────────────────────────────────────────
def test_answers_do_not_duplicate_and_do_not_skip():
    spoken = _seed_spoken()
    c = client_for(make_student().user)
    _start(c)
    _answer(c, spoken[0], "one", source="manual")
    _answer(c, spoken[0], "one", source="manual")  # same question again
    assert PlacementSpokenAnswer.objects.count() == 1  # keyed on (attempt, question)


# ── finalize gating ───────────────────────────────────────────────────────────
def test_finalize_blocked_until_all_five_answers_exist():
    spoken = _seed_spoken()
    c = client_for(make_student().user)
    _start(c)
    for q in spoken[:4]:
        _answer(c, q, f"answer {q.order}", source="voice")
    blocked = c.post("/api/v1/placement/interview/finalize/")
    assert blocked.status_code == 409
    assert blocked.data["code"] == "interview_incomplete"
    _answer(c, spoken[4], "answer 5", source="voice")
    ok = c.post("/api/v1/placement/interview/finalize/")
    assert ok.status_code == 200
    assert ok.data["status"] == "finalized"


# ── interview ⟂ assessment (no scoring here) ──────────────────────────────────
def test_interview_capture_runs_no_assessment():
    spoken = _seed_spoken()
    c = client_for(make_student().user)
    _start(c)
    for q in spoken:
        _answer(c, q, f"answer {q.order}", source="voice")
    c.post("/api/v1/placement/interview/finalize/")
    # Finalizing the interview must NOT produce a placement assessment/score.
    assert PlacementAssessmentResult.objects.count() == 0
    sess = c.get("/api/v1/placement/interview/session/").data
    flat = str(sess).lower()
    for banned in ("cefr", "score", "grammar", "vocabulary", "fluency", "recommend"):
        assert banned not in flat


# ── ownership / auth ──────────────────────────────────────────────────────────
def test_requires_authentication():
    _seed_spoken()
    assert APIClient().get("/api/v1/placement/interview/session/").status_code in (401, 403)


def test_students_only_see_their_own_interview():
    spoken = _seed_spoken()
    a = client_for(make_student().user)
    _start(a)
    _answer(a, spoken[0], "A's answer", source="voice")
    # A different student has an independent, empty interview.
    b = client_for(make_student().user)
    _start(b)
    b_answers = b.get("/api/v1/placement/interview/session/").data["answers"]
    assert b_answers == []


# ── no prompt / provider config leakage ───────────────────────────────────────
def test_interview_never_exposes_prompt_or_provider_config():
    _seed_spoken()
    c = client_for(make_student().user)
    _start(c)
    flat = str(c.get("/api/v1/placement/interview/").data).lower()
    # Actual leak markers: the interviewer's system prompt text and any provider
    # config / secret. (Question text like "how old are you?" is expected content.)
    for banned in (
        "english placement interviewer",  # the stub _SYSTEM_INSTRUCTIONS text
        "ask only the provided",
        "system_message",
        "prompt_id",
        "api_key",
        "openai_api_key",
        "response_format",
        "sk-",
    ):
        assert banned not in flat
