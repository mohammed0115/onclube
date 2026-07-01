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

from application.permissions import ensure_admin, get_student_profile
from domain.exceptions import PlacementAttemptNotFound, PlacementResultNotFound
from domain.placement import attempt_rules
from domain.placement.assessor import assess
from domain.placement.dtos import (
    PlacementAttemptStatusDTO,
    PlacementResetAuditResult,
    PlacementTestDTO,
)
from infrastructure.container import (
    default_placement_answer_repository,
    default_placement_attempt_repository,
    default_placement_profile_repository,
    default_placement_question_repository,
    default_placement_reset_audit_repository,
    default_placement_result_repository,
)

EVALUATOR_VERSION = "heuristic-v1"


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

        allowed = self.questions.known_ids("written")
        attempt_rules.ensure_known_questions(
            [str(a["question_id"]) for a in answers], allowed_ids=allowed
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
    def __init__(self, *, attempts=None, answers=None, questions=None, results=None, profiles=None):
        self.attempts = attempts or default_placement_attempt_repository()
        self.answers = answers or default_placement_answer_repository()
        self.questions = questions or default_placement_question_repository()
        self.results = results or default_placement_result_repository()
        self.profiles = profiles or default_placement_profile_repository()

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

        # Deterministic domain assessor (no AI provider yet → fallback path).
        result = assess(written, spoken, goal=goal_code)

        stored = self.results.save(
            attempt_id=attempt.id, result=result,
            evaluator_version=EVALUATOR_VERSION, provider_name=result.source, fallback_used=True,
        )
        self.attempts.mark_assessed(attempt.id, provider_name=result.source, fallback_used=True)
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
