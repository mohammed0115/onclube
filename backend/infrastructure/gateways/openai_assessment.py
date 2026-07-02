"""
OpenAI-backed assessment provider — INFRASTRUCTURE ONLY.

Implements the domain `AssessmentProvider` interface. All OpenAI/HTTP/JSON I/O
lives here; the domain and application layers never import this module directly —
only the composition root (container) may select it.

This provider does NOT own prompt text (Sprint 4.5): it receives built messages
from a `PromptBuilder`, calls the model, and hands the raw response to domain
validation. It only:
  * builds messages via the injected prompt builder
  * calls the model
  * validates the structured response (schema) → DTO
  * falls back to the heuristic on ANY failure

Guarantees:
  * The heuristic is the fallback for EVERY failure mode (missing key, timeout,
    unavailable, empty response, invalid JSON, schema failure, missing/invalid
    prompt template, any exception). An OpenAI failure never breaks placement.
  * Prompts, API key, provider config, and the raw response NEVER leave this
    module and are NEVER placed on the returned DTO. Full prompts / raw responses
    are not logged.
  * Only the minimum input is sent (written answers, transcript, goal) — enforced
    by the prompt builder, which accepts only an AssessmentInput.
"""
from __future__ import annotations

import json
import logging

from domain.placement.assessment.provider import AssessmentInput, AssessmentProvider
from domain.placement.assessment.schema import parse_assessment_payload
from domain.placement.dtos import PlacementAssessmentResult
from infrastructure.prompts import PlacementAssessmentPromptBuilder, PromptBuilder

logger = logging.getLogger("assessment.openai")


class _ProviderUnavailable(RuntimeError):
    """Raised internally when the provider cannot produce a usable response."""


def _default_chat(*, messages: list, model: str, timeout: float, api_key: str) -> str:
    # Lazily import the SDK so `openai` is an optional dependency and never a hard
    # requirement for tests or local dev. Any failure here bubbles up → fallback.
    from openai import OpenAI  # noqa: PLC0415 (intentional lazy import)

    client = OpenAI(api_key=api_key, timeout=timeout)
    completion = client.chat.completions.create(
        model=model,
        timeout=timeout,
        response_format={"type": "json_object"},
        messages=messages,
    )
    return completion.choices[0].message.content or ""


class OpenAIAssessmentProvider(AssessmentProvider):
    name = "openai"

    def __init__(self, *, fallback: AssessmentProvider, api_key: str = "",
                 model: str = "gpt-4o-mini", timeout: float = 20,
                 prompt_builder: PromptBuilder | None = None, chat=None):
        # `fallback` is mandatory — the provider must always degrade gracefully.
        self.fallback = fallback
        self._api_key = api_key or ""
        self._model = model
        self._timeout = timeout
        self._prompt_builder = prompt_builder or PlacementAssessmentPromptBuilder()
        self._chat = chat  # injectable seam for tests; default calls the SDK

    def assess(self, assessment_input: AssessmentInput) -> PlacementAssessmentResult:
        try:
            if not self._api_key:
                raise _ProviderUnavailable("missing api key")
            # Prompt construction is owned by the builder, not this provider.
            messages = self._prompt_builder.build(assessment_input).to_openai_messages()
            raw = self._invoke(messages)
            if not raw or not raw.strip():
                raise _ProviderUnavailable("empty response")
            data = json.loads(raw)  # invalid JSON → JSONDecodeError → fallback
            return parse_assessment_payload(data, source=self.name)
        except Exception as exc:  # noqa: BLE001 — degrade on ANY failure
            # Log the failure TYPE only — never the prompt, input, or raw response.
            logger.warning("OpenAI assessment failed (%s); using heuristic fallback", type(exc).__name__)
            return self.fallback.assess(assessment_input)

    def _invoke(self, messages: list) -> str:
        chat = self._chat or _default_chat
        return chat(messages=messages, model=self._model, timeout=self._timeout, api_key=self._api_key)
