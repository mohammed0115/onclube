"""
Placement application use cases (Phase 8D).

Orchestrate the pure `domain.placement` rules over the placement repositories.
Rules:
  * every use case takes `actor` and enforces permission/ownership
  * outputs are DTOs only — no raw Django models cross the boundary
  * NO ORM here; NO AI provider; NO STT provider; NO pronunciation
  * scoring lives only in domain.placement (the deterministic assessor)
"""
from __future__ import annotations

import dataclasses

from application.permissions import ensure_admin, get_student_profile
from domain.exceptions import PlacementAttemptNotFound, PlacementResultNotFound
from domain.placement import attempt_rules
from domain.placement.dtos import (
    PlacementAttemptStatusDTO,
    PlacementResetAuditResult,
    PlacementTestDTO,
)
from infrastructure.container import (
    default_assessment_engine,
    default_placement_answer_repository,
    default_placement_attempt_repository,
    default_placement_profile_repository,
    default_placement_question_repository,
    default_placement_reset_audit_repository,
    default_placement_result_repository,
)

EVALUATOR_VERSION = "oneclub-score-v2"


def _cefr_from_percentage(pct: int) -> str:
    """Map the overall placement percentage (0–100) to CEFR — 100% = C2.
    OneClub scoring model: overall = (written% + spoken%) / 2, equal weight,
    no spoken cap. Product-owned bands (Sprint 2.0.2)."""
    if pct >= 90:
        return "C2"
    if pct >= 75:
        return "C1"
    if pct >= 60:
        return "B2"
    if pct >= 45:
        return "B1"
    if pct >= 25:
        return "A2"
    return "A1"


# ── 1. list questions ─────────────────────────────────────────────────────────
class ListPlacementQuestionsUseCase:
    """Active fixed known questions, split written/spoken. No answer key."""

    def __init__(self, *, questions=None):
        self.questions = questions or default_placement_question_repository()

    def execute(self, *, actor) -> PlacementTestDTO:
        get_student_profile(actor)  # student-only
        return PlacementTestDTO(
            written=self.questions.list_active("written"),
            spoken=self.questions.list_active("spoken"),
        )


# ── 2. start attempt ──────────────────────────────────────────────────────────
class StartPlacementAttemptUseCase:
    def __init__(self, *, attempts=None):
        self.attempts = attempts or default_placement_attempt_repository()

    def execute(self, *, actor):
        student = get_student_profile(actor)
        active = self.attempts.get_active(student)
        if active is not None:
            return active  # reuse the one active attempt
        goal = student.goal if student.goal_id else None  # stored if available
        return self.attempts.create(student=student, goal=goal)


# ── 3. save written answers ───────────────────────────────────────────────────
class SaveWrittenAnswersUseCase:
    def __init__(self, *, attempts=None, answers=None, questions=None):
        self.attempts = attempts or default_placement_attempt_repository()
        self.answers = answers or default_placement_answer_repository()
        self.questions = questions or default_placement_question_repository()

    def execute(self, *, actor, answers):
        student = get_student_profile(actor)
        attempt = self.attempts.get_active(student)
        if attempt is None:
            raise PlacementAttemptNotFound()

        written_questions = self.questions.list_active("written")
        allowed = {q.id for q in written_questions}
        attempt_rules.ensure_known_questions(
            [str(a["question_id"]) for a in answers], allowed_ids=allowed
        )
        # Multiple-choice answers must be one of the question's fixed options.
        options_by_question = {q.id: list(q.options or []) for q in written_questions}
        attempt_rules.ensure_valid_written_choices(
            [(str(a["question_id"]), a.get("answer_text", "")) for a in answers],
            options_by_question,
        )
        # Written may be retaken — saving simply overwrites (update_or_create).
        attempt_rules.written_retake_allowed()
        for a in answers:
            self.answers.save_written(
                attempt_id=attempt.id, question_id=str(a["question_id"]),
                answer_text=a.get("answer_text", ""),
            )
        return self.attempts.get(attempt.id)


# ── 4. save spoken transcripts (one-shot, text only) ──────────────────────────
class SaveSpokenTranscriptsUseCase:
    def __init__(self, *, attempts=None, answers=None, questions=None, resets=None):
        self.attempts = attempts or default_placement_attempt_repository()
        self.answers = answers or default_placement_answer_repository()
        self.questions = questions or default_placement_question_repository()
        self.resets = resets or default_placement_reset_audit_repository()

    def execute(self, *, actor, transcripts):
        student = get_student_profile(actor)
        attempt = self.attempts.get_active(student)
        if attempt is None:
            raise PlacementAttemptNotFound()

        allowed = self.questions.known_ids("spoken")
        attempt_rules.ensure_known_questions(
            [str(t["question_id"]) for t in transcripts], allowed_ids=allowed
        )

        # One-shot: blocked only if ANOTHER (non-reset) attempt already used spoken.
        used_elsewhere = self.attempts.has_used_spoken_excluding(student, attempt.id)
        reset_after = self.resets.reset_after_use(student)
        attempt_rules.ensure_spoken_attempt_available(
            used=used_elsewhere, reset_after_use=reset_after
        )

        for t in transcripts:
            self.answers.save_spoken(
                attempt_id=attempt.id, question_id=str(t["question_id"]),
                transcript_text=t.get("transcript_text", ""),
                stt_provider=t.get("stt_provider", ""),
                stt_confidence=t.get("stt_confidence"),
            )
        return self.attempts.get(attempt.id)


# ── 5. submit (assess) ────────────────────────────────────────────────────────
class SubmitPlacementAttemptUseCase:
    def __init__(self, *, attempts=None, answers=None, questions=None, results=None,
                 profiles=None, engine=None):
        self.attempts = attempts or default_placement_attempt_repository()
        self.answers = answers or default_placement_answer_repository()
        self.questions = questions or default_placement_question_repository()
        self.results = results or default_placement_result_repository()
        self.profiles = profiles or default_placement_profile_repository()
        # The assessment engine is injected via the composition root; the use case
        # depends only on the engine abstraction, never on a concrete AI provider.
        self.engine = engine or default_assessment_engine()

    def execute(self, *, actor):
        student = get_student_profile(actor)
        attempt = self.attempts.get_active(student)
        if attempt is None:
            raise PlacementAttemptNotFound()

        written_n = len(self.questions.list_active("written"))
        spoken_n = len(self.questions.list_active("spoken"))
        written_complete = self.answers.written_count(attempt.id) >= written_n and written_n > 0
        spoken_complete = self.answers.spoken_count(attempt.id) >= spoken_n and spoken_n > 0
        attempt_rules.ensure_placement_complete(
            written_submitted=written_complete, spoken_submitted=spoken_complete
        )

        written = self.answers.list_written(attempt.id)
        spoken = self.answers.list_spoken(attempt.id)
        goal_code = student.goal.code if student.goal_id else None

        # Deterministic assessment via the engine (heuristic provider by default;
        # swappable for OpenAI at the composition root). The engine returns a DTO
        # only — persistence below is the use case's responsibility, not the engine's.
        result = self.engine.assess(written=written, spoken=spoken, goal=goal_code)

        # ── OneClub scoring model (product spec) ────────────────────────────────
        # Written is scored OBJECTIVELY from MCQ correctness (5/5 → 100). Overall is
        # the equal-weight average of written% + spoken%, with NO spoken cap, mapped
        # to A1–C2 (100% = C2). This overrides the engine's provider-derived
        # written_score / cefr so correct answers always count.
        review = self.answers.written_review(attempt.id)
        correct = sum(1 for r in review if r["isCorrect"])
        written_score = round(correct / len(review) * 100) if review else 0
        spoken_score = result.spoken_score
        overall = round((written_score + spoken_score) / 2)
        cefr_level = _cefr_from_percentage(overall)
        result = dataclasses.replace(
            result,
            written_score=written_score,
            spoken_score=spoken_score,
            overall_conversation_score=overall,
            cefr_level=cefr_level,
            spoken_capped=False,
            spoken_ceiling=cefr_level,
        )

        # `result.source` reflects the provider that ACTUALLY scored ("openai" when
        # the AI succeeded, "heuristic" when it fell back). Persist the real flag so
        # the result is honest about how it was evaluated (never hardcode fallback).
        fallback_used = result.source != "openai"
        stored = self.results.save(
            attempt_id=attempt.id, result=result,
            evaluator_version=EVALUATOR_VERSION, provider_name=result.source, fallback_used=fallback_used,
        )
        self.attempts.mark_assessed(attempt.id, provider_name=result.source, fallback_used=fallback_used)
        # Personalize the student's level (placement does NOT unlock booking).
        self.profiles.set_level(student, result.cefr_level)
        return stored  # PlacementStoredResult — flat, carries providerName + fallbackUsed


# ── 6. get my result ──────────────────────────────────────────────────────────
class GetMyPlacementResultUseCase:
    def __init__(self, *, results=None):
        self.results = results or default_placement_result_repository()

    def execute(self, *, actor):
        student = get_student_profile(actor)
        stored = self.results.get_latest_for_student(student)  # ownership inherent
        if stored is None:
            raise PlacementResultNotFound()
        return stored


_CEFR_LABELS = {
    "A1": "Beginner", "A2": "Elementary", "B1": "Intermediate",
    "B2": "Upper-Intermediate", "C1": "Advanced", "C2": "Proficient",
}


class GetPlacementReviewUseCase:
    """Post-submission transparency: the learner's questions, their own answers, the
    correct answers (written), their recorded spoken transcripts, and every score —
    so the placement result is explainable, not a black box."""

    def __init__(self, *, results=None, answers=None):
        self.results = results or default_placement_result_repository()
        self.answers = answers or default_placement_answer_repository()

    def execute(self, *, actor) -> dict:
        student = get_student_profile(actor)
        stored = self.results.get_latest_for_student(student)
        if stored is None:
            raise PlacementResultNotFound()

        written = self.answers.written_review(stored.attempt_id)
        spoken = self.answers.spoken_review(stored.attempt_id)
        written_correct = sum(1 for w in written if w["isCorrect"])

        return {
            "level": stored.cefr_level,
            "levelLabel": _CEFR_LABELS.get(stored.cefr_level, ""),
            "scores": {
                "overall": stored.overall_conversation_score,
                "grammar": stored.grammar_score,
                "vocabulary": stored.vocabulary_score,
                "fluency": stored.fluency_score,
                "confidence": stored.confidence_score,
                "written": stored.written_score,
                "spoken": stored.spoken_score,
            },
            "writtenCorrect": written_correct,
            "writtenTotal": len(written),
            "written": written,
            "spoken": spoken,
            # Transparency about HOW it was scored (real AI vs deterministic fallback).
            "evaluatedBy": "AI (OpenAI)" if (stored.provider_name == "openai" and not stored.fallback_used) else "Automatic estimate",
            "aiUsed": stored.provider_name == "openai" and not stored.fallback_used,
        }


# ── 7. admin reset spoken ─────────────────────────────────────────────────────
class AdminResetSpokenAttemptUseCase:
    def __init__(self, *, attempts=None, resets=None):
        self.attempts = attempts or default_placement_attempt_repository()
        self.resets = resets or default_placement_reset_audit_repository()

    def execute(self, *, actor, reason, attempt_id=None, student_id=None) -> PlacementResetAuditResult:
        ensure_admin(actor)
        if not (reason or "").strip():
            from domain.exceptions import DomainError

            raise DomainError("A reason is required to reset a spoken attempt.")
        # Resolve the attempt either directly (use-case callers) or via the
        # student's most recent attempt (the /admin/placement/{studentId}/ route).
        if attempt_id is not None:
            attempt = self.attempts.get(attempt_id)
        else:
            attempt = self.attempts.latest_for_student_id(student_id)
        if attempt is None:
            raise PlacementAttemptNotFound()

        audit_id = self.resets.record(attempt_id=attempt.id, reset_by=actor, reason=reason)
        self.attempts.mark_reset(attempt.id)  # frees the one-shot; transcripts are kept
        return PlacementResetAuditResult(
            audit_id=audit_id,
            attempt_id=str(attempt.id),
            student_id=attempt.student_id,
            reset_by_id=str(actor.id),
            reason=reason,
        )


# ── 8. attempt status ─────────────────────────────────────────────────────────
class GetPlacementAttemptStatusUseCase:
    def __init__(self, *, attempts=None, answers=None, questions=None):
        self.attempts = attempts or default_placement_attempt_repository()
        self.answers = answers or default_placement_answer_repository()
        self.questions = questions or default_placement_question_repository()

    def execute(self, *, actor) -> PlacementAttemptStatusDTO:
        student = get_student_profile(actor)
        attempt = self.attempts.latest(student)
        if attempt is None:
            return PlacementAttemptStatusDTO(status="not_started")

        written_n = len(self.questions.list_active("written"))
        spoken_n = len(self.questions.list_active("spoken"))
        written_complete = written_n > 0 and self.answers.written_count(attempt.id) >= written_n
        spoken_complete = spoken_n > 0 and self.answers.spoken_count(attempt.id) >= spoken_n
        return PlacementAttemptStatusDTO(
            status=attempt.status,
            attempt_id=attempt.id,
            written_complete=written_complete,
            spoken_complete=spoken_complete,
            assessed=attempt.status == "assessed",
            can_submit=attempt.status == "in_progress" and written_complete and spoken_complete,
        )
