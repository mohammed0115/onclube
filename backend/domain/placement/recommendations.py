"""
Pure recommendation rules (Phase 8B).

From the dimension scores + final CEFR level (+ optional goal code) produce:
strengths, weaknesses, recommended focus, recommended conversation topics, and a
recommended instructor difficulty. Deterministic, no AI. Topic *slugs* are
returned; the application layer maps them to real catalogue topics later.
"""
from __future__ import annotations

from .dtos import PlacementRecommendationResult

STRONG = 70
WEAK = 50

_DIMENSION_LABEL = {
    "grammar": "Grammar",
    "vocabulary": "Vocabulary",
    "fluency": "Fluency",
    "confidence": "Confidence",
}
_DIMENSION_FOCUS = {
    "grammar": "grammar accuracy in connected speech",
    "vocabulary": "broader everyday vocabulary",
    "fluency": "speaking in longer, smoother turns",
    "confidence": "answering with fuller, more assertive responses",
}

_GOAL_TOPICS = {
    "work": ["business_meetings", "calls_and_email", "presentations"],
    "interview": ["job_interview_practice", "self_introduction", "strengths_and_weaknesses"],
    "ielts": ["ielts_part1", "ielts_part2_cue_card", "ielts_part3_discussion"],
    "travel": ["airport_and_hotel", "asking_directions", "ordering_food"],
    "daily": ["small_talk", "daily_routine", "opinions_and_preferences"],
    "abroad": ["campus_life", "academic_discussion", "making_friends"],
}
_DEFAULT_TOPICS = ["everyday_conversation", "small_talk", "describing_experiences"]

_WEAKNESS_TOPIC = {
    "fluency": "fluency_building_chat",
    "vocabulary": "vocabulary_in_context",
    "grammar": "grammar_in_conversation",
    "confidence": "confidence_warmups",
}

_SUPPORTIVE_LEVELS = {"A1", "A2"}
_CHALLENGING_LEVELS = {"C1"}


def instructor_difficulty_for(level: str) -> str:
    if level in _SUPPORTIVE_LEVELS:
        return "supportive"
    if level in _CHALLENGING_LEVELS:
        return "challenging"
    return "balanced"


def _dimensions(grammar: int, vocabulary: int, fluency: int, confidence: int) -> dict:
    return {
        "grammar": grammar,
        "vocabulary": vocabulary,
        "fluency": fluency,
        "confidence": confidence,
    }


def _dedup(seq: list) -> list:
    seen, out = set(), []
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def recommended_topics(level: str, goal, weaknesses_keys: list) -> list:
    base = list(_GOAL_TOPICS.get((goal or "").strip().lower(), _DEFAULT_TOPICS))
    topics = []
    if level in _SUPPORTIVE_LEVELS:
        topics.append("everyday_essentials")
    topics.extend(base)
    for key in weaknesses_keys:
        if key in _WEAKNESS_TOPIC:
            topics.append(_WEAKNESS_TOPIC[key])
    return _dedup(topics)[:5]


def build_recommendations(
    *, grammar: int, vocabulary: int, fluency: int, confidence: int,
    level: str, goal=None,
) -> PlacementRecommendationResult:
    dims = _dimensions(grammar, vocabulary, fluency, confidence)

    strengths = [_DIMENSION_LABEL[k] for k, v in dims.items() if v >= STRONG]
    weakness_keys = [k for k, v in dims.items() if v < WEAK]
    weaknesses = [_DIMENSION_LABEL[k] for k in weakness_keys]

    # Focus = the two lowest dimensions (stable order on ties).
    lowest = sorted(dims.items(), key=lambda kv: (kv[1], kv[0]))[:2]
    recommended_focus = [_DIMENSION_FOCUS[k] for k, _ in lowest]

    return PlacementRecommendationResult(
        strengths=strengths,
        weaknesses=weaknesses,
        recommended_focus=recommended_focus,
        recommended_conversation_topics=recommended_topics(level, goal, weakness_keys),
        recommended_instructor_difficulty=instructor_difficulty_for(level),
    )
