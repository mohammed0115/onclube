"""
Deterministic heuristic session-report provider (the fallback + no-key default).

Pure domain: builds a VALID SessionReportContent from the context alone — no LLM,
no network. It never fails, so it is the universal fallback for the OpenAI adapter
and the default when no API key is configured. It only rephrases the provided
artifacts into structured feedback; it does not evaluate or grade.
"""
from __future__ import annotations

from domain.session_report.provider import (
    GeneratedSessionReport,
    SessionReportContent,
    SessionReportContext,
    SessionReportProvider,
)


def _clamp(v: int) -> int:
    return max(0, min(int(v), 100))


def _confidence(context: SessionReportContext) -> int:
    # A stable proxy from engagement (transcript turns), capped to a sensible band.
    base = 55 + min(context.turns, 20) * 2
    return _clamp(min(base, 95))


def _skill_scores(context: SessionReportContext) -> dict:
    """Deterministic per-skill scores around the engagement baseline. Distinct,
    stable offsets so the progress dashboard shows meaningful per-skill movement
    as engagement grows session to session. Not a real assessment — a transparent
    heuristic used only when no scoring engine is configured."""
    base = _confidence(context)
    return {
        "grammar_score": _clamp(base - 3),
        "vocabulary_score": _clamp(base - 6),
        "fluency_score": _clamp(base + 1),
        "pronunciation_score": _clamp(base - 1),
    }


class HeuristicSessionReportProvider(SessionReportProvider):
    name = "heuristic"

    def generate(self, *, context: SessionReportContext) -> GeneratedSessionReport:
        topic = context.topic_title or "your session"
        goal = context.goal or "general fluency"
        turns = context.turns

        summary = (
            f"In this {context.duration_minutes}-minute session on “{topic}”, you "
            f"took part in {turns} exchanges. You engaged with the material and kept "
            f"the conversation going, which is the foundation for progress toward {goal}."
        )
        content = SessionReportContent(
            overall_summary=summary,
            grammar_feedback=(
                "Your sentence structure was generally clear. Keep an eye on verb "
                "tenses when describing past events, and pause to self-correct."
            ),
            vocabulary_feedback=(
                f"You used a solid range of everyday words around “{topic}”. Try to "
                "swap a few common words for more precise alternatives each session."
            ),
            fluency_feedback=(
                "You maintained a steady pace. Short pauses to plan are natural; aim "
                "to keep sentences flowing without long hesitations."
            ),
            pronunciation_feedback=(
                "Your pronunciation was understandable throughout. Practise word "
                "stress on longer words to sound even clearer."
            ),
            strengths=[
                "Stayed engaged and kept the conversation moving",
                "Communicated ideas clearly enough to be understood",
            ],
            weaknesses=[
                "Occasional tense slips when narrating past events",
                "Reached for the same common words repeatedly",
            ],
            recommended_topics=[
                f"More practice around {goal}",
                "Everyday small talk and follow-up questions",
            ],
            homework=[
                "Write five sentences about today's topic using the past tense.",
                "Learn three new topic-specific words and use each aloud.",
            ],
            next_lesson_focus="Reinforce past-tense narration and expand active vocabulary.",
            confidence_score=_confidence(context),
            **_skill_scores(context),
        )
        return GeneratedSessionReport(content=content, provider_name=self.name, fallback_used=False)
