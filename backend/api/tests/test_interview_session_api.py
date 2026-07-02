"""
Interview-session API + use-case tests (Sprint 2.5).

Covers the isolated interview lifecycle: state transitions, per-answer capture,
answer source (voice/manual), transcript locking, manual fallback, resume, and
that the session carries NO assessment fields.
"""
import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.common.factories import make_student
from apps.placement.models import InterviewSession, InterviewStatus, PlacementSpokenAnswer

pytestmark = pytest.mark.django_db


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _spoken_ids(client):
    """Seed the fixed questions and return the ordered spoken question ids."""
    call_command("seed_placement")
    body = client.get("/api/v1/placement/interview/").data
    return [s["questionId"] for s in body["steps"]]


def _start_attempt(client):
    return client.post("/api/v1/placement/start/").data["id"]


def _answer(client, qid, text, source):
    return client.post(
        "/api/v1/placement/interview/answer/",
        {"questionId": qid, "transcriptText": text, "source": source},
        format="json",
    )


# ── lifecycle / state transitions ─────────────────────────────────────────────
def test_session_starts_created_then_runs_then_finalizes():
    client = client_for(make_student().user)
    ids = _spoken_ids(client)
    _start_attempt(client)

    session = client.get("/api/v1/placement/interview/session/")
    assert session.status_code == 200
    assert session.data["status"] == "created"
    assert session.data["currentQuestionIndex"] == 0
    assert session.data["answers"] == []

    # Answering moves it to running and advances the resume point.
    r = _answer(client, ids[0], "My name is Sam", "voice")
    assert r.status_code == 200
    assert r.data["status"] == "running"
    assert r.data["currentQuestionIndex"] == 1
    assert r.data["startedAt"] is not None

    for i in range(1, len(ids)):
        _answer(client, ids[i], f"Answer {i}", "manual")

    final = client.post("/api/v1/placement/interview/finalize/")
    assert final.status_code == 200
    assert final.data["status"] == "finalized"
    assert final.data["finishedAt"] is not None
    assert len(final.data["answers"]) == len(ids)


def test_finalize_requires_all_questions_answered():
    client = client_for(make_student().user)
    ids = _spoken_ids(client)
    _start_attempt(client)
    _answer(client, ids[0], "only one", "voice")

    resp = client.post("/api/v1/placement/interview/finalize/")
    assert resp.status_code == 409
    assert resp.data["code"] == "interview_incomplete"


# ── answer source + transcript lock ───────────────────────────────────────────
def test_voice_answer_records_source_and_is_locked():
    client = client_for(make_student().user)
    ids = _spoken_ids(client)
    _start_attempt(client)

    ok = _answer(client, ids[0], "spoken answer", "voice")
    assert ok.status_code == 200
    stored = ok.data["answers"][0]
    assert stored["source"] == "voice"
    assert stored["transcriptText"] == "spoken answer"

    # A voice transcript is locked — a later edit is rejected.
    locked = _answer(client, ids[0], "edited", "voice")
    assert locked.status_code == 409
    assert locked.data["code"] == "transcript_locked"

    # And the stored transcript is unchanged.
    row = PlacementSpokenAnswer.objects.get(question_id=ids[0])
    assert row.transcript_text == "spoken answer" and row.source == "voice"


def test_manual_fallback_is_editable_and_records_source():
    client = client_for(make_student().user)
    ids = _spoken_ids(client)
    _start_attempt(client)

    first = _answer(client, ids[0], "typed draft", "manual")
    assert first.status_code == 200
    assert first.data["answers"][0]["source"] == "manual"

    # Manual answers may be re-typed (not locked).
    second = _answer(client, ids[0], "typed final", "manual")
    assert second.status_code == 200
    row = PlacementSpokenAnswer.objects.get(question_id=ids[0])
    assert row.transcript_text == "typed final" and row.source == "manual"


def test_source_defaults_to_manual_when_omitted():
    client = client_for(make_student().user)
    ids = _spoken_ids(client)
    _start_attempt(client)
    resp = client.post(
        "/api/v1/placement/interview/answer/",
        {"questionId": ids[0], "transcriptText": "text"},  # no source
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["answers"][0]["source"] == "manual"


def test_invalid_source_is_rejected():
    client = client_for(make_student().user)
    ids = _spoken_ids(client)
    _start_attempt(client)
    resp = _answer(client, ids[0], "text", "bogus")
    assert resp.status_code == 400
    assert resp.data["code"] == "validation_error"


def test_answer_rejects_unknown_question():
    client = client_for(make_student().user)
    _spoken_ids(client)
    _start_attempt(client)
    resp = _answer(client, "11111111-1111-1111-1111-111111111111", "x", "voice")
    assert resp.status_code == 422
    assert resp.data["code"] == "invalid_placement_question"


# ── resume ────────────────────────────────────────────────────────────────────
def test_resume_returns_captured_answers_and_resume_point():
    client = client_for(make_student().user)
    ids = _spoken_ids(client)
    _start_attempt(client)
    _answer(client, ids[0], "first answer", "voice")
    _answer(client, ids[1], "second answer", "manual")

    # Simulate a refresh: a fresh GET returns progress + prior answers.
    resumed = client.get("/api/v1/placement/interview/session/")
    assert resumed.data["status"] == "running"
    assert resumed.data["currentQuestionIndex"] == 2  # resume at question 3
    answers = resumed.data["answers"]
    assert [a["transcriptText"] for a in answers] == ["first answer", "second answer"]
    assert [a["source"] for a in answers] == ["voice", "manual"]


# ── security / isolation ──────────────────────────────────────────────────────
def test_interview_endpoints_require_authentication():
    assert APIClient().get("/api/v1/placement/interview/session/").status_code == 401
    assert APIClient().post("/api/v1/placement/interview/answer/", {}, format="json").status_code == 401
    assert APIClient().post("/api/v1/placement/interview/finalize/").status_code == 401


def test_session_never_carries_assessment_fields():
    client = client_for(make_student().user)
    ids = _spoken_ids(client)
    _start_attempt(client)
    _answer(client, ids[0], "answer", "voice")
    body = client.get("/api/v1/placement/interview/session/").data
    flat = str(body).lower()
    for banned in ("cefr", "score", "grammar", "vocabulary", "confidence", "recommend", "pronunciation", "level"):
        assert banned not in flat


def test_interview_session_model_has_no_assessment_fields():
    names = {f.name for f in InterviewSession._meta.get_fields()}
    for banned in ("cefr", "score", "grammar", "vocabulary", "confidence", "recommendation", "level"):
        assert not any(banned in n for n in names)
    # Sanity: it owns the lifecycle fields it should.
    assert {"status", "current_question_index", "started_at", "finished_at"} <= names
    assert InterviewStatus.FINALIZED == "finalized"
