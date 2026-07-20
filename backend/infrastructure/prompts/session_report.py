"""
Session-report prompt: versioned template + builder (Sprint 9).

The template owns ALL prompt text. The builder turns a `SessionReportContext` —
and ONLY that — into messages. No ids / email / secrets ever enter the prompt.
This asset is server-side only and is never serialized to the client.
"""
from __future__ import annotations

from domain.session_report.provider import SessionReportContext

from .base import PromptBuilder, PromptMessages, PromptTemplate, PromptVersion

_EXPECTED_OUTPUT_SCHEMA = {
    "type": "object",
    "required": [
        "overallSummary", "grammarFeedback", "vocabularyFeedback", "fluencyFeedback",
        "pronunciationFeedback", "strengths", "weaknesses", "recommendedTopics",
        "homework", "nextLessonFocus", "confidenceScore",
    ],
    "properties": {
        "overallSummary": {"type": "string"},
        "grammarFeedback": {"type": "string"},
        "vocabularyFeedback": {"type": "string"},
        "fluencyFeedback": {"type": "string"},
        "pronunciationFeedback": {"type": "string"},
        "strengths": {"type": "array", "items": {"type": "string"}},
        "weaknesses": {"type": "array", "items": {"type": "string"}},
        "recommendedTopics": {"type": "array", "items": {"type": "string"}},
        "homework": {"type": "array", "items": {"type": "string"}},
        "nextLessonFocus": {"type": "string"},
        "confidenceScore": {"type": "integer", "minimum": 0, "maximum": 100},
        "grammarScore": {"type": "integer", "minimum": 0, "maximum": 100},
        "vocabularyScore": {"type": "integer", "minimum": 0, "maximum": 100},
        "fluencyScore": {"type": "integer", "minimum": 0, "maximum": 100},
        "pronunciationScore": {"type": "integer", "minimum": 0, "maximum": 100},
    },
    "additionalProperties": False,
}

_SYSTEM_MESSAGE = (
    "You are an encouraging English tutor writing a post-lesson report for one "
    "student, based ONLY on the finalized session transcript and lesson details. "
    "Give constructive, specific feedback. Do NOT assign a CEFR level, a grade, or "
    "an attendance score. Reply with ONLY a single JSON object and no other text "
    "(no prose, no markdown, no code fences, no explanation)."
)

_INSTRUCTION_MESSAGE = (
    "Return EXACTLY these keys and nothing else: overallSummary, grammarFeedback, "
    "vocabularyFeedback, fluencyFeedback, pronunciationFeedback (strings), strengths, "
    "weaknesses, recommendedTopics, homework (arrays of strings), nextLessonFocus "
    "(string), confidenceScore (integer 0-100), and the per-skill integer scores "
    "grammarScore, vocabularyScore, fluencyScore, pronunciationScore (each 0-100, "
    "scoring THIS session's spoken performance). Do not add unknown fields. Do not "
    "include CEFR level, grades, attendance, or any explanation outside the JSON."
)

SESSION_REPORT_TEMPLATE = PromptTemplate(
    prompt_id="session.report",
    purpose="Turn a completed session's finalized transcript into a structured tutor report.",
    system_message=_SYSTEM_MESSAGE,
    instruction_message=_INSTRUCTION_MESSAGE,
    expected_output_schema=_EXPECTED_OUTPUT_SCHEMA,
    version=PromptVersion(
        version="2026-07-06.v1",
        review_note="Sprint 9: session report prompt; feedback only, never a level/grade.",
    ),
)


class SessionReportPromptBuilder(PromptBuilder):
    def __init__(self, template: PromptTemplate = SESSION_REPORT_TEMPLATE):
        self._template = template

    @property
    def template(self) -> PromptTemplate:
        return self._template

    def build(self, context: SessionReportContext) -> PromptMessages:
        # Accept ONLY a SessionReportContext — no ids/PII can reach the prompt.
        if not isinstance(context, SessionReportContext):
            raise TypeError("SessionReportPromptBuilder requires a SessionReportContext.")
        return PromptMessages(
            system=self._template.system_message,
            instruction=self._template.instruction_message,
            user=_build_user_message(context),
        )


def _build_user_message(context: SessionReportContext) -> str:
    transcript = "\n".join(f"- {line}" for line in context.transcript_lines) or "(no transcript captured)"
    goal = context.goal or "(not specified)"
    level = context.level or "(unknown)"
    notes = context.teacher_notes or "(none)"
    return (
        f"Lesson topic: {context.topic_title}\n"
        f"Instructor: {context.instructor_name}\n"
        f"Duration (minutes): {context.duration_minutes}\n"
        f"Student goal: {goal}\n"
        f"Current level (context only — do NOT restate it): {level}\n"
        f"Teacher notes: {notes}\n\n"
        f"Finalized transcript:\n{transcript}"
    )
