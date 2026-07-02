"""
Placement-assessment prompt: versioned template + builder.

The template owns ALL prompt text (moved out of the provider). The builder turns
an `AssessmentInput` — and ONLY an AssessmentInput (written answers, speaking
transcript, goal) — into messages. No PII / ids / secrets ever enter the prompt.
"""
from __future__ import annotations

from domain.placement.assessment.provider import AssessmentInput

from .base import PromptBuilder, PromptMessages, PromptTemplate, PromptVersion

# The JSON contract the model must return (documentation + reviewability; the
# authoritative validation lives in domain/placement/assessment/schema.py).
_EXPECTED_OUTPUT_SCHEMA = {
    "type": "object",
    "required": [
        "cefrLevel", "grammarScore", "vocabularyScore", "fluencyScore",
        "confidenceScore", "strengths", "weaknesses", "recommendedTopics",
        "recommendedInstructorDifficulty",
    ],
    "properties": {
        "cefrLevel": {"enum": ["A1", "A2", "B1", "B2", "C1"]},
        "grammarScore": {"type": "integer", "minimum": 0, "maximum": 100},
        "vocabularyScore": {"type": "integer", "minimum": 0, "maximum": 100},
        "fluencyScore": {"type": "integer", "minimum": 0, "maximum": 100},
        "confidenceScore": {"type": "integer", "minimum": 0, "maximum": 100},
        "strengths": {"type": "array", "items": {"type": "string"}},
        "weaknesses": {"type": "array", "items": {"type": "string"}},
        "recommendedTopics": {"type": "array", "items": {"type": "string"}},
        "recommendedInstructorDifficulty": {"enum": ["supportive", "balanced", "challenging"]},
    },
    "additionalProperties": False,
}

_SYSTEM_MESSAGE = (
    "You are an English placement assessor. You evaluate a student's English from "
    "their written answers and the transcript of their spoken interview. "
    "Reply with ONLY a single JSON object and no other text (no prose, no markdown, "
    "no code fences, no explanation)."
)

_INSTRUCTION_MESSAGE = (
    "Return EXACTLY these keys and nothing else: cefrLevel (one of A1, A2, B1, B2, "
    "C1), grammarScore, vocabularyScore, fluencyScore, confidenceScore (integers "
    "0-100), strengths (array of strings), weaknesses (array of strings), "
    "recommendedTopics (array of strings), recommendedInstructorDifficulty (one of "
    "supportive, balanced, challenging). Do not add unknown fields. Do not include "
    "free-form explanation. Do not change or restate business rules — the system's "
    "business rules (for example the spoken-performance CEFR cap) override your "
    "output, so provide your best per-dimension assessment and let the system "
    "finalize the level."
)

PLACEMENT_ASSESSMENT_TEMPLATE = PromptTemplate(
    prompt_id="placement.assessment",
    purpose="Assess placement written answers + speaking transcript into structured scores.",
    system_message=_SYSTEM_MESSAGE,
    instruction_message=_INSTRUCTION_MESSAGE,
    expected_output_schema=_EXPECTED_OUTPUT_SCHEMA,
    version=PromptVersion(
        version="2026-07-01.v1",
        review_note="Sprint 4.5: extracted from OpenAIAssessmentProvider; text unchanged in intent.",
    ),
)


class PlacementAssessmentPromptBuilder(PromptBuilder):
    def __init__(self, template: PromptTemplate = PLACEMENT_ASSESSMENT_TEMPLATE):
        self._template = template

    @property
    def template(self) -> PromptTemplate:
        return self._template

    def build(self, context: AssessmentInput) -> PromptMessages:
        # Accept ONLY an AssessmentInput — its fields are exactly written/spoken/goal,
        # so no ids, email, or other PII can reach the prompt by construction.
        if not isinstance(context, AssessmentInput):
            raise TypeError("PlacementAssessmentPromptBuilder requires an AssessmentInput.")
        return PromptMessages(
            system=self._template.system_message,
            instruction=self._template.instruction_message,
            user=_build_user_message(context),
        )


def _build_user_message(assessment_input: AssessmentInput) -> str:
    written = "\n".join(f"- {a.answer_text}" for a in assessment_input.written) or "(none)"
    spoken = "\n".join(f"- {a.transcript}" for a in assessment_input.spoken) or "(none)"
    goal = assessment_input.goal or "(not specified)"
    return (
        f"Student goal: {goal}\n\n"
        f"Written answers:\n{written}\n\n"
        f"Speaking transcript:\n{spoken}"
    )
