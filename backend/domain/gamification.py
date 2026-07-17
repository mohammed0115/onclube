"""
Pure gamification computation for the student dashboard (streak, XP, milestones).

Framework-free and deterministic: given the student's completed-session dates and
level, it returns the streak (consecutive active weeks), total points, and the
milestone board. No ORM, no I/O — fully unit-testable.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

# XP economy (tunable).
POINTS_PLACEMENT = 50
POINTS_PER_SESSION = 25


def _week_of(d: datetime) -> tuple:
    iso = d.isocalendar()
    return (iso[0], iso[1])


def _prev_week(week: tuple) -> tuple:
    y, w = week
    d = date.fromisocalendar(y, w, 1) - timedelta(days=7)
    iso = d.isocalendar()
    return (iso[0], iso[1])


def streak_weeks(session_dates, now: datetime) -> int:
    """Consecutive weeks (ending this week, or last week as grace) that each have at
    least one completed session. A missed week breaks the streak."""
    weeks = {_week_of(d) for d in session_dates if d is not None}
    if not weeks:
        return 0
    this = _week_of(now)
    start = this if this in weeks else _prev_week(this)
    if start not in weeks:
        return 0
    streak, cur = 0, start
    while cur in weeks:
        streak += 1
        cur = _prev_week(cur)
    return streak


def _milestone(key, label, description, icon, earned) -> dict:
    return {"key": key, "label": label, "description": description, "icon": icon, "earned": bool(earned)}


def compute(*, sessions_completed: int, session_dates, has_level: bool, now: datetime) -> dict:
    """Return the gamification board for the dashboard."""
    streak = streak_weeks(session_dates, now)
    points = (POINTS_PLACEMENT if has_level else 0) + POINTS_PER_SESSION * sessions_completed
    milestones = [
        _milestone("placed", "Level unlocked", "Complete the placement test", "Award", has_level),
        _milestone("first_session", "First session", "Complete your first live session", "Play", sessions_completed >= 1),
        _milestone("regular", "Getting regular", "Complete 5 sessions", "Flame", sessions_completed >= 5),
        _milestone("dedicated", "Dedicated", "Complete 10 sessions", "Zap", sessions_completed >= 10),
        _milestone("champion", "Champion", "Complete 25 sessions", "Trophy", sessions_completed >= 25),
        _milestone("streak_3", "On a roll", "Practise 3 weeks in a row", "TrendingUp", streak >= 3),
    ]
    return {
        "points": points,
        "streakWeeks": streak,
        "sessionsCompleted": sessions_completed,
        "milestonesEarned": sum(1 for m in milestones if m["earned"]),
        "milestonesTotal": len(milestones),
        "milestones": milestones,
    }
