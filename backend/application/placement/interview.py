"""
Speaking-interview use case (Sprint 2).

Builds the AI interviewer's script over the FIXED spoken placement questions.
This module is deliberately INDEPENDENT of the assessment engine
(`domain.placement.assessor`): the interviewer only conducts the interview and
never scores. Transcript capture reuses `SaveSpokenTranscriptsUseCase`.

Guarantees:
  * questions come from the fixed known set, in `order` — never AI-generated
  * output is a DTO of presentational lines only — no prompts / keys / answer key
  * no scoring, no CEFR, no recommendations here
"""
from __future__ import annotations

import dataclasses

from application.permissions import get_student_profile
from domain.exceptions import PlacementAttemptNotFound
from domain.placement import attempt_rules, interview_rules
from domain.placement.dtos import InterviewStepDTO, SpeakingInterviewDTO
from infrastructure.container import (
    default_interviewer_provider,
    default_placement_answer_repository,
    default_placement_attempt_repository,
    default_placement_interview_session_repository,
    default_placement_question_repository,
    default_placement_reset_audit_repository,
)


class GetSpeakingInterviewUseCase:
    def __init__(self, *, questions=None, interviewer=None):
        self.questions = questions or default_placement_question_repository()
        self.interviewer = interviewer or default_interviewer_provider()

    def execute(self, *, actor) -> SpeakingInterviewDTO:
        get_student_profile(actor)  # student-only

        spoken = self.questions.list_active("spoken")  # FIXED, ordered by (type, order)
        total = len(spoken)
        steps = tuple(
            InterviewStepDTO(
                question_id=q.id,
                order=q.order,
                prompt=q.prompt,  # the fixed question, verbatim
                preamble=self.interviewer.preamble(order=q.order, total=total),
                clarification=self.interviewer.clarification(prompt=q.prompt),
            )
            for q in spoken
        )
        return SpeakingInterviewDTO(
            greeting=self.interviewer.greeting(),
            instructions=self.interviewer.instructions(),
            encouragement=self.interviewer.encouragement(),
            closing=self.interviewer.closing(),
            steps=steps,
            script_id=self.interviewer.script_id(),
            script_version=self.interviewer.script_version(),
            language=self.interviewer.language(),
            resume_messages=self.interviewer.resume_messages(total=total),
        )


class _InterviewSessionMixin:
    """Shared wiring for the interview-session use cases. NO assessor dependency."""

    def __init__(self, *, attempts=None, sessions=None, answers=None,
                 questions=None, resets=None):
        self.attempts = attempts or default_placement_attempt_repository()
        self.sessions = sessions or default_placement_interview_session_repository()
        self.answers = answers or default_placement_answer_repository()
        self.questions = questions or default_placement_question_repository()
        self.resets = resets or default_placement_reset_audit_repository()

    def _active_attempt(self, actor):
        student = get_student_profile(actor)
        attempt = self.attempts.get_active(student)
        if attempt is None:
            raise PlacementAttemptNotFound()
        return student, attempt

    def _session_for(self, attempt_id):
        session = self.sessions.get_by_attempt(attempt_id)
        if session is None:
            session = self.sessions.create(attempt_id)
        return session

    def _with_answers(self, session):
        answers = tuple(self.answers.list_interview_answers(session.attempt_id))
        return dataclasses.replace(session, answers=answers)


class GetOrCreateInterviewSessionUseCase(_InterviewSessionMixin):
    """Resume point: return the attempt's interview session (creating it if needed)
    with every already-captured answer, so the UI can resume from the last one."""

    def execute(self, *, actor):
        _, attempt = self._active_attempt(actor)
        session = self._session_for(attempt.id)
        return self._with_answers(session)


class SaveInterviewAnswerUseCase(_InterviewSessionMixin):
    """Persist ONE answer with its source. Enforces the transcript lock (a voice
    answer cannot be overwritten) and the spoken one-shot rule, then advances the
    resume point. No scoring."""

    def execute(self, *, actor, question_id, transcript_text, source):
        student, attempt = self._active_attempt(actor)
        question_id = str(question_id)

        # An empty answer can never be saved (and therefore never advances the
        # interview). Silence/no-speech must be retried, not persisted.
        if not (transcript_text or "").strip():
            from domain.exceptions import EmptyTranscript

            raise EmptyTranscript()

        # Only fixed, known spoken questions may be answered.
        allowed = self.questions.known_ids("spoken")
        attempt_rules.ensure_known_questions([question_id], allowed_ids=allowed)

        # Spoken one-shot: a used (non-reset) attempt cannot be re-answered.
        used_elsewhere = self.attempts.has_used_spoken_excluding(student, attempt.id)
        reset_after = self.resets.reset_after_use(student)
        attempt_rules.ensure_spoken_attempt_available(
            used=used_elsewhere, reset_after_use=reset_after
        )

        # Transcript lock: a voice-captured answer cannot be edited (re-saving the
        # identical voice transcript is allowed as a no-op).
        existing = self.answers.get_spoken(attempt_id=attempt.id, question_id=question_id)
        if existing is not None:
            interview_rules.ensure_can_overwrite(
                existing_source=existing["source"],
                existing_text=existing["text"],
                new_text=transcript_text,
            )

        source = interview_rules.normalize_source(source)
        self.answers.save_spoken(
            attempt_id=attempt.id, question_id=question_id,
            transcript_text=transcript_text, source=source,
        )

        session = self._session_for(attempt.id)
        session = self.sessions.mark_running(session.interview_id)
        answered = self.answers.spoken_count(attempt.id)
        session = self.sessions.set_index(session.interview_id, answered)
        return self._with_answers(session)


class FinalizeInterviewUseCase(_InterviewSessionMixin):
    """Complete + finalize the interview once every question is answered. Its only
    output is the finalized transcript — no assessment is run."""

    def execute(self, *, actor):
        _, attempt = self._active_attempt(actor)
        total = len(self.questions.list_active("spoken"))
        answered = self.answers.spoken_count(attempt.id)
        interview_rules.ensure_interview_complete(answered_count=answered, total=total)

        session = self._session_for(attempt.id)
        self.sessions.mark_completed(session.interview_id)
        session = self.sessions.mark_finalized(session.interview_id)
        return self._with_answers(session)
