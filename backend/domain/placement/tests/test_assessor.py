"""The deterministic heuristic evaluator end-to-end."""
import dataclasses

from domain.placement import cefr
from domain.placement.assessor import assess
from domain.placement.dtos import (
    PlacementAssessmentResult,
    PlacementSpokenAnswer,
    PlacementWrittenAnswer,
)

WRITTEN = [
    PlacementWrittenAnswer("w1", "I work as a software engineer and I enjoy solving problems."),
    PlacementWrittenAnswer("w2", "Yesterday I read a book about history because I find it interesting."),
]
SPOKEN = [
    PlacementSpokenAnswer("s1", "I am learning English so that I can speak with my colleagues at work."),
    PlacementSpokenAnswer("s2", "On weekends I usually meet my friends and we talk about many things."),
]


def test_assess_returns_full_result_in_range():
    r = assess(WRITTEN, SPOKEN, goal="work")
    assert isinstance(r, PlacementAssessmentResult)
    assert r.cefr_level in cefr.LEVELS
    assert r.source == "heuristic"
    for v in (r.overall_conversation_score, r.grammar_score, r.vocabulary_score,
              r.fluency_score, r.confidence_score, r.written_score, r.spoken_score):
        assert 0 <= v <= 100
    assert r.recommendation.recommended_instructor_difficulty in {"supportive", "balanced", "challenging"}
    assert r.recommendation.recommended_conversation_topics  # non-empty


def test_deterministic_same_input_same_result():
    r1 = assess(WRITTEN, SPOKEN, goal="work")
    r2 = assess(WRITTEN, SPOKEN, goal="work")
    assert r1 == r2  # frozen dataclasses + lists compare by value → fully stable


def test_no_spoken_keeps_level_low_and_within_ceiling():
    strong_written = [PlacementWrittenAnswer("w1",
        "I have been studying English for many years and I can write long, detailed paragraphs "
        "about complex topics such as economics, technology and the environment.")]
    no_spoken: list[PlacementSpokenAnswer] = []
    r = assess(strong_written, no_spoken, goal="work")
    assert r.spoken_score == 0
    assert r.fluency_score == 0
    assert r.confidence_score == 0
    # With no spoken signal the ceiling is A2 and the final level can never exceed it.
    assert r.spoken_ceiling == "A2"
    assert cefr.level_index(r.cefr_level) <= cefr.level_index(r.spoken_ceiling)
    assert r.cefr_level in {"A1", "A2"}


def test_final_level_never_exceeds_spoken_ceiling_invariant():
    # A strong written sheet with a short, weak spoken section stays capped.
    r = assess(
        [PlacementWrittenAnswer("w1",
            "I can describe complex ideas clearly and write detailed, well-structured paragraphs "
            "about many different subjects with accurate grammar and rich vocabulary.")],
        [PlacementSpokenAnswer("s1", "yes ok")],  # very short → low spoken
        goal="work",
    )
    assert cefr.level_index(r.cefr_level) <= cefr.level_index(r.spoken_ceiling)


def test_result_has_no_pronunciation_anywhere():
    r = assess(WRITTEN, SPOKEN, goal="work")
    data = dataclasses.asdict(r)

    def all_keys(o):
        if isinstance(o, dict):
            for k, v in o.items():
                yield k
                yield from all_keys(v)
        elif isinstance(o, (list, tuple)):
            for x in o:
                yield from all_keys(x)

    assert not any("pronunciation" in str(k).lower() for k in all_keys(data))
