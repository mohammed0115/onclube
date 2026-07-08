"""
AI Session Report provider — Sprint 9 (provider abstraction, prompt builder,
schema validation, fallback, invalid JSON, missing field, provider failure).

Pure/adapter tests — no Django DB needed.
"""
import json

import pytest

from domain.exceptions import InvalidSessionReport
from domain.session_report import (
    HeuristicSessionReportProvider,
    SessionReportContext,
    SessionReportProvider,
    parse_session_report_payload,
)
from infrastructure.gateways.session_report import OpenAISessionReportProvider
from infrastructure.prompts import SESSION_REPORT_TEMPLATE, SessionReportPromptBuilder

VALID_PAYLOAD = {
    "overallSummary": "A productive session with steady engagement.",
    "grammarFeedback": "Watch past-tense endings.",
    "vocabularyFeedback": "Good everyday range; add precision.",
    "fluencyFeedback": "Steady pace with natural pauses.",
    "pronunciationFeedback": "Clear and understandable.",
    "strengths": ["Stayed engaged", "Clear ideas"],
    "weaknesses": ["Tense slips"],
    "recommendedTopics": ["Travel", "Small talk"],
    "homework": ["Write five past-tense sentences."],
    "nextLessonFocus": "Reinforce past-tense narration.",
    "confidenceScore": 72,
}


def _context():
    return SessionReportContext(
        topic_title="Job Interview Practice",
        instructor_name="Sarah Mitchell",
        duration_minutes=30,
        goal="career",
        level="B1",
        transcript_lines=("Tell me about yourself.", "I fixed a bug at work today."),
        teacher_notes=None,
    )


def _chat(payload):
    return lambda *, messages, model, timeout, api_key: json.dumps(payload)


# ── provider abstraction ──────────────────────────────────────────────────────
def test_both_adapters_implement_the_port():
    assert isinstance(HeuristicSessionReportProvider(), SessionReportProvider)
    assert isinstance(OpenAISessionReportProvider(api_key="x"), SessionReportProvider)


def test_container_returns_a_session_report_provider():
    from infrastructure.container import default_session_report_provider

    assert isinstance(default_session_report_provider(), SessionReportProvider)


# ── prompt builder ────────────────────────────────────────────────────────────
def test_prompt_template_has_version_metadata_and_schema():
    t = SESSION_REPORT_TEMPLATE
    assert t.prompt_id == "session.report"
    assert t.version.version and t.version.review_note
    assert t.purpose and t.system_message and t.instruction_message
    assert set(t.expected_output_schema["required"]) == {
        "overallSummary", "grammarFeedback", "vocabularyFeedback", "fluencyFeedback",
        "pronunciationFeedback", "strengths", "weaknesses", "recommendedTopics",
        "homework", "nextLessonFocus", "confidenceScore",
    }


def test_prompt_builder_requires_a_context_and_uses_only_its_fields():
    builder = SessionReportPromptBuilder()
    with pytest.raises(TypeError):
        builder.build({"topic": "x"})  # not a SessionReportContext
    blob = " ".join(m["content"] for m in builder.build(_context()).to_openai_messages())
    assert "Job Interview Practice" in blob
    assert "I fixed a bug at work today." in blob
    assert "career" in blob
    # The prompt instructs feedback-only output — no CEFR/grade/attendance.
    assert "CEFR" in blob and "grade" in blob.lower()


# ── schema validation ─────────────────────────────────────────────────────────
def test_schema_parses_a_valid_payload():
    content = parse_session_report_payload(VALID_PAYLOAD)
    assert content.overall_summary.startswith("A productive")
    assert content.confidence_score == 72
    assert content.strengths == ["Stayed engaged", "Clear ideas"]
    # Exactly the 11 fields in the camel dict.
    assert set(content.to_camel_dict()) == set(VALID_PAYLOAD)


def test_schema_rejects_missing_field():
    bad = {k: v for k, v in VALID_PAYLOAD.items() if k != "grammarFeedback"}
    with pytest.raises(InvalidSessionReport):
        parse_session_report_payload(bad)


def test_schema_rejects_malformed_values():
    for mutate in (
        {"confidenceScore": 200},           # out of range
        {"confidenceScore": "high"},        # not a number
        {"strengths": "not a list"},        # wrong type
        {"overallSummary": ""},             # empty string
        {"weaknesses": [1, 2, 3]},          # list of non-strings
    ):
        bad = {**VALID_PAYLOAD, **mutate}
        with pytest.raises(InvalidSessionReport):
            parse_session_report_payload(bad)


# ── heuristic (fallback + default) always valid ───────────────────────────────
def test_heuristic_always_produces_a_valid_report():
    gen = HeuristicSessionReportProvider().generate(context=_context())
    assert gen.provider_name == "heuristic" and gen.fallback_used is False
    d = gen.content.to_camel_dict()
    assert len(d) == 11 and 0 <= d["confidenceScore"] <= 100
    assert d["overallSummary"] and d["nextLessonFocus"]


# ── OpenAI adapter: success + every failure mode falls back ───────────────────
def test_openai_success_returns_validated_content():
    gen = OpenAISessionReportProvider(api_key="sk-test", chat=_chat(VALID_PAYLOAD)).generate(context=_context())
    assert gen.provider_name == "openai" and gen.fallback_used is False
    assert gen.content.confidence_score == 72


def test_openai_missing_key_falls_back():
    gen = OpenAISessionReportProvider(api_key="").generate(context=_context())
    assert gen.provider_name == "heuristic" and gen.fallback_used is True


def test_openai_invalid_json_falls_back():
    chat = lambda *, messages, model, timeout, api_key: "this is not json"
    gen = OpenAISessionReportProvider(api_key="sk-test", chat=chat).generate(context=_context())
    assert gen.fallback_used is True and gen.content.confidence_score >= 0


def test_openai_missing_field_falls_back():
    bad = {k: v for k, v in VALID_PAYLOAD.items() if k != "homework"}
    gen = OpenAISessionReportProvider(api_key="sk-test", chat=_chat(bad)).generate(context=_context())
    assert gen.fallback_used is True


def test_openai_provider_failure_falls_back():
    def boom(*, messages, model, timeout, api_key):
        raise RuntimeError("network down")

    gen = OpenAISessionReportProvider(api_key="sk-test", chat=boom).generate(context=_context())
    assert gen.fallback_used is True and gen.provider_name == "heuristic"


def test_openai_empty_response_falls_back():
    chat = lambda *, messages, model, timeout, api_key: "   "
    gen = OpenAISessionReportProvider(api_key="sk-test", chat=chat).generate(context=_context())
    assert gen.fallback_used is True
