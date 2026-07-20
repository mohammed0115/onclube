"""
OpenAI-backed topic assistant — INFRASTRUCTURE ONLY.

Implements the `suggest_subtopics` / `generate_questions` half of the AIProvider
port with real OpenAI, so an instructor's "Generate suggestions" produces ideas
tailored to their topic title + description (not canned templates).

Design (mirrors OpenAISessionReportProvider):
  * The `fallback` provider (the deterministic StubAIProvider) is used for EVERY
    failure mode — missing key, timeout, unavailable, empty/invalid JSON, any
    exception — so topic building never breaks.
  * score_placement / analyze_session are delegated to the fallback (they have
    their own dedicated providers elsewhere).
  * Prompts / API key / raw responses NEVER leave this module.
"""
from __future__ import annotations

import json
import logging

from application.ports.gateways import AIProvider
from infrastructure.gateways.ai import StubAIProvider

logger = logging.getLogger("topic_assist.openai")


def _chat(*, messages: list, model: str, timeout: float, api_key: str) -> str:
    from openai import OpenAI  # lazy import — optional dependency

    client = OpenAI(api_key=api_key, timeout=timeout)
    completion = client.chat.completions.create(
        model=model,
        timeout=timeout,
        response_format={"type": "json_object"},
        messages=messages,
    )
    return completion.choices[0].message.content or ""


def _clean(items, limit: int) -> list:
    """Keep non-empty unique strings, trimmed, capped to `limit`."""
    out: list[str] = []
    for it in items or []:
        s = str(it).strip()
        if s and s not in out:
            out.append(s)
        if len(out) >= limit:
            break
    return out


class OpenAITopicAssistProvider(AIProvider):
    name = "openai"
    provider_name = "openai"

    def __init__(self, *, fallback: AIProvider | None = None, api_key: str = "",
                 model: str = "gpt-4o-mini", timeout: float = 20, chat=_chat):
        self.fallback = fallback or StubAIProvider()
        self._api_key = api_key or ""
        self._model = model
        self._timeout = timeout
        self._chat = chat

    # ── delegated (have dedicated providers elsewhere) ───────────────────────
    def score_placement(self, *, answers) -> dict:
        return self.fallback.score_placement(answers=answers)

    def analyze_session(self, *, transcript) -> dict:
        return self.fallback.analyze_session(transcript=transcript)

    # ── OpenAI-backed ────────────────────────────────────────────────────────
    def suggest_subtopics(self, *, topic_title, topic_description) -> list:
        return self._generate(
            kind="subtopics",
            topic_title=topic_title,
            topic_description=topic_description,
            instruction=(
                "Propose 5 focused sub-topics an English-conversation instructor could "
                "cover in a session about this topic. Each sub-topic is a short phrase "
                "(3-7 words), specific and practical."
            ),
            limit=5,
            fallback=lambda: self.fallback.suggest_subtopics(
                topic_title=topic_title, topic_description=topic_description
            ),
        )

    def generate_questions(self, *, topic_title, topic_description) -> list:
        return self._generate(
            kind="questions",
            topic_title=topic_title,
            topic_description=topic_description,
            instruction=(
                "Write 5 open-ended discussion questions an instructor could ask a "
                "learner during a spoken English session about this topic. Each is a "
                "full, natural question that invites the learner to speak at length."
            ),
            limit=5,
            fallback=lambda: self.fallback.generate_questions(
                topic_title=topic_title, topic_description=topic_description
            ),
        )

    def _generate(self, *, kind, topic_title, topic_description, instruction, limit, fallback) -> list:
        if not self._api_key:
            return fallback()
        try:
            system = (
                "You help English-conversation instructors prepare session material. "
                'Respond ONLY as JSON of the exact shape {"items": ["...", "..."]}.'
            )
            user = (
                f"Topic title: {topic_title}\n"
                f"Topic description: {topic_description or '(none)'}\n\n"
                f"{instruction}\n"
                'Return JSON: {"items": [ ... ]}.'
            )
            raw = self._chat(
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                model=self._model, timeout=self._timeout, api_key=self._api_key,
            )
            data = json.loads(raw)
            items = _clean(data.get("items"), limit)
            if not items:
                raise ValueError("empty items")
            return items
        except Exception as exc:  # noqa: BLE001 — any failure falls back
            logger.warning("topic_assist.%s openai failed: %s; using fallback", kind, exc.__class__.__name__)
            return fallback()
