"""
Pure helpers that turn a validated SessionReportContent into the numeric
per-skill rows persisted on `AIReport.skills` ([{label, value, color}]) and the
report's overall score.

No Django, no I/O. Used by the report-generation use case so every ready report
carries comparable per-skill numbers for the progress dashboard.
"""
from __future__ import annotations

# (content attribute, display label, chart colour). Order defines display order.
SKILL_SPECS = (
    ("grammar_score", "Grammar", "#7C3AED"),
    ("vocabulary_score", "Vocabulary", "#06B6D4"),
    ("fluency_score", "Fluency", "#10B981"),
    ("pronunciation_score", "Pronunciation", "#F59E0B"),
    ("confidence_score", "Confidence", "#4F46E5"),
)


def _value_for(content, attr: str) -> int:
    """The skill's score, falling back to the confidence score when the engine
    didn't score that individual skill."""
    value = getattr(content, attr, None)
    if value is None:
        value = getattr(content, "confidence_score", 0) or 0
    return max(0, min(int(value), 100))


def skill_rows(content) -> list[dict]:
    """[{label, value, color}] for the five tracked skills, in display order."""
    return [
        {"label": label, "value": _value_for(content, attr), "color": color}
        for attr, label, color in SKILL_SPECS
    ]


def overall_from_content(content) -> int:
    """Overall score = mean of the five skill values (0-100)."""
    rows = skill_rows(content)
    if not rows:
        return int(getattr(content, "confidence_score", 0) or 0)
    return round(sum(r["value"] for r in rows) / len(rows))
