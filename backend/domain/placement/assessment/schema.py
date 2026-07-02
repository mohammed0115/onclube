"""
Strict validation + assembly of an assessment payload → PlacementAssessmentResult.

Pure domain code (no Django, no I/O). This is the anti-corruption boundary for an
external assessment provider (e.g. OpenAI): an infrastructure adapter parses the
raw response to a plain dict and hands it here. Any schema violation raises
`InvalidAssessmentOutput`, which the adapter catches to trigger the heuristic
fallback.

Business rules override the provider's output: the spoken-performance CEFR cap is
re-applied here regardless of the level the provider proposed.
"""
from __future__ import annotations

from domain.exceptions import InvalidAssessmentOutput
from domain.placement import cefr
from domain.placement.dtos import (
    PlacementAssessmentResult,
    PlacementRecommendationResult,
    PlacementSectionScore,
)

REQUIRED_FIELDS = (
    "cefrLevel", "grammarScore", "vocabularyScore", "fluencyScore",
    "confidenceScore", "strengths", "weaknesses", "recommendedTopics",
    "recommendedInstructorDifficulty",
)
VALID_DIFFICULTY = ("supportive", "balanced", "challenging")


def _score(value, field):
    # Reject booleans and non-numeric; require an in-range 0–100 value.
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise InvalidAssessmentOutput(f"{field} must be a number.")
    if not (0 <= value <= 100):
        raise InvalidAssessmentOutput(f"{field} must be between 0 and 100.")
    return int(round(value))


def _str_list(value, field):
    if not isinstance(value, list):
        raise InvalidAssessmentOutput(f"{field} must be a list.")
    if not all(isinstance(item, str) for item in value):
        raise InvalidAssessmentOutput(f"{field} must be a list of strings.")
    return list(value)


def parse_assessment_payload(data, *, source: str) -> PlacementAssessmentResult:
    """Validate a provider payload dict and assemble the structured result.

    Unknown fields are ignored safely. Raises InvalidAssessmentOutput on any
    missing/invalid field.
    """
    if not isinstance(data, dict):
        raise InvalidAssessmentOutput("payload must be a JSON object.")
    for field in REQUIRED_FIELDS:
        if field not in data:
            raise InvalidAssessmentOutput(f"missing field: {field}")

    cefr_level = data["cefrLevel"]
    if cefr_level not in cefr.LEVELS:
        raise InvalidAssessmentOutput(f"invalid cefrLevel: {cefr_level!r}")

    grammar = _score(data["grammarScore"], "grammarScore")
    vocabulary = _score(data["vocabularyScore"], "vocabularyScore")
    fluency = _score(data["fluencyScore"], "fluencyScore")
    confidence = _score(data["confidenceScore"], "confidenceScore")

    strengths = _str_list(data["strengths"], "strengths")
    weaknesses = _str_list(data["weaknesses"], "weaknesses")
    topics = _str_list(data["recommendedTopics"], "recommendedTopics")

    difficulty = data["recommendedInstructorDifficulty"]
    if difficulty not in VALID_DIFFICULTY:
        raise InvalidAssessmentOutput(f"invalid recommendedInstructorDifficulty: {difficulty!r}")

    return _assemble(
        cefr_level=cefr_level, grammar=grammar, vocabulary=vocabulary,
        fluency=fluency, confidence=confidence, strengths=strengths,
        weaknesses=weaknesses, topics=topics, difficulty=difficulty, source=source,
    )


def _assemble(*, cefr_level, grammar, vocabulary, fluency, confidence,
              strengths, weaknesses, topics, difficulty, source) -> PlacementAssessmentResult:
    written_score = cefr.clamp_score((grammar + vocabulary) / 2)
    spoken_score = cefr.clamp_score((fluency + confidence) / 2)

    # Business rule OVERRIDES the provider: a weak spoken performance caps the
    # final CEFR level regardless of what the provider proposed.
    ceiling = cefr.spoken_ceiling(spoken_score)
    final_level = cefr.cap_level(cefr_level, ceiling)
    spoken_capped = final_level != cefr_level
    overall = cefr.weighted_overall(written_score, spoken_score)

    written_section = PlacementSectionScore(
        section="written", score=written_score, grammar=grammar,
        vocabulary=vocabulary, completion=100, fluency=None, answers_count=0,
    )
    spoken_section = PlacementSectionScore(
        section="spoken", score=spoken_score, grammar=grammar,
        vocabulary=vocabulary, completion=100, fluency=fluency, answers_count=0,
    )
    recommendation = PlacementRecommendationResult(
        strengths=strengths, weaknesses=weaknesses, recommended_focus=[],
        recommended_conversation_topics=topics,
        recommended_instructor_difficulty=difficulty,
    )
    return PlacementAssessmentResult(
        cefr_level=final_level, overall_conversation_score=overall,
        grammar_score=grammar, vocabulary_score=vocabulary, fluency_score=fluency,
        confidence_score=confidence, written_score=written_score,
        spoken_score=spoken_score, spoken_capped=spoken_capped,
        spoken_ceiling=ceiling, source=source, written=written_section,
        spoken=spoken_section, recommendation=recommendation,
    )
