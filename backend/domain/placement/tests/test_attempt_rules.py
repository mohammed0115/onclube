"""Pure attempt rules: one-shot spoken, admin reset, written retake, versioning."""
import pytest

from domain.exceptions import (
    InvalidPlacementQuestion,
    PlacementIncomplete,
    PlacementResetRequired,
    SpokenAttemptAlreadyUsed,
)
from domain.placement import attempt_rules as ar


# ── spoken one-shot ───────────────────────────────────────────────────────────
def test_spoken_available_when_never_used():
    assert ar.spoken_attempt_available(used=False, reset_after_use=False) is True
    ar.ensure_spoken_attempt_available(used=False, reset_after_use=False)  # no raise


def test_spoken_blocked_after_use():
    assert ar.spoken_attempt_available(used=True, reset_after_use=False) is False
    with pytest.raises(SpokenAttemptAlreadyUsed):
        ar.ensure_spoken_attempt_available(used=True, reset_after_use=False)


def test_starting_new_spoken_after_use_requires_reset():
    with pytest.raises(PlacementResetRequired):
        ar.ensure_can_start_new_spoken(used=True, reset_after_use=False)


# ── admin reset ───────────────────────────────────────────────────────────────
def test_admin_reset_reopens_spoken_attempt():
    reset_flag = ar.apply_admin_reset(used=True)
    assert reset_flag is True
    assert ar.spoken_attempt_available(used=True, reset_after_use=reset_flag) is True
    ar.ensure_spoken_attempt_available(used=True, reset_after_use=reset_flag)  # no raise
    ar.ensure_can_start_new_spoken(used=True, reset_after_use=reset_flag)      # no raise


# ── written retake ────────────────────────────────────────────────────────────
def test_written_retake_always_allowed():
    assert ar.written_retake_allowed() is True


# ── versioning ────────────────────────────────────────────────────────────────
def test_result_versioning_increments():
    assert ar.next_result_version(0) == 1
    assert ar.next_result_version(1) == 2
    assert ar.next_result_version(None) == 1


# ── completeness ──────────────────────────────────────────────────────────────
def test_placement_incomplete_when_a_section_missing():
    assert ar.is_placement_complete(written_submitted=True, spoken_submitted=True) is True
    with pytest.raises(PlacementIncomplete):
        ar.ensure_placement_complete(written_submitted=True, spoken_submitted=False)
    with pytest.raises(PlacementIncomplete):
        ar.ensure_placement_complete(written_submitted=False, spoken_submitted=True)


# ── known-question validation (no AI-generated questions) ─────────────────────
def test_answers_must_reference_known_questions():
    ar.ensure_known_questions(["q1", "q2"], allowed_ids=["q1", "q2", "q3"])  # no raise
    with pytest.raises(InvalidPlacementQuestion):
        ar.ensure_known_questions(["q1", "ai_made_up"], allowed_ids=["q1", "q2"])
