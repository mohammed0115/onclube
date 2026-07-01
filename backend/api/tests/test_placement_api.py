"""
Phase 8E — placement thin DRF API tests.

Proves routing + actor passing + DTO-only camelCase output, no answer key, no
pronunciation, one-shot spoken enforcement, ownership/role enforcement, and the
global domain-exception → HTTP mapping. No AI, no STT, no audio.
"""
import pytest
from rest_framework.test import APIClient

from apps.common.factories import make_admin, make_student
from apps.placement.models import PlacementQuestion

pytestmark = pytest.mark.django_db

GOOD_WRITTEN = "I work as an engineer and I really enjoy solving difficult problems every day."
GOOD_SPOKEN = "I am learning English because I want to talk with my colleagues and travel abroad."


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _questions(n_written=1, n_spoken=1):
    w = [PlacementQuestion.objects.create(question_type="written", prompt=f"W{i}", order=i,
                                          correct_index=0, correct_answer="x", options=["x", "y"])
         for i in range(1, n_written + 1)]
    s = [PlacementQuestion.objects.create(question_type="spoken", prompt=f"S{i}", order=i)
         for i in range(1, n_spoken + 1)]
    return w, s


def _run_full(client, w, s, written=GOOD_WRITTEN, spoken=GOOD_SPOKEN):
    start = client.post("/api/v1/placement/start/")
    attempt_id = start.data["id"]
    client.post("/api/v1/placement/written-answers/", {
        "attemptId": attempt_id,
        "answers": [{"questionId": str(q.id), "answerText": written} for q in w],
    }, format="json")
    client.post("/api/v1/placement/spoken-transcripts/", {
        "attemptId": attempt_id,
        "transcripts": [{"questionId": str(q.id), "transcriptText": spoken} for q in s],
    }, format="json")
    return client.post("/api/v1/placement/submit/")


# ── 1 test endpoint hides answer keys ─────────────────────────────────────────
def test_test_endpoint_hides_correct_answer_and_index():
    _questions(2, 2)
    resp = client_for(make_student().user).get("/api/v1/placement/test/")
    assert resp.status_code == 200
    assert len(resp.data["written"]) == 2 and len(resp.data["spoken"]) == 2
    flat = str(resp.data).lower()
    for banned in ("correct", "options", "scoring_rubric", "pronunciation"):
        assert banned not in flat
    item = resp.data["written"][0]
    assert set(item.keys()) == {"id", "type", "prompt", "skill", "cefrBand", "order"}


# ── 2 start creates / reuses ──────────────────────────────────────────────────
def test_start_creates_then_reuses_attempt():
    client = client_for(make_student().user)
    a1 = client.post("/api/v1/placement/start/")
    assert a1.status_code == 201 and a1.data["status"] == "in_progress"
    a2 = client.post("/api/v1/placement/start/")
    assert a2.data["id"] == a1.data["id"]


# ── 3 written answers save through API ────────────────────────────────────────
def test_written_answers_save_through_api():
    w, _ = _questions(1, 0)
    client = client_for(make_student().user)
    attempt_id = client.post("/api/v1/placement/start/").data["id"]
    resp = client.post("/api/v1/placement/written-answers/", {
        "attemptId": attempt_id,
        "answers": [{"questionId": str(w[0].id), "answerText": "hello"}],
    }, format="json")
    assert resp.status_code == 200
    status = client.get("/api/v1/placement/status/")
    assert status.data["writtenComplete"] is True


# ── 4 spoken one-shot through API ─────────────────────────────────────────────
def test_spoken_one_shot_enforced_through_api():
    w, s = _questions(1, 1)
    client = client_for(make_student().user)
    _run_full(client, w, s)                          # attempt A used spoken + assessed
    b = client.post("/api/v1/placement/start/").data["id"]  # attempt B
    resp = client.post("/api/v1/placement/spoken-transcripts/", {
        "attemptId": b,
        "transcripts": [{"questionId": str(s[0].id), "transcriptText": "again"}],
    }, format="json")
    assert resp.status_code == 409
    assert resp.data["code"] == "spoken_attempt_used"


# ── 5 submit incomplete ───────────────────────────────────────────────────────
def test_submit_incomplete_returns_placement_incomplete():
    w, s = _questions(1, 1)
    client = client_for(make_student().user)
    attempt_id = client.post("/api/v1/placement/start/").data["id"]
    client.post("/api/v1/placement/written-answers/", {
        "attemptId": attempt_id,
        "answers": [{"questionId": str(w[0].id), "answerText": GOOD_WRITTEN}],
    }, format="json")  # no spoken
    resp = client.post("/api/v1/placement/submit/")
    assert resp.status_code == 409
    assert resp.data["code"] == "placement_incomplete"


# ── 6 submit complete returns deterministic CEFR ──────────────────────────────
def test_submit_complete_returns_cefr_result():
    w, s = _questions(1, 1)
    resp = _run_full(client_for(make_student().user), w, s)
    assert resp.status_code == 200
    d = resp.data
    assert d["cefrLevel"] in ("A1", "A2", "B1", "B2", "C1")
    for field in ("overallConversationScore", "grammarScore", "vocabularyScore",
                  "fluencyScore", "confidenceScore", "writtenScore", "spokenScore",
                  "strengths", "weaknesses", "recommendedFocus",
                  "recommendedConversationTopics", "recommendedInstructorDifficulty",
                  "fallbackUsed", "providerName"):
        assert field in d
    assert d["providerName"] == "heuristic" and d["fallbackUsed"] is True


# ── 7 result endpoint returns own result ──────────────────────────────────────
def test_result_endpoint_returns_current_students_result():
    w, s = _questions(1, 1)
    client = client_for(make_student().user)
    submitted = _run_full(client, w, s)
    resp = client.get("/api/v1/placement/result/")
    assert resp.status_code == 200
    assert resp.data["cefrLevel"] == submitted.data["cefrLevel"]


# ── 8 cannot access another student's result ──────────────────────────────────
def test_student_cannot_access_another_students_result():
    w, s = _questions(1, 1)
    _run_full(client_for(make_student().user), w, s)  # someone else has a result
    resp = client_for(make_student().user).get("/api/v1/placement/result/")  # fresh student
    assert resp.status_code == 404
    assert resp.data["code"] == "placement_result_not_found"


# ── 9 non-admin cannot reset ──────────────────────────────────────────────────
def test_non_admin_cannot_reset_spoken():
    w, s = _questions(1, 1)
    student = make_student()
    _run_full(client_for(student.user), w, s)
    resp = client_for(student.user).post(
        f"/api/v1/admin/placement/{student.id}/reset-spoken/", {"reason": "let me retry"}, format="json"
    )
    assert resp.status_code == 403
    assert resp.data["code"] == "permission_denied"


# ── 10 admin reset works + requires reason ────────────────────────────────────
def test_admin_reset_requires_reason():
    w, s = _questions(1, 1)
    student = make_student()
    _run_full(client_for(student.user), w, s)
    resp = client_for(make_admin()).post(
        f"/api/v1/admin/placement/{student.id}/reset-spoken/", {"reason": "   "}, format="json"
    )
    assert resp.status_code == 422  # blank reason → domain_error


def test_admin_reset_works_and_reopens_spoken():
    w, s = _questions(1, 1)
    student = make_student()
    _run_full(client_for(student.user), w, s)
    resp = client_for(make_admin()).post(
        f"/api/v1/admin/placement/{student.id}/reset-spoken/", {"reason": "connection dropped"}, format="json"
    )
    assert resp.status_code == 200
    assert resp.data["reason"] == "connection dropped"
    assert resp.data["studentId"] == str(student.id)

    # student may now save spoken again on a new attempt
    client = client_for(student.user)
    new_attempt = client.post("/api/v1/placement/start/").data["id"]
    again = client.post("/api/v1/placement/spoken-transcripts/", {
        "attemptId": new_attempt,
        "transcripts": [{"questionId": str(s[0].id), "transcriptText": GOOD_SPOKEN}],
    }, format="json")
    assert again.status_code == 200


# ── 11 no pronunciation fields anywhere ───────────────────────────────────────
def test_no_pronunciation_fields_anywhere():
    w, s = _questions(1, 1)
    client = client_for(make_student().user)
    submit = _run_full(client, w, s)
    bodies = [
        client.get("/api/v1/placement/test/").data,
        client.get("/api/v1/placement/status/").data,
        client.get("/api/v1/placement/result/").data,
        submit.data,
    ]
    for body in bodies:
        assert "pronunciation" not in str(body).lower()


# ── 12 status endpoint shape ──────────────────────────────────────────────────
def test_status_endpoint_shape_and_transitions():
    w, s = _questions(1, 1)
    client = client_for(make_student().user)
    before = client.get("/api/v1/placement/status/")
    assert before.data["status"] == "not_started" and before.data["canSubmit"] is False
    _run_full(client, w, s)
    after = client.get("/api/v1/placement/status/")
    assert set(after.data.keys()) == {
        "status", "attemptId", "writtenComplete", "spokenComplete", "assessed", "canSubmit"
    }
    assert after.data["status"] == "assessed" and after.data["assessed"] is True


# ── 13 global exception mapping (unknown question → 422) ───────────────────────
def test_invalid_question_maps_to_422():
    _questions(1, 1)
    client = client_for(make_student().user)
    attempt_id = client.post("/api/v1/placement/start/").data["id"]
    resp = client.post("/api/v1/placement/written-answers/", {
        "attemptId": attempt_id,
        "answers": [{"questionId": "11111111-1111-1111-1111-111111111111", "answerText": "x"}],
    }, format="json")
    assert resp.status_code == 422
    assert resp.data["code"] == "invalid_placement_question"


def test_endpoints_require_authentication():
    assert APIClient().get("/api/v1/placement/test/").status_code == 401
