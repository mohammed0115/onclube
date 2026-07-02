"""
Pure tests for the assessment-payload validator/assembler (Sprint 4).

No Django, no I/O. Covers strict schema validation and the business-rule CEFR cap
that overrides the provider's proposed level.
"""
import pytest

from domain.exceptions import InvalidAssessmentOutput
from domain.placement.assessment import parse_assessment_payload
from domain.placement.dtos import PlacementAssessmentResult


def _valid(**over):
    data = {
        "cefrLevel": "B1",
        "grammarScore": 70,
        "vocabularyScore": 65,
        "fluencyScore": 60,
        "confidenceScore": 62,
        "strengths": ["clear answers"],
        "weaknesses": ["past tense"],
        "recommendedTopics": ["daily routine", "work"],
        "recommendedInstructorDifficulty": "balanced",
    }
    data.update(over)
    return data


def test_valid_payload_assembles_a_result():
    r = parse_assessment_payload(_valid(), source="openai")
    assert isinstance(r, PlacementAssessmentResult)
    assert r.cefr_level == "B1"
    assert r.grammar_score == 70 and r.confidence_score == 62
    assert r.source == "openai"
    assert r.recommendation.recommended_conversation_topics == ["daily routine", "work"]
    assert r.recommendation.recommended_instructor_difficulty == "balanced"


@pytest.mark.parametrize("field", [
    "cefrLevel", "grammarScore", "vocabularyScore", "fluencyScore",
    "confidenceScore", "strengths", "weaknesses", "recommendedTopics",
    "recommendedInstructorDifficulty",
])
def test_missing_required_field_rejected(field):
    data = _valid()
    del data[field]
    with pytest.raises(InvalidAssessmentOutput):
        parse_assessment_payload(data, source="openai")


@pytest.mark.parametrize("level", ["C2", "A0", "b1", "", "Intermediate", None])
def test_invalid_cefr_rejected(level):
    with pytest.raises(InvalidAssessmentOutput):
        parse_assessment_payload(_valid(cefrLevel=level), source="openai")


@pytest.mark.parametrize("value", [-1, 101, "80", None, True])
def test_score_out_of_range_or_wrong_type_rejected(value):
    with pytest.raises(InvalidAssessmentOutput):
        parse_assessment_payload(_valid(grammarScore=value), source="openai")


@pytest.mark.parametrize("field", ["strengths", "weaknesses", "recommendedTopics"])
def test_non_list_collection_rejected(field):
    with pytest.raises(InvalidAssessmentOutput):
        parse_assessment_payload(_valid(**{field: "not a list"}), source="openai")


def test_list_with_non_string_items_rejected():
    with pytest.raises(InvalidAssessmentOutput):
        parse_assessment_payload(_valid(strengths=["ok", 5]), source="openai")


def test_invalid_difficulty_rejected():
    with pytest.raises(InvalidAssessmentOutput):
        parse_assessment_payload(_valid(recommendedInstructorDifficulty="hard"), source="openai")


def test_non_dict_payload_rejected():
    with pytest.raises(InvalidAssessmentOutput):
        parse_assessment_payload(["not", "a", "dict"], source="openai")


def test_unknown_fields_are_ignored_safely():
    r = parse_assessment_payload(_valid(surprise="ignore me", pronunciationScore=99), source="openai")
    assert isinstance(r, PlacementAssessmentResult)


def test_business_rule_caps_cefr_when_spoken_is_weak():
    # Provider proposes C1 but the spoken dimensions are very weak → domain caps it.
    r = parse_assessment_payload(
        _valid(cefrLevel="C1", fluencyScore=5, confidenceScore=5), source="openai"
    )
    assert r.cefr_level != "C1"  # business rule overrode the provider's level
    assert r.spoken_capped is True
    assert r.spoken_ceiling in ("A2", "B1")
