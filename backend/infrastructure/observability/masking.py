"""
Secret / sensitive-data masking for logs (Sprint 11).

Redacts anything that must NEVER be logged: passwords, tokens, API keys,
certificates, prompts, raw LLM output, uploaded file contents, transcript text,
personal messages, and recordings. Masking is applied to log metadata so a
careless caller cannot leak a secret. Only metadata survives.
"""
from __future__ import annotations

REDACTED = "[REDACTED]"

# Redact a value when its KEY contains any of these (case-insensitive substring).
_SENSITIVE_KEYS = (
    "password", "passwd", "token", "secret", "api_key", "apikey", "authorization",
    "certificate", "cert", "credential", "private", "signature",
    "prompt", "system_message", "instruction", "raw", "completion",
    "transcript", "message", "text", "content", "body", "recording", "receipt",
    "refresh", "access", "session_key",
)

_MAX_STR = 256


def _key_is_sensitive(key: str) -> bool:
    k = str(key).lower()
    return any(s in k for s in _SENSITIVE_KEYS)


def _looks_like_secret(value: str) -> bool:
    v = value.strip()
    if v.lower().startswith("bearer ") or v.lower().startswith("sk-"):
        return True
    # A long, single-token, JWT-ish blob (three dot-separated base64 segments).
    return v.count(".") == 2 and len(v) > 40 and " " not in v


def mask(data):
    """Return a masked copy of `data` (dict/list/scalar). Sensitive keys → REDACTED;
    secret-looking string values → REDACTED; long strings are truncated."""
    if isinstance(data, dict):
        out = {}
        for key, value in data.items():
            if _key_is_sensitive(key):
                out[key] = REDACTED
            else:
                out[key] = mask(value)
        return out
    if isinstance(data, (list, tuple)):
        return [mask(item) for item in data]
    if isinstance(data, str):
        if _looks_like_secret(data):
            return REDACTED
        return data if len(data) <= _MAX_STR else data[:_MAX_STR] + "…"
    return data
