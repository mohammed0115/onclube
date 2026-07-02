"""Phase 8C placement persistence + repository tests."""
import dataclasses

import pytest
from django.core.management import call_command
from django.db import IntegrityError, transaction

from apps.common.factories import make_admin, make_student
from apps.placement import models as m
from domain.placement.assessor import assess
from domain.placement.dtos import (
    PlacementSpokenAnswer,
    PlacementStoredResult,
    PlacementWrittenAnswer,
)
from infrastructure.repositories.placement import (
    DjangoPlacementAnswerRepository,
    DjangoPlacementAttemptRepository,
    DjangoPlacementQuestionRepository,
    DjangoPlacementResetAuditRepository,
    DjangoPlacementResultRepository,
)
from infrastructure.repositories.placement_mappers import question_to_dto

pytestmark = pytest.mark.django_db

ALL_MODELS = [
    m.PlacementQuestion, m.PlacementAttempt, m.PlacementWrittenAnswer,
    m.PlacementSpokenAnswer, m.PlacementAssessmentResult, m.PlacementResetAudit,
    m.InterviewSession,
]


def _written_q(order=1):
    return m.PlacementQuestion.objects.create(question_type="written", prompt="W?", order=order)


def _spoken_q(order=1):
    return m.PlacementQuestion.objects.create(question_type="spoken", prompt="S?", order=order)


# ── constraints ───────────────────────────────────────────────────────────────
def test_question_order_unique_per_type():
    _written_q(order=1)
    with pytest.raises(IntegrityError), transaction.atomic():
        _written_q(order=1)


def test_same_order_allowed_across_types():
    _written_q(order=1)
    _spoken_q(order=1)  # different type, same order → fine
    assert m.PlacementQuestion.objects.count() == 2


def test_result_one_to_one_per_attempt():
    student = make_student()
    attempt = m.PlacementAttempt.objects.create(student=student)
    m.PlacementAssessmentResult.objects.create(attempt=attempt, cefr_level="A2")
    with pytest.raises(IntegrityError), transaction.atomic():
        m.PlacementAssessmentResult.objects.create(attempt=attempt, cefr_level="B1")


def test_answers_unique_per_attempt_question():
    student = make_student()
    attempt = m.PlacementAttempt.objects.create(student=student)
    q = _written_q()
    m.PlacementWrittenAnswer.objects.create(attempt=attempt, question=q, answer_text="a")
    with pytest.raises(IntegrityError), transaction.atomic():
        m.PlacementWrittenAnswer.objects.create(attempt=attempt, question=q, answer_text="b")


def test_active_inprogress_attempt_uniqueness():
    student = make_student()
    repo = DjangoPlacementAttemptRepository()
    repo.create(student=student)
    with pytest.raises(IntegrityError), transaction.atomic():
        repo.create(student=student)


# ── no pronunciation / server-only fields ─────────────────────────────────────
def test_no_pronunciation_field_in_any_model():
    for Model in ALL_MODELS:
        names = [f.name.lower() for f in Model._meta.get_fields()]
        assert not any("pronunciation" in n for n in names), Model.__name__


def test_correct_answer_index_stored_but_not_in_public_dto():
    q = m.PlacementQuestion.objects.create(
        question_type="written", prompt="Pick", order=9,
        options=["A", "B"], correct_index=1, correct_answer="B",
    )
    q.refresh_from_db()
    assert q.correct_index == 1 and q.correct_answer == "B"  # stored server-side

    dto = question_to_dto(q)
    keys = set(dataclasses.asdict(dto).keys())
    # The answer key stays server-side: no correct_* / scoring_rubric on the DTO.
    assert not any("correct" in k for k in keys)
    assert "scoring_rubric" not in keys
    # The visible MCQ choices ARE exposed (needed to render the question).
    assert list(dto.options) == ["A", "B"]


# ── repositories round-trip ───────────────────────────────────────────────────
def test_repository_full_round_trip():
    student = make_student()
    wq, sq = _written_q(order=1), _spoken_q(order=1)

    attempts = DjangoPlacementAttemptRepository()
    answers = DjangoPlacementAnswerRepository()
    results = DjangoPlacementResultRepository()
    questions = DjangoPlacementQuestionRepository()

    attempt = attempts.create(student=student, version=1)
    assert attempt.status == "in_progress"

    # Public question list carries no answer key.
    pub = questions.list_active("written")
    assert pub and not any("correct" in k for q in pub for k in dataclasses.asdict(q))

    answers.save_written(attempt_id=attempt.id, question_id=str(wq.id), answer_text="I like reading books.")
    answers.save_spoken(
        attempt_id=attempt.id, question_id=str(sq.id),
        transcript_text="I am learning English because I want to travel and meet new people.",
        stt_provider="stub", stt_confidence=0.9,
    )
    assert answers.written_count(attempt.id) == 1
    assert answers.spoken_count(attempt.id) == 1

    result = assess(
        [PlacementWrittenAnswer(str(wq.id), "I like reading books.")],
        [PlacementSpokenAnswer(str(sq.id), "I am learning English because I want to travel and meet new people.")],
        goal="travel",
    )
    stored = results.save(
        attempt_id=attempt.id, result=result,
        evaluator_version="heuristic-v1", provider_name="heuristic", fallback_used=True,
    )
    assert isinstance(stored, PlacementStoredResult)

    got = results.get_for_attempt(attempt.id)
    assert got is not None
    assert got.cefr_level == result.cefr_level
    assert got.overall_conversation_score == result.overall_conversation_score
    assert got.recommendation.recommended_instructor_difficulty == \
        result.recommendation.recommended_instructor_difficulty
    assert got.provider_name == "heuristic" and got.fallback_used is True

    attempts.mark_assessed(attempt.id, provider_name="heuristic", fallback_used=True)
    assert attempts.get(attempt.id).status == "assessed"


def test_idempotent_result_save_stays_one_to_one():
    student = make_student()
    wq = _written_q()
    attempt = DjangoPlacementAttemptRepository().create(student=student)
    result = assess([PlacementWrittenAnswer(str(wq.id), "Hello there my name is Sam.")], [])
    repo = DjangoPlacementResultRepository()
    repo.save(attempt_id=attempt.id, result=result)
    repo.save(attempt_id=attempt.id, result=result)  # update, not duplicate
    assert m.PlacementAssessmentResult.objects.filter(attempt_id=attempt.id).count() == 1


# ── one-shot spoken + admin reset signals ─────────────────────────────────────
def test_has_used_spoken_and_reset_after_use():
    student = make_student()
    admin = make_admin()
    sq = _spoken_q()
    attempts = DjangoPlacementAttemptRepository()
    answers = DjangoPlacementAnswerRepository()
    audits = DjangoPlacementResetAuditRepository()

    attempt = attempts.create(student=student)
    assert attempts.has_used_spoken(student) is False
    assert audits.reset_after_use(student) is False

    answers.save_spoken(attempt_id=attempt.id, question_id=str(sq.id), transcript_text="I work as a teacher.")
    assert attempts.has_used_spoken(student) is True
    assert audits.reset_after_use(student) is False  # no reset yet

    audit_id = audits.record(attempt_id=attempt.id, reset_by=admin, reason="connection dropped")
    assert audit_id
    assert audits.reset_after_use(student) is True  # reset happened after the used attempt


# ── seed command ──────────────────────────────────────────────────────────────
def test_seed_creates_fixed_questions_and_is_idempotent():
    call_command("seed_placement")
    assert m.PlacementQuestion.objects.filter(question_type="written").count() == 5
    assert m.PlacementQuestion.objects.filter(question_type="spoken").count() == 5
    total = m.PlacementQuestion.objects.count()

    call_command("seed_placement")  # re-run
    assert m.PlacementQuestion.objects.count() == total == 10
