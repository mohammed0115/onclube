"""
Pure text-signal extraction from a written answer or a spoken transcript.

Deterministic, stdlib-only. These signals feed the grammar / vocabulary /
fluency / confidence heuristics. No audio, no pronunciation, no AI.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

# Filler / hesitation tokens that may survive STT (e.g. "um", "uh", "like").
HESITATION_MARKERS = frozenset(
    {"um", "uh", "umm", "uhm", "erm", "hmm", "mmm", "eh", "er", "like", "well"}
)
# Cheap "assertiveness" cues — used only as a confidence proxy.
ASSERTIVE_PHRASES = (
    "i am", "i'm", "i will", "i'll", "i can", "i believe", "i think",
    "i would", "i'd", "definitely", "of course", "absolutely", "certainly",
    "sure", "yes", "i know", "in my opinion", "i feel",
)
# Discourse connectors — a coherence proxy.
CONNECTORS = frozenset(
    {
        "because", "so", "then", "but", "and", "however", "therefore",
        "also", "although", "while", "when", "if", "which", "that", "since",
        "after", "before", "first", "finally", "for example",
    }
)

_WORD_RE = re.compile(r"[A-Za-z']+")
_SENTENCE_SPLIT = re.compile(r"[.!?]+")


@dataclass(frozen=True)
class TextSignals:
    word_count: int
    sentence_count: int
    unique_word_count: int
    unique_ratio: float
    avg_word_length: float
    hesitation_count: int
    connector_count: int
    assertive_count: int
    ellipsis_count: int
    has_sentence_punctuation: bool
    is_empty: bool


def extract_signals(text: str) -> TextSignals:
    """Compute deterministic signals from `text`. Empty/None → all-zero."""
    raw = (text or "").strip()
    lower = raw.lower()
    words = _WORD_RE.findall(raw)
    word_count = len(words)
    sentences = [s for s in _SENTENCE_SPLIT.split(raw) if s.strip()]
    unique = {w.lower() for w in words}
    avg_len = sum(len(w) for w in words) / word_count if word_count else 0.0

    hesitation = sum(1 for w in words if w.lower() in HESITATION_MARKERS)
    connectors = sum(1 for w in words if w.lower() in CONNECTORS)
    assertive = sum(lower.count(phrase) for phrase in ASSERTIVE_PHRASES)
    ellipsis = len(re.findall(r"\.\.\.|…", raw))

    return TextSignals(
        word_count=word_count,
        sentence_count=len(sentences),
        unique_word_count=len(unique),
        unique_ratio=round(len(unique) / word_count, 3) if word_count else 0.0,
        avg_word_length=round(avg_len, 2),
        hesitation_count=hesitation,
        connector_count=connectors,
        assertive_count=assertive,
        ellipsis_count=ellipsis,
        has_sentence_punctuation=bool(_SENTENCE_SPLIT.search(raw)),
        is_empty=word_count == 0,
    )
