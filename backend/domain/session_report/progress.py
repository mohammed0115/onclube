"""
Pure progress computation — turns a student's ready reports (oldest → newest)
into a session-over-session comparison for the progress dashboard.

No Django, no I/O. Input `reports` is any sequence of objects exposing:
    - skills:        list[{"label": str, "value": int, "color": str}]
    - overall_score: int | None
    - session_date:  datetime (or anything with .isoformat())
    - topic_title:   str

Everything here is deterministic and side-effect free so it is trivially testable.
"""
from __future__ import annotations

# Preferred display order; any other skill labels are appended after these.
_PREFERRED = ("Grammar", "Vocabulary", "Fluency", "Pronunciation", "Confidence")


def _iso(dt):
    try:
        return dt.isoformat()
    except AttributeError:
        return str(dt) if dt is not None else None


def _skill_map(report) -> dict:
    out = {}
    for row in getattr(report, "skills", None) or []:
        label = row.get("label")
        if label is None:
            continue
        out[label] = {"value": int(row.get("value") or 0), "color": row.get("color")}
    return out


def _ordered_labels(reports) -> list:
    seen = []
    for report in reports:
        for label in _skill_map(report):
            if label not in seen:
                seen.append(label)
    # Preferred first (only those actually present), then any extras.
    ordered = [l for l in _PREFERRED if l in seen]
    ordered += [l for l in seen if l not in _PREFERRED]
    return ordered


def _delta(current, previous):
    if current is None or previous is None:
        return None
    return current - previous


def _message(sessions_count: int, overall_delta):
    if sessions_count == 0:
        return "Complete your first session to start tracking your progress."
    if sessions_count == 1:
        return "Your first report is in — finish another session to see your progress."
    if overall_delta is None:
        return "Keep going — your progress will compare across sessions."
    if overall_delta > 0:
        return f"You improved by {overall_delta} points since your last session. Keep it up! 🎉"
    if overall_delta < 0:
        return f"Your score dipped {abs(overall_delta)} points — let's focus on it next session."
    return "Steady — you held the same score as last session."


def compute_progress(reports) -> dict:
    """`reports` oldest → newest. Returns the dashboard-ready progress payload."""
    reports = list(reports)
    n = len(reports)

    overall_series = [
        {
            "label": f"S{i + 1}",
            "score": (r.overall_score if r.overall_score is not None else 0),
            "date": _iso(getattr(r, "session_date", None)),
            "topic": getattr(r, "topic_title", None),
        }
        for i, r in enumerate(reports)
    ]
    overall_current = reports[-1].overall_score if n else None
    overall_previous = reports[-2].overall_score if n >= 2 else None

    labels = _ordered_labels(reports)
    maps = [_skill_map(r) for r in reports]
    skills = []
    for label in labels:
        series = [
            {"label": f"S{i + 1}", "value": (m[label]["value"] if label in m else None)}
            for i, m in enumerate(maps)
        ]
        present = [m[label]["value"] for m in maps if label in m]
        color = next((m[label]["color"] for m in maps if label in m), None)
        current = present[-1] if present else None
        previous = present[-2] if len(present) >= 2 else None
        skills.append(
            {
                "label": label,
                "color": color,
                "current": current,
                "previous": previous,
                "delta": _delta(current, previous),
                "series": series,
            }
        )

    return {
        "sessionsCount": n,
        "overall": {
            "current": overall_current,
            "previous": overall_previous,
            "delta": _delta(overall_current, overall_previous),
            "series": overall_series,
        },
        "skills": skills,
        "message": _message(n, _delta(overall_current, overall_previous)),
    }
