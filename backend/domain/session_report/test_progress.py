"""Unit tests for the pure progress computation (no Django, no DB)."""
from dataclasses import dataclass
from datetime import datetime

from domain.session_report.progress import compute_progress


@dataclass
class FakeReport:
    overall_score: int
    skills: list
    session_date: datetime
    topic_title: str = "Topic"


def _r(overall, grammar, fluency, day):
    return FakeReport(
        overall_score=overall,
        skills=[
            {"label": "Grammar", "value": grammar, "color": "#7C3AED"},
            {"label": "Fluency", "value": fluency, "color": "#10B981"},
        ],
        session_date=datetime(2026, 7, day),
    )


def test_empty_has_no_deltas_and_a_starter_message():
    out = compute_progress([])
    assert out["sessionsCount"] == 0
    assert out["overall"]["current"] is None
    assert out["overall"]["delta"] is None
    assert out["skills"] == []
    assert "first session" in out["message"].lower()


def test_single_session_has_current_but_no_delta():
    out = compute_progress([_r(70, 68, 72, 1)])
    assert out["sessionsCount"] == 1
    assert out["overall"]["current"] == 70
    assert out["overall"]["previous"] is None
    assert out["overall"]["delta"] is None


def test_two_sessions_compute_overall_and_per_skill_deltas():
    out = compute_progress([_r(70, 40, 72, 1), _r(75, 45, 71, 2)])
    assert out["sessionsCount"] == 2
    assert out["overall"] == {
        "current": 75, "previous": 70, "delta": 5,
        "series": out["overall"]["series"],
    }
    assert [p["score"] for p in out["overall"]["series"]] == [70, 75]

    grammar = next(s for s in out["skills"] if s["label"] == "Grammar")
    assert grammar["current"] == 45 and grammar["previous"] == 40 and grammar["delta"] == 5
    fluency = next(s for s in out["skills"] if s["label"] == "Fluency")
    assert fluency["delta"] == -1  # 71 - 72
    assert "improved by 5" in out["message"].lower()


def test_skill_order_is_preferred_first():
    out = compute_progress([_r(70, 40, 72, 1), _r(75, 45, 71, 2)])
    assert [s["label"] for s in out["skills"]] == ["Grammar", "Fluency"]
