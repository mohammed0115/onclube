"""Phase 8D placement use-case tests (no AI/STT, no pronunciation)."""
import dataclasses
import pathlib

import pytest

from apps.common.factories import make_admin, make_student
from apps.placement.models import PlacementAssessmentResult, PlacementQuestion, PlacementResetAudit
from domain.exceptions import (
    InvalidPlacementQuestion,
    PermissionDenied,
    PlacementIncomplete,
    PlacementResultNotFound,
    SpokenAttemptAlreadyUsed,
)
from domain.placement import cefr
from domain.placement.dtos import PlacementAttemptStatusDTO, PlacementStoredResult
from application.placement.use_cases import (
    AdminResetSpokenAttemptUseCase,
    GetMyPlacementResultUseCase,
    GetPlacementAttemptStatusUseCase,
    ListPlacementQuestionsUseCase,
    SaveSpokenTranscriptsUseCase,
    SaveWrittenAnswersUseCase,
    StartPlacementAttemptUseCase,
    SubmitPlacementAttemptUseCase,
)

pytestmark = pytest.mark.django_db

GOOD_WRITTEN = "I work as an engineer and I really enjoy solving difficult problems every day."
GOOD_SPOKEN = "I am learning English because I want to talk with my colleagues and travel abroad."


def _questions(n_written=1, n_spoken=1):
    w = [PlacementQuestion.objects.create(question_type="written", prompt=f"W{i}", order=i)
         for i in range(1, n_written + 1)]
    s = [PlacementQuestion.objects.create(question_type="spoken", prompt=f"S{i}", order=i)
         for i in range(1, n_spoken + 1)]
    return w, s


def _run_full(user, w, s, written_text=GOOD_WRITTEN, spoken_text=GOOD_SPOKEN):
    StartPlacementAttemptUseCase().execute(actor=user)
    SaveWrittenAnswersUseCase().execute(
        actor=user, answers=[{"question_id": str(q.id), "answer_text": written_text} for q in w]
    )
    SaveSpokenTranscriptsUseCase().execute(
        actor=user, transcripts=[{"question_id": str(q.id), "transcript_text": spoken_text} for q in s]
    )
    return SubmitPlacementAttemptUseCase().execute(actor=user)


# ── 1 listing hides answer keys ───────────────────────────────────────────────
def test_listing_questions_hides_answer_keys():
    PlacementQuestion.objects.create(question_type="written", prompt="Pick", order=1, correct_index=0, options=["A", "B"])
    PlacementQuestion.objects.create(question_type="spoken", prompt="Tell me", order=1)
    student = make_student()
    test = ListPlacementQuestionsUseCase().execute(actor=student.user)
    assert test.written and test.spoken
    for item in test.written + test.spoken:
        keys = set(dataclasses.asdict(item).keys())
        # No answer key leaves the backend: no correct_* / scoring_rubric.
        assert not any("correct" in k for k in keys)
        assert "scoring_rubric" not in keys
    # The written MCQ exposes its choices; the answer key value never appears.
    written = test.written[0]
    assert list(written.options) == ["A", "B"]


# ── 2 start creates or reuses ─────────────────────────────────────────────────
def test_start_creates_then_reuses_active_attempt():
    student = make_student()
    a1 = StartPlacementAttemptUseCase().execute(actor=student.user)
    assert a1.status == "in_progress"
    a2 = StartPlacementAttemptUseCase().execute(actor=student.user)
    assert a2.id == a1.id  # one active attempt → reused


# ── 3 written save + retake + validation ──────────────────────────────────────
def test_written_answers_save_and_can_be_retaken():
    w, _ = _questions(n_written=1, n_spoken=0)
    student = make_student()
    StartPlacementAttemptUseCase().execute(actor=student.user)
    uc = SaveWrittenAnswersUseCase()
    uc.execute(actor=student.user, answers=[{"question_id": str(w[0].id), "answer_text": "first"}])
    uc.execute(actor=student.user, answers=[{"question_id": str(w[0].id), "answer_text": "second"}])  # retake
    from apps.placement.models import PlacementWrittenAnswer
    rows = PlacementWrittenAnswer.objects.filter(question=w[0])
    assert rows.count() == 1 and rows.first().answer_text == "second"


def test_written_rejects_unknown_question():
    make_questions = _questions(n_written=1, n_spoken=0)
    student = make_student()
    StartPlacementAttemptUseCase().execute(actor=student.user)
    with pytest.raises(InvalidPlacementQuestion):
        SaveWrittenAnswersUseCase().execute(
            actor=student.user, answers=[{"question_id": "not-a-real-id", "answer_text": "x"}]
        )


# ── 4 spoken one-shot ─────────────────────────────────────────────────────────
def test_spoken_can_be_saved_multiple_times_in_same_attempt():
    _, s = _questions(n_written=0, n_spoken=1)
    student = make_student()
    StartPlacementAttemptUseCase().execute(actor=student.user)
    uc = SaveSpokenTranscriptsUseCase()
    uc.execute(actor=student.user, transcripts=[{"question_id": str(s[0].id), "transcript_text": "a"}])
    uc.execute(actor=student.user, transcripts=[{"question_id": str(s[0].id), "transcript_text": "b"}])  # same attempt → ok


def test_spoken_one_shot_blocks_new_attempt():
    w, s = _questions(1, 1)
    student = make_student()
    _run_full(student.user, w, s)  # attempt A used spoken + assessed
    StartPlacementAttemptUseCase().execute(actor=student.user)  # attempt B (A is assessed)
    with pytest.raises(SpokenAttemptAlreadyUsed):
        SaveSpokenTranscriptsUseCase().execute(
            actor=student.user, transcripts=[{"question_id": str(s[0].id), "transcript_text": "again"}]
        )


# ── 5 admin reset reopens spoken + records audit ──────────────────────────────
def test_admin_reset_allows_new_spoken_and_records_audit():
    w, s = _questions(1, 1)
    student = make_student()
    admin = make_admin()
    result_a = _run_full(student.user, w, s)
    assert result_a.cefr_level in cefr.LEVELS

    # The assessed attempt is the latest; reset it.
    attempt = GetPlacementAttemptStatusUseCase().execute(actor=student.user)
    reset = AdminResetSpokenAttemptUseCase().execute(
        actor=admin, attempt_id=attempt.attempt_id, reason="connection dropped"
    )
    assert reset.reason == "connection dropped"
    assert PlacementResetAudit.objects.filter(attempt_id=attempt.attempt_id).exists()

    # New attempt may now save spoken again (old transcripts kept, not deleted).
    StartPlacementAttemptUseCase().execute(actor=student.user)
    SaveSpokenTranscriptsUseCase().execute(
        actor=student.user, transcripts=[{"question_id": str(s[0].id), "transcript_text": GOOD_SPOKEN}]
    )


def test_non_admin_cannot_reset_spoken():
    w, s = _questions(1, 1)
    student = make_student()
    result = _run_full(student.user, w, s)  # noqa: F841
    status = GetPlacementAttemptStatusUseCase().execute(actor=student.user)
    with pytest.raises(PermissionDenied):
        AdminResetSpokenAttemptUseCase().execute(
            actor=student.user, attempt_id=status.attempt_id, reason="let me retry"
        )


# ── 6 submit incomplete ───────────────────────────────────────────────────────
def test_submit_fails_when_incomplete():
    w, s = _questions(1, 1)
    student = make_student()
    StartPlacementAttemptUseCase().execute(actor=student.user)
    SaveWrittenAnswersUseCase().execute(
        actor=student.user, answers=[{"question_id": str(w[0].id), "answer_text": GOOD_WRITTEN}]
    )  # no spoken
    with pytest.raises(PlacementIncomplete):
        SubmitPlacementAttemptUseCase().execute(actor=student.user)


# ── 7 submit deterministic + 8 weak spoken caps ───────────────────────────────
def test_submit_is_deterministic_and_sets_level():
    w, s = _questions(1, 1)
    a, b = make_student(), make_student()
    ra = _run_full(a.user, w, s)
    rb = _run_full(b.user, w, s)
    assert ra.cefr_level == rb.cefr_level  # identical answers → identical level
    a.refresh_from_db()
    assert a.level == ra.cefr_level  # student level personalized


def test_weak_spoken_caps_final_cefr_via_use_case():
    w, s = _questions(1, 1)
    student = make_student()
    r = _run_full(student.user, w, s, written_text=GOOD_WRITTEN, spoken_text="ok")  # very weak spoken
    assert r.spoken_score < 40
    assert cefr.level_index(r.cefr_level) <= cefr.level_index(r.spoken_ceiling)


# ── 9 + 10 ownership ──────────────────────────────────────────────────────────
def test_result_persisted_and_retrievable_by_owner():
    w, s = _questions(1, 1)
    student = make_student()
    submitted = _run_full(student.user, w, s)
    stored = GetMyPlacementResultUseCase().execute(actor=student.user)
    assert isinstance(stored, PlacementStoredResult)
    assert stored.cefr_level == submitted.cefr_level


def test_student_cannot_read_another_students_result():
    w, s = _questions(1, 1)
    owner = make_student()
    _run_full(owner.user, w, s)  # owner has a result
    other = make_student()       # no result of their own
    with pytest.raises(PlacementResultNotFound):
        GetMyPlacementResultUseCase().execute(actor=other.user)


# ── 11 attempt status ─────────────────────────────────────────────────────────
def test_attempt_status_transitions():
    w, s = _questions(1, 1)
    student = make_student()
    assert GetPlacementAttemptStatusUseCase().execute(actor=student.user).status == "not_started"
    StartPlacementAttemptUseCase().execute(actor=student.user)
    mid = GetPlacementAttemptStatusUseCase().execute(actor=student.user)
    assert mid.status == "in_progress" and mid.written_complete is False
    _run_full(student.user, w, s)
    done = GetPlacementAttemptStatusUseCase().execute(actor=student.user)
    assert done.status == "assessed"
    assert done.written_complete is True and done.spoken_complete is True


# ── 12 no pronunciation in any DTO ────────────────────────────────────────────
def test_no_pronunciation_field_in_any_output_dto():
    w, s = _questions(1, 1)
    student = make_student()
    result = _run_full(student.user, w, s)
    stored = GetMyPlacementResultUseCase().execute(actor=student.user)
    status = GetPlacementAttemptStatusUseCase().execute(actor=student.user)
    test = ListPlacementQuestionsUseCase().execute(actor=student.user)

    def all_keys(o):
        if isinstance(o, dict):
            for k, v in o.items():
                yield k
                yield from all_keys(v)
        elif isinstance(o, (list, tuple)):
            for x in o:
                yield from all_keys(x)

    for dto in (result, stored, status, test):
        assert not any("pronunciation" in str(k).lower() for k in all_keys(dataclasses.asdict(dto)))


# ── 13 no AI/STT dependency ───────────────────────────────────────────────────
def test_no_openai_or_stt_dependency_in_use_cases():
    import application.placement.use_cases as uc

    src = pathlib.Path(uc.__file__).read_text(encoding="utf-8").lower()
    for tok in ("import openai", "from openai", "import whisper", "speech_recognition", "agora"):
        assert tok not in src

    # The flow runs end-to-end with the deterministic heuristic only.
    w, s = _questions(1, 1)
    student = make_student()
    result = _run_full(student.user, w, s)
    assert result.provider_name == "heuristic"  # Submit returns the persisted PlacementStoredResult
    assert PlacementAssessmentResult.objects.get(attempt__student=student).provider_name == "heuristic"
