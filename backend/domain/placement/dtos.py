"""
Frozen, framework-free placement DTOs (Phase 8B).

Inputs: PlacementWrittenAnswer, PlacementSpokenAnswer.
Outputs: PlacementSectionScore, PlacementRecommendationResult, PlacementAssessmentResult.

Deliberately NO pronunciation field anywhere — pronunciation is out of MVP scope.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


# ── inputs ────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class PlacementWrittenAnswer:
    question_id: str
    answer_text: str
    skill: Optional[str] = None


@dataclass(frozen=True)
class PlacementSpokenAnswer:
    question_id: str
    transcript: str  # produced by STT; the domain only ever sees text


# ── section + recommendation results ──────────────────────────────────────────
@dataclass(frozen=True)
class PlacementSectionScore:
    section: str  # "written" | "spoken"
    score: int
    grammar: int
    vocabulary: int
    completion: int
    fluency: Optional[int] = None  # written → None; spoken → 0–100
    answers_count: int = 0


@dataclass(frozen=True)
class PlacementRecommendationResult:
    strengths: list = field(default_factory=list)
    weaknesses: list = field(default_factory=list)
    recommended_focus: list = field(default_factory=list)
    recommended_conversation_topics: list = field(default_factory=list)
    recommended_instructor_difficulty: str = "balanced"


# ── final assessment result ───────────────────────────────────────────────────
@dataclass(frozen=True)
class PlacementAssessmentResult:
    cefr_level: str
    overall_conversation_score: int
    grammar_score: int
    vocabulary_score: int
    fluency_score: int
    confidence_score: int
    written_score: int
    spoken_score: int
    spoken_capped: bool
    spoken_ceiling: str
    source: str  # "heuristic" (default) | "openai" (later)
    written: PlacementSectionScore
    spoken: PlacementSectionScore
    recommendation: PlacementRecommendationResult


# ── persistence-boundary DTOs (Phase 8C) ──────────────────────────────────────
# Returned by repositories so raw Django models never cross the boundary.

@dataclass(frozen=True)
class PlacementQuestionDTO:
    """PUBLIC question shape.

    `options` are the visible multiple-choice answers a student picks from
    (empty for open/spoken prompts). The answer key — `correct_answer`,
    `correct_index`, `scoring_rubric` — stays SERVER-SIDE ONLY and is never
    placed on this DTO.
    """

    id: str
    question_type: str  # "written" | "spoken"
    prompt: str
    skill: str
    cefr_band: str
    order: int
    options: tuple = ()


@dataclass(frozen=True)
class InterviewStepDTO:
    """One step of the speaking interview: a FIXED known question plus the
    interviewer's presentational lines. Carries no answer key and no model
    prompt — only what the student may see/hear."""

    question_id: str
    order: int
    prompt: str          # the fixed spoken question (unchanged, never generated)
    preamble: str        # interviewer lead-in
    clarification: str   # meaning-preserving rephrase the student may request


@dataclass(frozen=True)
class SpeakingInterviewDTO:
    """The full interviewer script for the speaking interview. Presentational
    text only — never exposes prompts, provider keys, or internal instructions;
    contains no scoring/assessment."""

    greeting: str
    instructions: str
    encouragement: str
    closing: str
    steps: tuple = ()
    # Deterministic OneClub script metadata (Sprint 2.0.1A) — exposed for
    # auditability/reproducibility. No prompts/keys — safe to serialize.
    script_id: str = ""
    script_version: str = ""
    language: str = "en"
    resume_messages: tuple = ()  # fixed "Welcome back" lines, one per progress point


@dataclass(frozen=True)
class InterviewAnswerDTO:
    """One captured answer: its transcript text and how it was produced. Carries
    NO score — the interview never evaluates."""

    question_id: str
    order: int
    transcript_text: str
    source: str  # "voice" (locked) | "manual" (typed fallback)


@dataclass(frozen=True)
class InterviewSessionDTO:
    """State of a speaking-interview session. Lifecycle + progress + transcript
    ONLY — deliberately NO assessment fields (no CEFR / score / recommendation)."""

    interview_id: str
    attempt_id: str
    status: str  # created | running | completed | finalized
    current_question_index: int
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    answers: tuple = ()
    script_version: str = ""  # OneClub script version recorded for this session


@dataclass(frozen=True)
class PlacementAttemptDTO:
    id: str
    student_id: str
    status: str  # in_progress | submitted | assessed | reset
    version: int
    goal_id: Optional[str] = None
    started_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    assessed_at: Optional[datetime] = None
    fallback_used: bool = False
    provider_name: str = ""


@dataclass(frozen=True)
class PlacementTestDTO:
    """The fixed known questions, split by section. Items are PlacementQuestionDTO
    (no answer key)."""

    written: list = field(default_factory=list)
    spoken: list = field(default_factory=list)


@dataclass(frozen=True)
class PlacementAttemptStatusDTO:
    status: str  # not_started | in_progress | submitted | assessed | reset
    attempt_id: Optional[str] = None
    written_complete: bool = False
    spoken_complete: bool = False
    assessed: bool = False
    can_submit: bool = False


@dataclass(frozen=True)
class PlacementResetAuditResult:
    audit_id: str
    attempt_id: str
    student_id: str
    reset_by_id: Optional[str]
    reason: str


@dataclass(frozen=True)
class PlacementStoredResult:
    """Flat, persisted result returned on read (mirrors the stored row).

    Distinct from the assessor's nested `PlacementAssessmentResult`: the store
    keeps flat scores + the recommendation, not per-section sub-scores.
    """

    attempt_id: str
    cefr_level: str
    overall_conversation_score: int
    grammar_score: int
    vocabulary_score: int
    fluency_score: int
    confidence_score: int
    written_score: int
    spoken_score: int
    spoken_capped: bool
    spoken_ceiling: str
    evaluator_version: str
    provider_name: str
    fallback_used: bool
    recommendation: PlacementRecommendationResult
