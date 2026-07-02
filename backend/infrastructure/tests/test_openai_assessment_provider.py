"""
OpenAIAssessmentProvider tests (Sprint 4) — mocked OpenAI only, never real.

Covers the full fallback matrix, provider success, purity/isolation guarantees,
prompt/response non-exposure, and composition-root provider selection.
"""
import json
import pathlib

import pytest
from django.test import override_settings

from domain.placement.assessment import (
    AssessmentInput,
    HeuristicAssessmentProvider,
    PlacementAssessmentEngine,
)
from domain.placement.dtos import PlacementSpokenAnswer, PlacementWrittenAnswer
from infrastructure.gateways.openai_assessment import OpenAIAssessmentProvider
from infrastructure.prompts import PLACEMENT_ASSESSMENT_TEMPLATE

VALID_JSON = json.dumps({
    "cefrLevel": "B1",
    "grammarScore": 72,
    "vocabularyScore": 68,
    "fluencyScore": 61,
    "confidenceScore": 64,
    "strengths": ["clear structure"],
    "weaknesses": ["articles"],
    "recommendedTopics": ["work", "travel"],
    "recommendedInstructorDifficulty": "balanced",
})


def _input():
    return AssessmentInput.from_answers(
        [PlacementWrittenAnswer(question_id="w1", answer_text="I am an engineer.")],
        [PlacementSpokenAnswer(question_id="s1", transcript="I like to travel a lot.")],
        goal="career",
    )


def _provider(chat):
    return OpenAIAssessmentProvider(
        fallback=HeuristicAssessmentProvider(), api_key="sk-test", chat=chat
    )


# ── 1. success ────────────────────────────────────────────────────────────────
def test_success_with_valid_json():
    provider = _provider(lambda **kw: VALID_JSON)
    result = provider.assess(_input())
    assert result.source == "openai"
    assert result.cefr_level == "B1"
    assert result.grammar_score == 72


# ── 2–4, 8. fallback on bad output ────────────────────────────────────────────
def test_invalid_json_falls_back_to_heuristic():
    result = _provider(lambda **kw: "this is not json").assess(_input())
    assert result.source == "heuristic"


def test_missing_required_field_falls_back():
    bad = json.dumps({"cefrLevel": "B1"})  # missing the rest
    assert _provider(lambda **kw: bad).assess(_input()).source == "heuristic"


def test_invalid_cefr_falls_back():
    bad = json.loads(VALID_JSON)
    bad["cefrLevel"] = "C2"
    assert _provider(lambda **kw: json.dumps(bad)).assess(_input()).source == "heuristic"


# ── 5–7. fallback on provider failure ─────────────────────────────────────────
def test_timeout_falls_back():
    def chat(**kw):
        raise TimeoutError("timed out")

    assert _provider(chat).assess(_input()).source == "heuristic"


def test_provider_exception_falls_back():
    def chat(**kw):
        raise RuntimeError("service unavailable / rate limited")

    assert _provider(chat).assess(_input()).source == "heuristic"


def test_empty_response_falls_back():
    assert _provider(lambda **kw: "").assess(_input()).source == "heuristic"


def test_missing_api_key_uses_heuristic_without_calling_openai():
    called = {"n": 0}

    def chat(**kw):
        called["n"] += 1
        return VALID_JSON

    provider = OpenAIAssessmentProvider(fallback=HeuristicAssessmentProvider(), api_key="", chat=chat)
    result = provider.assess(_input())
    assert result.source == "heuristic"
    assert called["n"] == 0  # OpenAI never invoked without a key


# ── only the minimum data is sent ─────────────────────────────────────────────
def test_only_minimum_data_is_sent_to_openai():
    seen = {}

    def chat(**kw):
        seen.update(kw)
        return VALID_JSON

    _provider(chat).assess(_input())
    blob = " ".join(m["content"] for m in seen["messages"])
    assert "I am an engineer." in blob and "I like to travel a lot." in blob and "career" in blob
    # No ids / secrets / model objects in the outbound messages.
    for banned in ("question_id", "sk-test", "password", "jwt", "email"):
        assert banned not in blob.lower()


# ── prompt / raw response never exposed ───────────────────────────────────────
def test_prompt_and_raw_response_never_on_result_dto():
    import dataclasses

    result = _provider(lambda **kw: VALID_JSON).assess(_input())
    flat = str(dataclasses.asdict(result)).lower()
    assert PLACEMENT_ASSESSMENT_TEMPLATE.system_message.lower()[:40] not in flat
    assert "you are an english placement assessor" not in flat
    assert "sk-test" not in flat


# ── 8–9. domain + application purity ──────────────────────────────────────────
def test_domain_and_application_never_import_openai():
    backend = pathlib.Path(__file__).resolve().parents[2]
    for layer in ("domain", "application"):
        for py in (backend / layer).rglob("*.py"):
            if "/tests/" in str(py) or py.name.startswith("test_"):
                continue
            src = py.read_text(encoding="utf-8").lower()
            # No OpenAI/HTTP-client IMPORTS in the domain/application layers.
            for banned in ("import openai", "from openai", "import requests", "import httpx"):
                assert banned not in src, f"{py} contains `{banned}`"


# ── composition-root selection ────────────────────────────────────────────────
@override_settings(OPENAI_API_KEY="sk-test", OPENAI_MODEL="gpt-4o-mini", OPENAI_TIMEOUT_SECONDS=10)
def test_container_selects_openai_when_key_present():
    from infrastructure.container import default_assessment_engine

    engine = default_assessment_engine()
    assert isinstance(engine, PlacementAssessmentEngine)
    assert isinstance(engine.provider, OpenAIAssessmentProvider)
    # And the fallback is the heuristic.
    assert isinstance(engine.provider.fallback, HeuristicAssessmentProvider)


@override_settings(OPENAI_API_KEY="")
def test_container_uses_heuristic_when_key_absent():
    from infrastructure.container import default_assessment_engine

    engine = default_assessment_engine()
    assert isinstance(engine.provider, HeuristicAssessmentProvider)


# ── provider integration with the prompt builder ─────────────────────────────
def test_provider_uses_the_prompt_builder():
    from infrastructure.prompts import PlacementAssessmentPromptBuilder

    calls = {"contexts": []}

    class SpyBuilder(PlacementAssessmentPromptBuilder):
        def build(self, context):
            calls["contexts"].append(context)
            return super().build(context)

    seen = {}

    def chat(**kw):
        seen.update(kw)
        return VALID_JSON

    provider = OpenAIAssessmentProvider(
        fallback=HeuristicAssessmentProvider(), api_key="sk-test",
        prompt_builder=SpyBuilder(), chat=chat,
    )
    result = provider.assess(_input())
    assert result.source == "openai"
    # The builder was invoked with the AssessmentInput...
    assert len(calls["contexts"]) == 1
    assert isinstance(calls["contexts"][0], AssessmentInput)
    # ...and the provider forwarded built messages to the model.
    assert isinstance(seen["messages"], list) and seen["messages"][0]["role"] == "system"


def test_invalid_prompt_template_fails_safely_to_heuristic():
    class BrokenBuilder:
        def build(self, context):
            raise ValueError("template missing/invalid")

    provider = OpenAIAssessmentProvider(
        fallback=HeuristicAssessmentProvider(), api_key="sk-test",
        prompt_builder=BrokenBuilder(), chat=lambda **kw: VALID_JSON,
    )
    assert provider.assess(_input()).source == "heuristic"
