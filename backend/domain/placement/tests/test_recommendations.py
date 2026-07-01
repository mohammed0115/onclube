"""Recommendation rules: strengths, weaknesses, focus, topics, instructor difficulty."""
from domain.placement.recommendations import (
    build_recommendations,
    instructor_difficulty_for,
)


def test_instructor_difficulty_by_level():
    assert instructor_difficulty_for("A1") == "supportive"
    assert instructor_difficulty_for("A2") == "supportive"
    assert instructor_difficulty_for("B1") == "balanced"
    assert instructor_difficulty_for("B2") == "balanced"
    assert instructor_difficulty_for("C1") == "challenging"


def test_strengths_and_weaknesses_split_by_threshold():
    rec = build_recommendations(grammar=85, vocabulary=80, fluency=40, confidence=30, level="B1")
    assert "Grammar" in rec.strengths and "Vocabulary" in rec.strengths
    assert "Fluency" in rec.weaknesses and "Confidence" in rec.weaknesses
    # Focus = the two lowest dimensions.
    assert any("assertive" in f or "smoother" in f for f in rec.recommended_focus)
    assert len(rec.recommended_focus) == 2


def test_topics_reflect_goal_and_weaknesses():
    rec = build_recommendations(
        grammar=80, vocabulary=40, fluency=80, confidence=80, level="B1", goal="interview"
    )
    topics = rec.recommended_conversation_topics
    assert "job_interview_practice" in topics      # from goal
    assert "vocabulary_in_context" in topics        # from the vocabulary weakness
    assert len(topics) <= 5


def test_topics_fall_back_without_goal():
    rec = build_recommendations(grammar=70, vocabulary=70, fluency=70, confidence=70, level="B2")
    assert rec.recommended_conversation_topics  # non-empty default set


def test_supportive_levels_prepend_essentials():
    rec = build_recommendations(grammar=30, vocabulary=30, fluency=30, confidence=30, level="A1", goal="travel")
    assert rec.recommended_conversation_topics[0] == "everyday_essentials"
