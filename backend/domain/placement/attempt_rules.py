"""
Pure attempt rules (Phase 8B) — no Django, no persistence.

Encodes the approved decisions:
  * exactly ONE valid spoken attempt
  * an admin-audited reset is required before another spoken attempt
  * the written section may be retaken freely
  * the final result is versioned per attempt
  * both sections must be complete before assessment
  * answers may only reference fixed, known placement questions

These functions take primitive flags/values (the application layer reads them
from persistence) and return booleans or raise domain exceptions.
"""
from __future__ import annotations

from domain.exceptions import (
    InvalidPlacementQuestion,
    PlacementIncomplete,
    PlacementResetRequired,
    SpokenAttemptAlreadyUsed,
)


# ── spoken one-shot + admin reset ─────────────────────────────────────────────
def spoken_attempt_available(*, used: bool, reset_after_use: bool) -> bool:
    """True when the student may answer the spoken section.

    Available if it was never used, or an admin reset happened *after* it was
    used (``reset_after_use``).
    """
    return (not used) or reset_after_use


def ensure_spoken_attempt_available(*, used: bool, reset_after_use: bool) -> None:
    """Raise when the spoken section can't be answered (already used, no reset)."""
    if not spoken_attempt_available(used=used, reset_after_use=reset_after_use):
        raise SpokenAttemptAlreadyUsed()


def ensure_can_start_new_spoken(*, used: bool, reset_after_use: bool) -> None:
    """Starting a *new* spoken attempt after one was used requires an admin reset."""
    if used and not reset_after_use:
        raise PlacementResetRequired()


def apply_admin_reset(*, used: bool) -> bool:
    """Return the ``reset_after_use`` flag produced by an audited admin reset.

    Pure: a reset only matters once an attempt was actually used.
    """
    return bool(used)


# ── written retake ────────────────────────────────────────────────────────────
def written_retake_allowed() -> bool:
    """The written section may always be retaken."""
    return True


# ── result versioning ─────────────────────────────────────────────────────────
def next_result_version(previous_versions: int) -> int:
    """Final results are versioned per attempt; the first is version 1."""
    return max(0, int(previous_versions or 0)) + 1


# ── completeness ──────────────────────────────────────────────────────────────
def is_placement_complete(*, written_submitted: bool, spoken_submitted: bool) -> bool:
    return bool(written_submitted) and bool(spoken_submitted)


def ensure_placement_complete(*, written_submitted: bool, spoken_submitted: bool) -> None:
    if not is_placement_complete(
        written_submitted=written_submitted, spoken_submitted=spoken_submitted
    ):
        raise PlacementIncomplete()


# ── question validation (fixed known set only) ────────────────────────────────
def ensure_known_questions(answered_ids, allowed_ids) -> None:
    """Every answered question id must be in the fixed known placement set.

    Enforces "no AI-generated placement questions" at the domain boundary.
    """
    allowed = set(allowed_ids or [])
    for qid in answered_ids or []:
        if qid not in allowed:
            raise InvalidPlacementQuestion(
                f"Question '{qid}' is not part of the placement set."
            )
