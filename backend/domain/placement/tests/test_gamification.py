"""Pure gamification computation tests (streak, XP, milestones)."""
from datetime import datetime, timedelta, timezone

from domain import gamification as gam

NOW = datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc)  # a Wednesday


def _weeks_ago(n):
    return NOW - timedelta(weeks=n)


def test_no_sessions_gives_zero_streak_and_placement_only_points():
    board = gam.compute(sessions_completed=0, session_dates=[], has_level=True, now=NOW)
    assert board["streakWeeks"] == 0
    assert board["points"] == gam.POINTS_PLACEMENT
    assert board["milestonesEarned"] == 1  # only "placed"


def test_points_scale_with_sessions_and_placement():
    board = gam.compute(sessions_completed=3, session_dates=[NOW] * 3, has_level=True, now=NOW)
    assert board["points"] == gam.POINTS_PLACEMENT + 3 * gam.POINTS_PER_SESSION


def test_streak_counts_consecutive_weeks():
    dates = [_weeks_ago(0), _weeks_ago(1), _weeks_ago(2)]  # this + last 2 weeks
    board = gam.compute(sessions_completed=3, session_dates=dates, has_level=True, now=NOW)
    assert board["streakWeeks"] == 3


def test_a_missed_week_breaks_the_streak():
    dates = [_weeks_ago(0), _weeks_ago(1), _weeks_ago(3)]  # gap at week 2
    board = gam.compute(sessions_completed=3, session_dates=dates, has_level=True, now=NOW)
    assert board["streakWeeks"] == 2


def test_streak_allows_last_week_grace_when_none_this_week():
    dates = [_weeks_ago(1), _weeks_ago(2)]  # nothing this week yet
    board = gam.compute(sessions_completed=2, session_dates=dates, has_level=True, now=NOW)
    assert board["streakWeeks"] == 2


def test_stale_streak_resets_to_zero():
    dates = [_weeks_ago(4), _weeks_ago(5)]  # last activity 4 weeks ago
    board = gam.compute(sessions_completed=2, session_dates=dates, has_level=True, now=NOW)
    assert board["streakWeeks"] == 0


def test_session_milestones_unlock_at_thresholds():
    board = gam.compute(sessions_completed=10, session_dates=[NOW] * 10, has_level=True, now=NOW)
    earned = {m["key"] for m in board["milestones"] if m["earned"]}
    assert {"first_session", "regular", "dedicated"} <= earned
    assert "champion" not in earned  # needs 25
