"""
Django ORM implementations of the placement repository ports (Phase 8C).

Repositories return DTOs / primitives — never raw models. They hold NO scoring
logic (that lives in domain.placement); they only persist and fetch.
"""
from __future__ import annotations

from django.utils import timezone

from apps.placement.models import (
    AttemptStatus,
    InterviewSession,
    InterviewStatus,
    PlacementAssessmentResult,
    PlacementAttempt,
    PlacementQuestion,
    PlacementResetAudit,
    PlacementSpokenAnswer,
    PlacementWrittenAnswer,
)
from application.ports.repositories import (
    PlacementAnswerRepository,
    PlacementAttemptRepository,
    PlacementInterviewSessionRepository,
    PlacementProfileRepository,
    PlacementQuestionRepository,
    PlacementResetAuditRepository,
    PlacementResultRepository,
)

from .placement_mappers import (
    attempt_to_dto,
    interview_answer_to_dto,
    interview_session_to_dto,
    question_to_dto,
    result_to_dto,
    spoken_answer_to_dto,
    written_answer_to_dto,
)


class DjangoPlacementQuestionRepository(PlacementQuestionRepository):
    def _active_qs(self, question_type=None):
        qs = PlacementQuestion.objects.filter(is_active=True)
        if question_type:
            qs = qs.filter(question_type=question_type)
        return qs.order_by("question_type", "order")

    def list_active(self, question_type=None):
        return [question_to_dto(q) for q in self._active_qs(question_type)]

    def get(self, question_id):
        return question_to_dto(PlacementQuestion.objects.get(pk=question_id))

    def known_ids(self, question_type=None):
        return {str(pk) for pk in self._active_qs(question_type).values_list("id", flat=True)}


class DjangoPlacementAttemptRepository(PlacementAttemptRepository):
    def create(self, *, student, goal=None, version=1):
        attempt = PlacementAttempt.objects.create(
            student=student, goal=goal, version=version, status=AttemptStatus.IN_PROGRESS
        )
        return attempt_to_dto(attempt)

    def get(self, attempt_id):
        return attempt_to_dto(PlacementAttempt.objects.get(pk=attempt_id))

    def get_active(self, student):
        attempt = PlacementAttempt.objects.filter(
            student=student, status=AttemptStatus.IN_PROGRESS
        ).first()
        return attempt_to_dto(attempt) if attempt else None

    def latest(self, student):
        attempt = PlacementAttempt.objects.filter(student=student).order_by("-started_at").first()
        return attempt_to_dto(attempt) if attempt else None

    def latest_for_student_id(self, student_id):
        attempt = PlacementAttempt.objects.filter(student_id=student_id).order_by("-started_at").first()
        return attempt_to_dto(attempt) if attempt else None

    def mark_submitted(self, attempt_id):
        PlacementAttempt.objects.filter(pk=attempt_id).update(
            status=AttemptStatus.SUBMITTED, submitted_at=timezone.now()
        )

    def mark_assessed(self, attempt_id, *, provider_name, fallback_used):
        PlacementAttempt.objects.filter(pk=attempt_id).update(
            status=AttemptStatus.ASSESSED,
            assessed_at=timezone.now(),
            provider_name=provider_name,
            fallback_used=fallback_used,
        )

    def mark_reset(self, attempt_id):
        PlacementAttempt.objects.filter(pk=attempt_id).update(status=AttemptStatus.RESET)

    def has_used_spoken(self, student):
        return (
            PlacementSpokenAnswer.objects.filter(attempt__student=student)
            .exclude(attempt__status=AttemptStatus.RESET)
            .exists()
        )

    def has_used_spoken_excluding(self, student, attempt_id):
        return (
            PlacementSpokenAnswer.objects.filter(attempt__student=student)
            .exclude(attempt__status=AttemptStatus.RESET)
            .exclude(attempt_id=attempt_id)
            .exists()
        )


class DjangoPlacementAnswerRepository(PlacementAnswerRepository):
    def save_written(self, *, attempt_id, question_id, answer_text, score=None):
        PlacementWrittenAnswer.objects.update_or_create(
            attempt_id=attempt_id,
            question_id=question_id,
            defaults={"answer_text": answer_text, "score": score},
        )

    def save_spoken(self, *, attempt_id, question_id, transcript_text,
                    source="manual", stt_provider="", stt_confidence=None,
                    spoken_attempt_number=1, score=None):
        PlacementSpokenAnswer.objects.update_or_create(
            attempt_id=attempt_id,
            question_id=question_id,
            defaults={
                "transcript_text": transcript_text,
                "source": source,
                "stt_provider": stt_provider,
                "stt_confidence": stt_confidence,
                "spoken_attempt_number": spoken_attempt_number,
                "score": score,
            },
        )

    def get_spoken(self, *, attempt_id, question_id):
        row = (
            PlacementSpokenAnswer.objects.filter(attempt_id=attempt_id, question_id=question_id)
            .values("transcript_text", "source")
            .first()
        )
        if row is None:
            return None
        return {"text": row["transcript_text"], "source": row["source"]}

    def list_interview_answers(self, attempt_id):
        return [
            interview_answer_to_dto(a)
            for a in PlacementSpokenAnswer.objects.select_related("question")
            .filter(attempt_id=attempt_id)
            .order_by("question__order")
        ]

    def written_count(self, attempt_id):
        return PlacementWrittenAnswer.objects.filter(attempt_id=attempt_id).count()

    def spoken_count(self, attempt_id):
        return PlacementSpokenAnswer.objects.filter(attempt_id=attempt_id).count()

    def list_written(self, attempt_id):
        return [
            written_answer_to_dto(a)
            for a in PlacementWrittenAnswer.objects.filter(attempt_id=attempt_id).order_by("question__order")
        ]

    def list_spoken(self, attempt_id):
        return [
            spoken_answer_to_dto(a)
            for a in PlacementSpokenAnswer.objects.filter(attempt_id=attempt_id).order_by("question__order")
        ]


class DjangoPlacementResultRepository(PlacementResultRepository):
    def save(self, *, attempt_id, result, evaluator_version="", provider_name="heuristic", fallback_used=False):
        rec = result.recommendation
        row, _ = PlacementAssessmentResult.objects.update_or_create(
            attempt_id=attempt_id,
            defaults={
                "cefr_level": result.cefr_level,
                "overall_conversation_score": result.overall_conversation_score,
                "grammar_score": result.grammar_score,
                "vocabulary_score": result.vocabulary_score,
                "fluency_score": result.fluency_score,
                "confidence_score": result.confidence_score,
                "written_score": result.written_score,
                "spoken_score": result.spoken_score,
                "spoken_capped": result.spoken_capped,
                "spoken_ceiling": result.spoken_ceiling,
                "strengths": list(rec.strengths),
                "weaknesses": list(rec.weaknesses),
                "recommended_focus": list(rec.recommended_focus),
                "recommended_conversation_topics": list(rec.recommended_conversation_topics),
                "recommended_instructor_difficulty": rec.recommended_instructor_difficulty,
                "evaluator_version": evaluator_version,
                "provider_name": provider_name,
                "fallback_used": fallback_used,
            },
        )
        return result_to_dto(row)

    def get_for_attempt(self, attempt_id):
        row = PlacementAssessmentResult.objects.filter(attempt_id=attempt_id).first()
        return result_to_dto(row) if row else None

    def get_latest_for_student(self, student):
        row = (
            PlacementAssessmentResult.objects.filter(attempt__student=student)
            .order_by("-created_at")
            .first()
        )
        return result_to_dto(row) if row else None


class DjangoPlacementResetAuditRepository(PlacementResetAuditRepository):
    def record(self, *, attempt_id, reset_by, reason):
        # Derive the student from the attempt so callers pass ids/actor only.
        attempt = PlacementAttempt.objects.get(pk=attempt_id)
        audit = PlacementResetAudit.objects.create(
            student=attempt.student, attempt=attempt, reset_by=reset_by, reason=reason
        )
        return str(audit.id)

    def reset_after_use(self, student):
        last_spoken = (
            PlacementSpokenAnswer.objects.filter(attempt__student=student)
            .order_by("-created_at")
            .values_list("created_at", flat=True)
            .first()
        )
        if last_spoken is None:
            return False
        last_reset = (
            PlacementResetAudit.objects.filter(student=student)
            .order_by("-reset_at")
            .values_list("reset_at", flat=True)
            .first()
        )
        return bool(last_reset and last_reset > last_spoken)


class DjangoPlacementProfileRepository(PlacementProfileRepository):
    def set_level(self, student, level):
        # Personalize the student's CEFR level; placement does not unlock booking.
        from apps.accounts.models import StudentProfile

        StudentProfile.objects.filter(pk=student.pk).update(level=level)


class DjangoPlacementInterviewSessionRepository(PlacementInterviewSessionRepository):
    def get_by_attempt(self, attempt_id):
        session = InterviewSession.objects.filter(attempt_id=attempt_id).first()
        return interview_session_to_dto(session) if session else None

    def create(self, attempt_id):
        session = InterviewSession.objects.create(
            attempt_id=attempt_id, status=InterviewStatus.CREATED
        )
        return interview_session_to_dto(session)

    def _get(self, interview_id):
        return interview_session_to_dto(InterviewSession.objects.get(pk=interview_id))

    def mark_running(self, interview_id):
        session = InterviewSession.objects.get(pk=interview_id)
        session.status = InterviewStatus.RUNNING
        if session.started_at is None:
            session.started_at = timezone.now()
        session.save(update_fields=["status", "started_at", "updated_at"])
        return interview_session_to_dto(session)

    def set_index(self, interview_id, index):
        InterviewSession.objects.filter(pk=interview_id).update(current_question_index=index)
        return self._get(interview_id)

    def mark_completed(self, interview_id):
        InterviewSession.objects.filter(pk=interview_id).update(status=InterviewStatus.COMPLETED)
        return self._get(interview_id)

    def mark_finalized(self, interview_id):
        InterviewSession.objects.filter(pk=interview_id).update(
            status=InterviewStatus.FINALIZED, finished_at=timezone.now()
        )
        return self._get(interview_id)
