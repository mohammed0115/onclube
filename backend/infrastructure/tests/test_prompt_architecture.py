"""
Prompt architecture tests (Sprint 4.5).

Prompts are internal, versioned, server-side assets. The builder consumes only an
AssessmentInput and never emits PII/ids. Domain/application never import prompts.
"""
import pathlib

import pytest

from domain.placement.assessment import AssessmentInput
from domain.placement.dtos import PlacementSpokenAnswer, PlacementWrittenAnswer
from infrastructure.prompts import (
    PLACEMENT_ASSESSMENT_TEMPLATE,
    PlacementAssessmentPromptBuilder,
    PromptTemplate,
    PromptVersion,
)


def _input():
    return AssessmentInput.from_answers(
        [PlacementWrittenAnswer(question_id="w1", answer_text="I fixed a bug at work today.")],
        [PlacementSpokenAnswer(question_id="s1", transcript="I enjoy playing football.")],
        goal="career",
    )


# 1. version metadata
def test_template_has_version_metadata():
    t = PLACEMENT_ASSESSMENT_TEMPLATE
    assert t.prompt_id == "placement.assessment"
    assert isinstance(t.version, PromptVersion)
    assert t.version.version and t.version.review_note
    assert t.purpose and t.system_message and t.instruction_message
    assert t.expected_output_schema["required"]  # documents the contract


# 2. builder uses only AssessmentInput
def test_builder_requires_assessment_input():
    builder = PlacementAssessmentPromptBuilder()
    with pytest.raises(TypeError):
        builder.build({"written": [], "spoken": [], "goal": "x"})  # not an AssessmentInput


def test_builder_uses_only_input_fields():
    messages = PlacementAssessmentPromptBuilder().build(_input()).to_openai_messages()
    blob = " ".join(m["content"] for m in messages)
    assert "I fixed a bug at work today." in blob
    assert "I enjoy playing football." in blob
    assert "career" in blob


# 3. required JSON schema instructions present
def test_prompt_states_json_schema_and_rules():
    msgs = PlacementAssessmentPromptBuilder().build(_input()).to_openai_messages()
    blob = " ".join(m["content"] for m in msgs).lower()
    for key in ("cefrlevel", "grammarscore", "vocabularyscore", "fluencyscore",
                "confidencescore", "strengths", "weaknesses", "recommendedtopics",
                "recommendedinstructordifficulty"):
        assert key in blob
    assert "json" in blob
    assert "only" in blob  # JSON only, no free-form
    assert "unknown fields" in blob  # forbid unknown fields
    assert "business rules" in blob and "override" in blob  # rules override model


# 4. no PII / internal fields in the prompt
def test_prompt_excludes_pii_and_internal_ids():
    blob = " ".join(
        m["content"] for m in PlacementAssessmentPromptBuilder().build(_input()).to_openai_messages()
    ).lower()
    for banned in ("password", "jwt", "token", "email", "phone", "question_id", "w1", "s1", "attempt", "student_id"):
        assert banned not in blob


# 8. invalid/missing template fails fast
def test_invalid_template_raises_on_construction():
    with pytest.raises(ValueError):
        PromptTemplate(prompt_id="", purpose="p", system_message="", instruction_message="")


# 7. domain + application never import prompts (or OpenAI)
def test_domain_and_application_do_not_import_prompts():
    backend = pathlib.Path(__file__).resolve().parents[2]
    for layer in ("domain", "application"):
        for py in (backend / layer).rglob("*.py"):
            if "/tests/" in str(py) or py.name.startswith("test_"):
                continue
            src = py.read_text(encoding="utf-8").lower()
            for banned in ("infrastructure.prompts", "import openai", "from openai"):
                assert banned not in src, f"{py} contains `{banned}`"
