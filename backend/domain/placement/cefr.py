"""
Pure CEFR mapping, section weighting, and the spoken-cap rule (Phase 8B).

Placement produces one of five levels: A1, A2, B1, B2, C1.
The spoken section dominates the blend, and a weak spoken performance caps the
final level regardless of how strong the written section is.

All thresholds are module constants so they can be retuned without touching the
logic. (Infrastructure may later override them from settings, but the domain
stays framework-free.)
"""
from __future__ import annotations

# Five-level CEFR ladder used by placement (no A0, no C2).
LEVELS: tuple[str, ...] = ("A1", "A2", "B1", "B2", "C1")

# Score → level bands as (inclusive upper bound, level). Tunable.
BANDS: tuple[tuple[int, str], ...] = (
    (35, "A1"),
    (52, "A2"),
    (69, "B1"),
    (85, "B2"),
    (100, "C1"),
)

# Section weights — spoken dominates final conversation readiness.
SPOKEN_WEIGHT: float = 0.60
WRITTEN_WEIGHT: float = 0.40

# Spoken-cap thresholds (match the A2 / B1 band lower bounds).
A2_MIN_SCORE: int = 36  # spoken below this (i.e. A1) → final capped at A2
B1_MIN_SCORE: int = 53  # spoken below this (A1/A2)  → final capped at B1


def clamp_score(value) -> int:
    try:
        return max(0, min(100, int(round(float(value)))))
    except (TypeError, ValueError):
        return 0


def level_index(level: str) -> int:
    try:
        return LEVELS.index(level)
    except ValueError:
        return 0


def level_for_score(score) -> str:
    """Map a 0–100 score to a CEFR level using BANDS."""
    pct = clamp_score(score)
    for ceiling, level in BANDS:
        if pct <= ceiling:
            return level
    return LEVELS[-1]


def cap_level(level: str, ceiling: str) -> str:
    """Return `level` lowered to `ceiling` if it sits above it."""
    return level if level_index(level) <= level_index(ceiling) else ceiling


def weighted_overall(written_score, spoken_score) -> int:
    """Blend written + spoken with spoken dominant. Clamped 0–100."""
    w = clamp_score(written_score)
    s = clamp_score(spoken_score)
    total = SPOKEN_WEIGHT + WRITTEN_WEIGHT
    if total <= 0:
        blended = (w + s) / 2.0
    else:
        blended = (s * SPOKEN_WEIGHT + w * WRITTEN_WEIGHT) / total
    return clamp_score(blended)


def spoken_ceiling(spoken_score) -> str:
    """The highest CEFR level the spoken performance permits (the cap)."""
    s = clamp_score(spoken_score)
    if s < A2_MIN_SCORE:
        return "A2"
    if s < B1_MIN_SCORE:
        return "B1"
    return "C1"  # no effective cap within the A1–C1 ladder


def final_level(written_score, spoken_score) -> tuple[str, int, bool, str]:
    """Compute the final placement level.

    Returns (level, overall_conversation_score, was_capped, ceiling).
    The level is the band of the spoken-dominant blend, then lowered to the
    spoken ceiling when the spoken section is weak.
    """
    overall = weighted_overall(written_score, spoken_score)
    blended_level = level_for_score(overall)
    ceiling = spoken_ceiling(spoken_score)
    capped = cap_level(blended_level, ceiling)
    return capped, overall, capped != blended_level, ceiling
