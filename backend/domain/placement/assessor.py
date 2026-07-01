"""
Deterministic heuristic placement evaluator (Phase 8B) — the DEFAULT.

`assess(...)` is pure and framework-free: given the written + spoken answers it
returns a fully-populated `PlacementAssessmentResult`. No AI, no STT, no I/O, no
randomness. A future `OpenAIAssessor` can implement the same call signature and
be selected behind a provider flag — but this heuristic is always available as
the baseline/fallback, so placement never depends on AI.
"""
from __future__ import annotations

from . import cefr, scoring
from .dtos import (
    PlacementAssessmentResult,
    PlacementSpokenAnswer,
    PlacementWrittenAnswer,
)
from .recommendations import build_recommendations


def assess(
    written_answers: list[PlacementWrittenAnswer],
    spoken_answers: list[PlacementSpokenAnswer],
    *,
    goal: str | None = None,
) -> PlacementAssessmentResult:
    written_section, _written_rows = scoring.score_written_section(list(written_answers or []))
    spoken_section, spoken_rows = scoring.score_spoken_section(list(spoken_answers or []))

    written_score = written_section.score
    spoken_score = spoken_section.score

    level, overall, capped, ceiling = cefr.final_level(written_score, spoken_score)

    # Dimension scores: grammar/vocabulary blend both sections (spoken-dominant);
    # fluency comes from spoken transcripts only; confidence from spoken text.
    grammar_score = cefr.weighted_overall(written_section.grammar, spoken_section.grammar)
    vocabulary_score = cefr.weighted_overall(written_section.vocabulary, spoken_section.vocabulary)
    fluency_score = spoken_section.fluency or 0
    confidence_score = scoring.confidence_from_spoken(spoken_rows)

    recommendation = build_recommendations(
        grammar=grammar_score,
        vocabulary=vocabulary_score,
        fluency=fluency_score,
        confidence=confidence_score,
        level=level,
        goal=goal,
    )

    return PlacementAssessmentResult(
        cefr_level=level,
        overall_conversation_score=overall,
        grammar_score=grammar_score,
        vocabulary_score=vocabulary_score,
        fluency_score=fluency_score,
        confidence_score=confidence_score,
        written_score=written_score,
        spoken_score=spoken_score,
        spoken_capped=capped,
        spoken_ceiling=ceiling,
        source="heuristic",
        written=written_section,
        spoken=spoken_section,
        recommendation=recommendation,
    )
