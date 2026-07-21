"""OpenAI Realtime API integration for the live voice-call AI tutor.

The browser must NOT use OPENAI_API_KEY directly (it would leak the long-lived
secret). Instead the server mints a short-lived ephemeral ``client_secret`` via
OpenAI's ``/v1/realtime/client_secrets`` endpoint; the browser then opens a WebRTC
peer connection to the Realtime API with that token. OpenAI handles the microphone
audio (server-side VAD + Whisper transcription) and streams a natural voice back —
so there is no browser TTS/STT, no echo loop, and no per-turn latency.

Public:
    build_voice_system_prompt(student) -> str
    coerce_voice(voice) -> str
    request_ephemeral_session(*, system_prompt, voice) -> dict
    relay_sdp(*, client_secret, sdp) -> (status_code, content, content_type)
"""
from __future__ import annotations

import logging

import httpx
from django.conf import settings

logger = logging.getLogger("ai_tutor.realtime")


class RealtimeNotConfigured(RuntimeError):
    """OPENAI_API_KEY is missing on the server."""


class RealtimeUpstreamError(RuntimeError):
    """OpenAI rejected the ephemeral-session request; carries the real message."""

    def __init__(self, status_code: int, body: str):
        self.status_code = status_code
        self.body = body
        super().__init__(f"openai_{status_code}: {body[:300]}")

# Voices the GA Realtime API accepts. Retired Beta voices map to a GA equivalent.
REALTIME_VOICES = {"alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"}
_FEMALE_DEFAULT = "shimmer"
_MALE_DEFAULT = "ash"
_GENDER_ALIASES = {"female": _FEMALE_DEFAULT, "male": _MALE_DEFAULT, "woman": _FEMALE_DEFAULT, "man": _MALE_DEFAULT}


def coerce_voice(voice: str) -> str:
    """Normalise a requested voice (id or 'female'/'male') to a supported one."""
    v = (voice or "").strip().lower()
    if v in REALTIME_VOICES:
        return v
    if v in _GENDER_ALIASES:
        return _GENDER_ALIASES[v]
    return getattr(settings, "AI_REALTIME_VOICE", "alloy")


def build_voice_system_prompt(student) -> str:
    """A spoken-English tutor prompt. Output becomes audio, so: short replies, no
    markdown, contractions, natural fillers, and the student should talk more."""
    level = (getattr(student, "level", "") or "B1")[:2].upper()
    name = "Alex"
    if level in ("A0", "A1"):
        level_rule = "The student is a beginner. Use very simple words and short sentences; if they get stuck, give the first words to start."
    elif level == "A2":
        level_rule = "The student is elementary. Use everyday words and simple grammar, and encourage them often."
    elif level in ("B1", "B2"):
        level_rule = "Have a real conversation with natural connectors. Correct only the single most important error each turn."
    else:
        level_rule = "Aim for fluent, natural English; only correct slips that change meaning."
    return f"""# Identity
You are {name}, a warm, patient English tutor on a LIVE VOICE CALL with a student
from Sudan. You are a real teacher on a phone call, not a chatbot.

# How you speak — critical (your output becomes audio)
- Use contractions ("you're", "don't", "it's") and occasional natural fillers ("well…", "okay so", "right").
- Keep replies SHORT: one to three sentences. Never monologue. The student should talk more than you.
- React like a human ("Oh nice!", "Wait, really?").
- NEVER use markdown, bullet points, asterisks, emojis, or read punctuation aloud.
- Say numbers as words.

# Teaching
React to the content first, then gently model ONE fix without lecturing
(Student: "I go to beach yesterday" → You: "Ah, you went to the beach yesterday — nice! What did you do there?").
Keep any Arabic to at most one short sentence; English is the goal.

# Level
{level_rule}

# Rules
Never say "as an AI" or break character. If they want to stop, wish them well warmly in one sentence.

# Opening line
Start warm and specific: "Hey! It's {name}. How's your day going so far?"
"""


def request_ephemeral_session(*, system_prompt: str, voice: str = "alloy") -> dict:
    """Mint a short-lived client_secret for a browser WebRTC session. Raises on
    misconfiguration / upstream error (the caller maps it to a 503)."""
    api_key = getattr(settings, "OPENAI_API_KEY", "") or ""
    if not api_key:
        raise RealtimeNotConfigured("OPENAI_API_KEY is not configured")

    base = getattr(settings, "OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")
    payload = {
        "session": {
            "type": "realtime",
            "model": getattr(settings, "AI_REALTIME_MODEL", "gpt-realtime"),
            "instructions": system_prompt,
            "max_output_tokens": 200,
            "audio": {
                "output": {"voice": coerce_voice(voice)},
                "input": {
                    "transcription": {"model": "whisper-1"},
                    # Server-side VAD: OpenAI detects end-of-utterance and auto-replies
                    # when the student stops talking (natural 700ms pause).
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 700,
                    },
                },
            },
        }
    }
    try:
        resp = httpx.post(
            f"{base}/realtime/client_secrets",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
            timeout=10,
        )
    except httpx.HTTPError as exc:
        logger.error("realtime client_secrets transport error — %s", exc)
        raise RealtimeUpstreamError(0, f"Could not reach OpenAI: {exc}") from exc
    if resp.is_error:
        logger.error("realtime client_secrets %s — %s", resp.status_code, resp.text[:600])
        raise RealtimeUpstreamError(resp.status_code, resp.text)
    body = resp.json()
    session = body.get("session") or {}
    return {
        "client_secret": body.get("value") or "",
        "session_id": session.get("id") or body.get("id") or "",
        "expires_at": body.get("expires_at") or session.get("expires_at"),
        "model": session.get("model") or getattr(settings, "AI_REALTIME_MODEL", ""),
    }


def relay_sdp(*, client_secret: str, sdp: str):
    """Relay the browser's SDP offer to OpenAI Realtime and return its SDP answer.
    Keeping this server-side avoids CORS/CSP issues and surfaces upstream errors.
    Returns (status_code, content_bytes, content_type)."""
    base = getattr(settings, "OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")
    try:
        upstream = httpx.post(
            f"{base}/realtime/calls",
            content=sdp,  # raw SDP body (httpx uses ``content=`` for a non-form body)
            headers={"Authorization": f"Bearer {client_secret}", "Content-Type": "application/sdp"},
            timeout=15,
        )
    except httpx.HTTPError as exc:
        logger.error("realtime SDP relay transport error — %s", exc)
        return 502, f"Could not reach OpenAI: {exc}".encode(), "text/plain"
    if upstream.is_error:
        logger.error("realtime SDP relay %s — %s", upstream.status_code, upstream.text[:400])
    return upstream.status_code, upstream.content, upstream.headers.get("Content-Type", "application/sdp")
