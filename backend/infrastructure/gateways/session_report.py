"""
OpenAI-backed session-report provider — INFRASTRUCTURE ONLY.

Implements the domain `SessionReportProvider` port. All OpenAI/HTTP/JSON I/O lives
here; the domain and application layers never import this module directly — only
the composition root (container) may select it.

It does NOT own prompt text: it receives built messages from a `PromptBuilder`,
calls the model, and hands the raw response to domain validation
(`parse_session_report_payload`).

Guarantees:
  * The heuristic is the fallback for EVERY failure mode (missing key, timeout,
    unavailable, empty response, invalid JSON, missing field, schema failure, any
    exception). An OpenAI failure never breaks report generation.
  * Prompts, API key, provider config, and the raw response NEVER leave this module
    and are NEVER placed on the returned report. Full prompts / raw responses are
    not logged. Chain-of-thought is never requested or returned.
"""
from __future__ import annotations

import dataclasses
import json
import logging

from domain.session_report.heuristic import HeuristicSessionReportProvider
from domain.session_report.provider import (
    GeneratedSessionReport,
    SessionReportContext,
    SessionReportProvider,
)
from domain.session_report.schema import parse_session_report_payload
from infrastructure.prompts import PromptBuilder, SessionReportPromptBuilder

logger = logging.getLogger("session_report.openai")


class _ProviderUnavailable(RuntimeError):
    """Raised internally when the provider cannot produce a usable response."""


def _default_chat(*, messages: list, model: str, timeout: float, api_key: str) -> str:
    from openai import OpenAI  # noqa: PLC0415 (intentional lazy import — optional dep)

    client = OpenAI(api_key=api_key, timeout=timeout)
    completion = client.chat.completions.create(
        model=model,
        timeout=timeout,
        response_format={"type": "json_object"},
        messages=messages,
    )
    return completion.choices[0].message.content or ""


class OpenAISessionReportProvider(SessionReportProvider):
    name = "openai"

    def __init__(self, *, fallback: SessionReportProvider | None = None, api_key: str = "",
                 model: str = "gpt-4o-mini", timeout: float = 20,
                 prompt_builder: PromptBuilder | None = None, chat=None):
        # `fallback` is mandatory in spirit — default to the heuristic so the
        # provider always degrades gracefully.
        self.fallback = fallback or HeuristicSessionReportProvider()
        self._api_key = api_key or ""
        self._model = model
        self._timeout = timeout
        self._prompt_builder = prompt_builder or SessionReportPromptBuilder()
        self._chat = chat  # injectable seam for tests; default calls the SDK

    def generate(self, *, context: SessionReportContext) -> GeneratedSessionReport:
        try:
            if not self._api_key:
                raise _ProviderUnavailable("missing api key")
            messages = self._prompt_builder.build(context).to_openai_messages()
            raw = self._invoke(messages)
            if not raw or not raw.strip():
                raise _ProviderUnavailable("empty response")
            data = json.loads(raw)  # invalid JSON → JSONDecodeError → fallback
            content = parse_session_report_payload(data)  # schema failure → fallback
            return GeneratedSessionReport(content=content, provider_name=self.name, fallback_used=False)
        except Exception as exc:  # noqa: BLE001 — degrade on ANY failure
            # Log the failure TYPE only — never the prompt, input, or raw response.
            logger.warning("OpenAI session report failed (%s); using heuristic fallback", type(exc).__name__)
            fb = self.fallback.generate(context=context)
            return dataclasses.replace(fb, fallback_used=True)

    def _invoke(self, messages: list) -> str:
        chat = self._chat or _default_chat
        return chat(messages=messages, model=self._model, timeout=self._timeout, api_key=self._api_key)
