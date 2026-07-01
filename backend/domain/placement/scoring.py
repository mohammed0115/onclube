"""
Deterministic, text-only scoring for placement answers (Phase 8B).

Every score is in 0–100 and computed purely from `TextSignals`. Fluency and
confidence are derived from transcript text (the spec's signals). There is NO
pronunciation scoring and NO randomness — the same input always yields the same
output.
"""
from __future__ import annotations

from statistics import pstdev

from .dtos import (
    PlacementSectionScore,
    PlacementSpokenAnswer,
    PlacementWrittenAnswer,
)
from .text_signals import TextSignals, extract_signals

# Expected answer "size" targets per section (tunable).
WRITTEN_TARGET_WORDS = 10
WRITTEN_TARGET_SENTENCES = 1
SPOKEN_TARGET_WORDS = 15
SPOKEN_TARGET_SENTENCES = 2


def _clamp(value) -> int:
    try:
        return max(0, min(100, int(round(float(value)))))
    except (TypeError, ValueError):
        return 0


def _avg(values) -> int:
    nums = [v for v in values if v is not None]
    return _clamp(sum(nums) / len(nums)) if nums else 0


# ── per-dimension signal heuristics ───────────────────────────────────────────
def grammar_from_signals(sig: TextSignals, target_sentences: int) -> int:
    if sig.is_empty:
        return 0
    score = 40
    score += min(sig.word_count, 25)
    score += min(sig.connector_count * 4, 12)
    score += 8 if sig.has_sentence_punctuation else 0
    score += min(sig.sentence_count, max(target_sentences, 1)) * 5
    return _clamp(score)


def vocabulary_from_signals(sig: TextSignals, target_words: int) -> int:
    if sig.is_empty:
        return 0
    breadth = min(sig.unique_word_count / max(target_words, 1), 1.0) * 55
    variety = sig.unique_ratio * 30
    word_range = min(sig.avg_word_length / 7.0, 1.0) * 15
    return _clamp(breadth + variety + word_range)


def completion_from_signals(sig: TextSignals, target_words: int, target_sentences: int) -> int:
    if sig.is_empty:
        return 0
    word_part = min(sig.word_count / max(target_words, 1), 1.0) * 70
    sentence_part = min(sig.sentence_count / max(target_sentences, 1), 1.0) * 20
    started_bonus = 10
    return _clamp(word_part + sentence_part + started_bonus)


def fluency_from_signals(sig: TextSignals, target_words: int) -> int:
    """Transcript-based fluency: flow + sentence flow + coherence − hesitation."""
    if sig.is_empty:
        return 0
    flow = min(sig.word_count / max(target_words, 1), 1.0) * 45
    sentence_flow = min(sig.sentence_count / 2.0, 1.0) * 20
    coherence = min(sig.connector_count * 5, 20)
    base = 15
    hesitation_penalty = min(sig.hesitation_count * 6 + sig.ellipsis_count * 4, 30)
    return _clamp(flow + sentence_flow + coherence + base - hesitation_penalty)


# ── per-answer scoring ────────────────────────────────────────────────────────
def score_written_answer(answer: PlacementWrittenAnswer) -> dict:
    sig = extract_signals(answer.answer_text)
    grammar = grammar_from_signals(sig, WRITTEN_TARGET_SENTENCES)
    vocabulary = vocabulary_from_signals(sig, WRITTEN_TARGET_WORDS)
    completion = completion_from_signals(sig, WRITTEN_TARGET_WORDS, WRITTEN_TARGET_SENTENCES)
    return {
        "grammar": grammar,
        "vocabulary": vocabulary,
        "completion": completion,
        "fluency": None,
        "score": _avg([grammar, vocabulary, completion]),
        "signals": sig,
    }


def score_spoken_answer(answer: PlacementSpokenAnswer) -> dict:
    sig = extract_signals(answer.transcript)
    grammar = grammar_from_signals(sig, SPOKEN_TARGET_SENTENCES)
    vocabulary = vocabulary_from_signals(sig, SPOKEN_TARGET_WORDS)
    completion = completion_from_signals(sig, SPOKEN_TARGET_WORDS, SPOKEN_TARGET_SENTENCES)
    fluency = fluency_from_signals(sig, SPOKEN_TARGET_WORDS)
    return {
        "grammar": grammar,
        "vocabulary": vocabulary,
        "completion": completion,
        "fluency": fluency,
        "score": _avg([grammar, vocabulary, fluency, completion]),
        "signals": sig,
    }


# ── section aggregation ───────────────────────────────────────────────────────
def score_written_section(answers: list[PlacementWrittenAnswer]) -> tuple[PlacementSectionScore, list[dict]]:
    rows = [score_written_answer(a) for a in answers]
    section = PlacementSectionScore(
        section="written",
        score=_avg([r["score"] for r in rows]),
        grammar=_avg([r["grammar"] for r in rows]),
        vocabulary=_avg([r["vocabulary"] for r in rows]),
        completion=_avg([r["completion"] for r in rows]),
        fluency=None,
        answers_count=len(rows),
    )
    return section, rows


def score_spoken_section(answers: list[PlacementSpokenAnswer]) -> tuple[PlacementSectionScore, list[dict]]:
    rows = [score_spoken_answer(a) for a in answers]
    section = PlacementSectionScore(
        section="spoken",
        score=_avg([r["score"] for r in rows]),
        grammar=_avg([r["grammar"] for r in rows]),
        vocabulary=_avg([r["vocabulary"] for r in rows]),
        completion=_avg([r["completion"] for r in rows]),
        fluency=_avg([r["fluency"] for r in rows]) if rows else 0,
        answers_count=len(rows),
    )
    return section, rows


# ── confidence (text-based, from spoken transcripts) ──────────────────────────
def confidence_from_spoken(rows: list[dict]) -> int:
    """Cheap confidence proxy from spoken transcripts:
    completeness + assertiveness + low-hesitation + cross-answer consistency.
    """
    if not rows:
        return 0
    sigs: list[TextSignals] = [r["signals"] for r in rows]
    completions = [r["completion"] for r in rows]

    completeness = _avg(completions)
    avg_assertive = sum(s.assertive_count for s in sigs) / len(sigs)
    assertiveness = _clamp(min(avg_assertive / 1.5, 1.0) * 100)
    avg_hes = sum(s.hesitation_count for s in sigs) / len(sigs)
    avg_ell = sum(s.ellipsis_count for s in sigs) / len(sigs)
    low_hesitation = _clamp(100 - avg_hes * 12 - avg_ell * 8)
    consistency = _clamp(100 - pstdev(completions)) if len(completions) > 1 else completeness

    return _clamp(
        0.40 * completeness
        + 0.25 * assertiveness
        + 0.25 * low_hesitation
        + 0.10 * consistency
    )
