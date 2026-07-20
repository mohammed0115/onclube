"""
AI conversation partner for the 5-minute speaking-practice tutor.

Infrastructure only: OpenAI chat when a key is configured, otherwise a
deterministic heuristic partner so the feature always works (dev / no-key). The
domain/application never import OpenAI directly.
"""
from __future__ import annotations

import logging

from django.conf import settings

logger = logging.getLogger("ai_tutor.openai")

_SYSTEM = (
    "You are a warm, encouraging English speaking-practice partner for a short "
    "(5-minute) session. Keep every reply to 1-2 short sentences. Always end with "
    "a simple follow-up question to keep the student talking. Gently model correct "
    "phrasing when the student makes a mistake, without lecturing. Be friendly and "
    "natural. Never write more than ~40 words."
)

# Deterministic fallback prompts — varied by turn so practice keeps moving.
_FOLLOWUPS = [
    "That's great — can you tell me a bit more about it?",
    "Nice! Why do you feel that way?",
    "Interesting — what happened next?",
    "Good. How would you describe that in your own words?",
    "I see! And what do you enjoy most about it?",
    "Well said. Can you give me an example?",
    "Great effort! What would you like to talk about next?",
]


def _opening(topic: str) -> str:
    t = (topic or "").strip()
    if t:
        return f"Hi! Let's practise English by talking about {t}. To start — what comes to mind when you think of {t}?"
    return "Hi! I'm your AI practice partner. Let's have a quick chat — tell me, how has your day been so far?"


def _heuristic_reply(history: list, topic: str) -> str:
    student_turns = sum(1 for m in history if m.get("role") == "student")
    if student_turns == 0:
        return _opening(topic)
    return _FOLLOWUPS[student_turns % len(_FOLLOWUPS)]


def _openai_reply(history: list, topic: str, level: str | None) -> str:
    from openai import OpenAI  # noqa: PLC0415 (lazy optional dependency)

    messages = [{"role": "system", "content": _SYSTEM}]
    if topic:
        messages.append({"role": "system", "content": f"Today's practice topic: {topic}."})
    if level:
        messages.append({"role": "system", "content": f"The student's level is roughly {level}; match it."})
    if not history:
        messages.append({"role": "user", "content": "Please greet me and start the practice."})
    for m in history[-12:]:
        role = "assistant" if m.get("role") == "tutor" else "user"
        messages.append({"role": role, "content": str(m.get("text", ""))})

    client = OpenAI(api_key=settings.OPENAI_API_KEY, timeout=15)
    completion = client.chat.completions.create(
        model=getattr(settings, "OPENAI_MODEL", "gpt-4o-mini"),
        timeout=15,
        max_tokens=120,
        messages=messages,
    )
    return (completion.choices[0].message.content or "").strip()


def generate_tutor_reply(history: list, *, topic: str = "", level: str | None = None) -> str:
    """The tutor's next line given the conversation so far. `history` is a list of
    {"role": "tutor"|"student", "text": str}. Never raises — falls back to the
    heuristic partner on any error."""
    if getattr(settings, "OPENAI_API_KEY", ""):
        try:
            reply = _openai_reply(history, topic, level)
            if reply:
                return reply
        except Exception:  # noqa: BLE001 — any failure → heuristic, never break practice
            logger.warning("ai_tutor: OpenAI reply failed; using heuristic", exc_info=False)
    return _heuristic_reply(history, topic)
