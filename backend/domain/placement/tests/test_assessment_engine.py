"""
Placement Assessment Engine tests (Sprint 3).

Pure domain tests — no Django, no DB, no I/O. Cover written/speaking/mixed
assessment, edge cases, invalid input, determinism, provider abstraction, and
DTO validation.
"""
import pytest

from domain.exceptions import InvalidAssessmentInput
from domain.placement import cefr
from domain.placement.assessment import (
    AssessmentInput,
    AssessmentProvider,
    HeuristicAssessmentProvider,
    PlacementAssessmentEngine,
)
from domain.placement.dtos import (
    PlacementAssessmentResult,
    PlacementRecommendationResult,
    PlacementSectionScore,
    PlacementSpokenAnswer,
    PlacementWrittenAnswer,
)

GOOD_WRITTEN = "I work as an engineer and I really enjoy solving difficult problems every day."
GOOD_SPOKEN = "I am learning English because I want to talk with my colleagues and travel abroad."


def _written(*texts):
    return [PlacementWrittenAnswer(question_id=f"w{i}", answer_text=t) for i, t in enumerate(texts)]


def _spoken(*texts):
    return [PlacementSpokenAnswer(question_id=f"s{i}", transcript=t) for i, t in enumerate(texts)]


def _assert_valid_result(r):
    assert isinstance(r, PlacementAssessmentResult)
    assert r.cefr_level in cefr.LEVELS
    for score in (
        r.overall_conversation_score, r.grammar_score, r.vocabulary_score,
        r.fluency_score, r.confidence_score, r.written_score, r.spoken_score,
    ):
        assert isinstance(score, int) and 0 <= score <= 100
    assert isinstance(r.recommendation, PlacementRecommendationResult)
    assert r.recommendation.recommended_instructor_difficulty in (
        "supportive", "balanced", "challenging",
    )


# ── written / speaking / mixed ────────────────────────────────────────────────
def test_written_only_assessment():
    r = PlacementAssessmentEngine().assess(written=_written(GOOD_WRITTEN, GOOD_WRITTEN), spoken=[])
    _assert_valid_result(r)
    assert r.written_score > 0
    assert r.written.answers_count == 2


def test_speaking_only_assessment():
    r = PlacementAssessmentEngine().assess(written=[], spoken=_spoken(GOOD_SPOKEN, GOOD_SPOKEN))
    _assert_valid_result(r)
    assert r.spoken_score > 0
    assert r.spoken.answers_count == 2


def test_mixed_assessment_uses_both_sections():
    r = PlacementAssessmentEngine().assess(
        written=_written(GOOD_WRITTEN), spoken=_spoken(GOOD_SPOKEN), goal="career",
    )
    _assert_valid_result(r)
    assert r.written_score > 0 and r.spoken_score > 0


# ── edge cases ────────────────────────────────────────────────────────────────
def test_empty_everything_still_returns_a_valid_result():
    r = PlacementAssessmentEngine().assess(written=[], spoken=[])
    _assert_valid_result(r)  # deterministic floor, no crash


def test_empty_transcript_is_handled():
    r = PlacementAssessmentEngine().assess(written=_written(GOOD_WRITTEN), spoken=_spoken("", ""))
    _assert_valid_result(r)
    assert r.spoken_score >= 0


def test_none_inputs_are_coerced():
    r = PlacementAssessmentEngine().assess(written=None, spoken=None)
    _assert_valid_result(r)


# ── invalid input ─────────────────────────────────────────────────────────────
def test_invalid_written_item_raises():
    with pytest.raises(InvalidAssessmentInput):
        PlacementAssessmentEngine().assess(written=[object()], spoken=[])


def test_written_answer_text_must_be_a_string():
    bad = PlacementWrittenAnswer(question_id="w", answer_text=123)  # type: ignore[arg-type]
    with pytest.raises(InvalidAssessmentInput):
        PlacementAssessmentEngine().assess(written=[bad], spoken=[])


def test_invalid_spoken_item_raises():
    with pytest.raises(InvalidAssessmentInput):
        PlacementAssessmentEngine().assess(written=[], spoken=[object()])


def test_goal_must_be_string_or_none():
    with pytest.raises(InvalidAssessmentInput):
        AssessmentInput.from_answers([], [], goal=123)


# ── determinism ───────────────────────────────────────────────────────────────
def test_scoring_is_deterministic():
    engine = PlacementAssessmentEngine()
    a = engine.assess(written=_written(GOOD_WRITTEN), spoken=_spoken(GOOD_SPOKEN), goal="travel")
    b = engine.assess(written=_written(GOOD_WRITTEN), spoken=_spoken(GOOD_SPOKEN), goal="travel")
    assert a == b  # identical input → identical structured result


def test_two_students_identical_answers_get_identical_level():
    engine = PlacementAssessmentEngine()
    a = engine.assess(written=_written(GOOD_WRITTEN), spoken=_spoken(GOOD_SPOKEN))
    b = engine.assess(written=_written(GOOD_WRITTEN), spoken=_spoken(GOOD_SPOKEN))
    assert a.cefr_level == b.cefr_level


# ── provider abstraction ──────────────────────────────────────────────────────
def _canned_result(source="fake"):
    section = PlacementSectionScore(section="written", score=50, grammar=50, vocabulary=50, completion=50)
    return PlacementAssessmentResult(
        cefr_level="B1", overall_conversation_score=50, grammar_score=50, vocabulary_score=50,
        fluency_score=50, confidence_score=50, written_score=50, spoken_score=50,
        spoken_capped=False, spoken_ceiling="C1", source=source,
        written=section, spoken=section, recommendation=PlacementRecommendationResult(),
    )


def test_engine_delegates_to_the_injected_provider():
    class FakeProvider(AssessmentProvider):
        name = "fake"

        def __init__(self):
            self.calls = []

        def assess(self, assessment_input):
            self.calls.append(assessment_input)
            return _canned_result()

    fake = FakeProvider()
    engine = PlacementAssessmentEngine(provider=fake)
    result = engine.assess(written=_written("hi"), spoken=_spoken("there"), goal="business")

    assert result.source == "fake"  # engine returned the provider's DTO verbatim
    assert len(fake.calls) == 1
    # The provider receives the validated input value object — nothing else.
    passed = fake.calls[0]
    assert isinstance(passed, AssessmentInput)
    assert passed.goal == "business"
    assert len(passed.written) == 1 and len(passed.spoken) == 1


def test_default_provider_is_the_deterministic_heuristic():
    engine = PlacementAssessmentEngine()
    assert isinstance(engine.provider, HeuristicAssessmentProvider)
    assert engine.provider.name == "heuristic"
    r = engine.assess(written=_written(GOOD_WRITTEN), spoken=_spoken(GOOD_SPOKEN))
    assert r.source == "heuristic"


# ── DTO validation / no leakage ───────────────────────────────────────────────
def test_result_dto_exposes_no_prompt_or_provider_config():
    import dataclasses

    r = PlacementAssessmentEngine().assess(written=_written(GOOD_WRITTEN), spoken=_spoken(GOOD_SPOKEN))
    keys = set(dataclasses.asdict(r).keys())
    for banned in ("prompt", "api_key", "apikey", "secret", "config", "instructions", "system"):
        assert not any(banned in k.lower() for k in keys)
    # The full structured shape is present.
    expected = {
        "cefr_level", "overall_conversation_score", "grammar_score", "vocabulary_score",
        "fluency_score", "confidence_score", "written_score", "spoken_score",
        "spoken_capped", "spoken_ceiling", "source", "written", "spoken", "recommendation",
    }
    assert keys == expected


def test_engine_is_pure_no_persistence_or_framework_imports():
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[1] / "assessment"
    for py in root.glob("*.py"):
        src = py.read_text(encoding="utf-8").lower()
        for banned in ("import django", "from django", ".objects.", "import openai", "from openai", "requests."):
            assert banned not in src, f"{py.name} contains {banned}"
