"""
Pure speaking-interview rules (Sprint 2.5) — no Django, no persistence.

The interview is fully isolated from assessment: nothing here references CEFR,
scores, grammar, vocabulary, or recommendations. These functions take primitive
values and return values / raise domain exceptions.
"""
from __future__ import annotations

from domain.exceptions import InterviewIncomplete, TranscriptLocked

VOICE = "voice"
MANUAL = "manual"
_VALID_SOURCES = {VOICE, MANUAL}


def normalize_source(source) -> str:
    """Coerce an answer source to a valid value; default to MANUAL (typed)."""
    s = (source or "").strip().lower()
    return s if s in _VALID_SOURCES else MANUAL


def ensure_can_overwrite(*, existing_source, existing_text, new_text) -> None:
    """A VOICE-captured transcript is locked — it may not be *edited*. Re-saving
    the identical voice transcript is a no-op and allowed (idempotent). A MANUAL
    answer (typed fallback) may always be changed."""
    if existing_source == VOICE and new_text != existing_text:
        raise TranscriptLocked()


def next_question_index(*, current_index, answered_order, total) -> int:
    """The resume point after answering `answered_order` (1-based). Never exceeds
    `total` and never moves backwards."""
    return max(int(current_index or 0), min(int(answered_order), int(total)))


def is_interview_complete(*, answered_count, total) -> bool:
    return total > 0 and int(answered_count) >= int(total)


def ensure_interview_complete(*, answered_count, total) -> None:
    if not is_interview_complete(answered_count=answered_count, total=total):
        raise InterviewIncomplete()
