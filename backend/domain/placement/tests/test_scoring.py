"""Text-based fluency + confidence derivation (no pronunciation, no AI)."""
from domain.placement import scoring
from domain.placement.dtos import PlacementSpokenAnswer, PlacementWrittenAnswer
from domain.placement.text_signals import extract_signals


def test_fluency_zero_on_empty_transcript():
    sig = extract_signals("")
    assert scoring.fluency_from_signals(sig, scoring.SPOKEN_TARGET_WORDS) == 0


def test_fluency_higher_for_longer_coherent_low_hesitation_text():
    good = extract_signals(
        "I usually wake up early and then I go to work because I like my job. "
        "After that I study English at home."
    )
    poor = extract_signals("um uh ... well like")
    g = scoring.fluency_from_signals(good, scoring.SPOKEN_TARGET_WORDS)
    p = scoring.fluency_from_signals(poor, scoring.SPOKEN_TARGET_WORDS)
    assert g > p
    assert g >= 60 and p <= 30


def test_hesitation_markers_reduce_fluency():
    clean = extract_signals("I went to the market and bought some fresh fruit.")
    hesitant = extract_signals("I um went uh to the um market and uh bought um fruit.")
    assert scoring.fluency_from_signals(clean, scoring.SPOKEN_TARGET_WORDS) > scoring.fluency_from_signals(
        hesitant, scoring.SPOKEN_TARGET_WORDS
    )


def test_confidence_higher_for_assertive_complete_answers():
    strong = scoring.score_spoken_section([
        PlacementSpokenAnswer("q1", "I am confident and I can speak English well because I practise every day."),
        PlacementSpokenAnswer("q2", "Yes, I definitely enjoy travelling and I will visit many countries."),
    ])[1]
    weak = scoring.score_spoken_section([
        PlacementSpokenAnswer("q1", "um uh maybe"),
        PlacementSpokenAnswer("q2", "... like well"),
    ])[1]
    assert scoring.confidence_from_spoken(strong) > scoring.confidence_from_spoken(weak)


def test_confidence_zero_without_spoken_answers():
    assert scoring.confidence_from_spoken([]) == 0


def test_written_answer_has_no_fluency():
    row = scoring.score_written_answer(PlacementWrittenAnswer("q1", "I like reading books in my free time."))
    assert row["fluency"] is None
    assert 0 <= row["score"] <= 100


def test_empty_written_answer_scores_zero():
    row = scoring.score_written_answer(PlacementWrittenAnswer("q1", ""))
    assert row["score"] == 0
    assert row["grammar"] == 0 and row["vocabulary"] == 0


def test_section_aggregation_counts_answers():
    section, rows = scoring.score_spoken_section([
        PlacementSpokenAnswer("q1", "I work as an engineer in a big company."),
        PlacementSpokenAnswer("q2", "I started learning English five years ago."),
    ])
    assert section.answers_count == 2
    assert len(rows) == 2
    assert section.fluency is not None  # spoken sections always have fluency
