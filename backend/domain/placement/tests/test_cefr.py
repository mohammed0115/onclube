"""CEFR mapping, spoken-dominant weighting, and the spoken-cap rule."""
from domain.placement import cefr


def test_level_for_score_bands():
    cases = {
        0: "A1", 35: "A1", 36: "A2", 52: "A2", 53: "B1",
        69: "B1", 70: "B2", 85: "B2", 86: "C1", 100: "C1",
    }
    for score, level in cases.items():
        assert cefr.level_for_score(score) == level, score


def test_only_five_levels():
    assert cefr.LEVELS == ("A1", "A2", "B1", "B2", "C1")
    assert "A0" not in cefr.LEVELS and "C2" not in cefr.LEVELS


def test_spoken_weight_dominates_blend():
    # Same magnitude on each side: spoken should pull the blend further.
    high_written = cefr.weighted_overall(written_score=100, spoken_score=0)   # 40
    high_spoken = cefr.weighted_overall(written_score=0, spoken_score=100)    # 60
    assert high_spoken > high_written
    assert high_written == 40 and high_spoken == 60


def test_spoken_ceiling_thresholds():
    assert cefr.spoken_ceiling(0) == "A2"
    assert cefr.spoken_ceiling(35) == "A2"
    assert cefr.spoken_ceiling(36) == "B1"
    assert cefr.spoken_ceiling(52) == "B1"
    assert cefr.spoken_ceiling(53) == "C1"


def test_weak_spoken_caps_final_below_a2():
    # Perfect written, spoken below A2 (35) → blend would be B1 but capped to A2.
    level, overall, capped, ceiling = cefr.final_level(written_score=100, spoken_score=35)
    assert ceiling == "A2"
    assert level == "A2"
    assert capped is True
    assert overall == 61  # blended sat at B1 before the cap


def test_weak_spoken_caps_final_to_b1():
    # Perfect written, spoken below B1 (50) → blend B2, capped to B1.
    level, _overall, capped, ceiling = cefr.final_level(written_score=100, spoken_score=50)
    assert ceiling == "B1"
    assert level == "B1"
    assert capped is True


def test_strong_spoken_is_not_capped():
    level, _overall, capped, ceiling = cefr.final_level(written_score=50, spoken_score=90)
    assert ceiling == "C1"
    assert capped is False
    assert level == "B2"


def test_cap_level_helper():
    assert cefr.cap_level("C1", "B1") == "B1"
    assert cefr.cap_level("A2", "B1") == "A2"  # already below ceiling → unchanged
