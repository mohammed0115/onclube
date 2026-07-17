"""
Model ↔ DTO mappers for placement persistence (Phase 8C).

Pure conversion only — NO scoring logic here (that lives in domain.placement).
The public question mapper deliberately omits the server-only answer key.
"""
from __future__ import annotations

from domain.placement.dtos import (
    InterviewAnswerDTO,
    InterviewSessionDTO,
    PlacementAttemptDTO,
    PlacementQuestionDTO,
    PlacementRecommendationResult,
    PlacementSpokenAnswer,
    PlacementStoredResult,
    PlacementWrittenAnswer,
)


def written_answer_to_dto(a) -> PlacementWrittenAnswer:
    return PlacementWrittenAnswer(question_id=str(a.question_id), answer_text=a.answer_text)


def spoken_answer_to_dto(a) -> PlacementSpokenAnswer:
    return PlacementSpokenAnswer(question_id=str(a.question_id), transcript=a.transcript_text)


def interview_answer_to_dto(a) -> InterviewAnswerDTO:
    return InterviewAnswerDTO(
        question_id=str(a.question_id),
        order=a.question.order,
        transcript_text=a.transcript_text,
        source=a.source,
    )


def interview_session_to_dto(s) -> InterviewSessionDTO:
    return InterviewSessionDTO(
        interview_id=str(s.id),
        attempt_id=str(s.attempt_id),
        status=s.status,
        current_question_index=s.current_question_index,
        started_at=s.started_at,
        finished_at=s.finished_at,
        script_version=getattr(s, "script_version", "") or "",
    )


def question_to_dto(q) -> PlacementQuestionDTO:
    # `options` (the visible MCQ choices) ARE exposed. The answer key —
    # correct_answer / correct_index / scoring_rubric — is deliberately NOT mapped.
    return PlacementQuestionDTO(
        id=str(q.id),
        question_type=q.question_type,
        prompt=q.prompt,
        skill=q.skill,
        cefr_band=q.cefr_band,
        order=q.order,
        options=tuple(q.options or ()),
    )


def attempt_to_dto(a) -> PlacementAttemptDTO:
    return PlacementAttemptDTO(
        id=str(a.id),
        student_id=str(a.student_id),
        status=a.status,
        version=a.version,
        goal_id=str(a.goal_id) if a.goal_id else None,
        started_at=a.started_at,
        submitted_at=a.submitted_at,
        assessed_at=a.assessed_at,
        fallback_used=a.fallback_used,
        provider_name=a.provider_name,
    )


def result_to_dto(r) -> PlacementStoredResult:
    return PlacementStoredResult(
        attempt_id=str(r.attempt_id),
        cefr_level=r.cefr_level,
        overall_conversation_score=r.overall_conversation_score,
        grammar_score=r.grammar_score,
        vocabulary_score=r.vocabulary_score,
        fluency_score=r.fluency_score,
        confidence_score=r.confidence_score,
        written_score=r.written_score,
        spoken_score=r.spoken_score,
        spoken_capped=r.spoken_capped,
        spoken_ceiling=r.spoken_ceiling,
        evaluator_version=r.evaluator_version,
        provider_name=r.provider_name,
        fallback_used=r.fallback_used,
        recommendation=PlacementRecommendationResult(
            strengths=list(r.strengths or []),
            weaknesses=list(r.weaknesses or []),
            recommended_focus=list(r.recommended_focus or []),
            recommended_conversation_topics=list(r.recommended_conversation_topics or []),
            recommended_instructor_difficulty=r.recommended_instructor_difficulty,
        ),
    )
