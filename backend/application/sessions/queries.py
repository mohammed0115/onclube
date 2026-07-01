"""Session query use cases (read-only)."""
from application import mappers
from application.permissions import ensure_session_participant
from domain.dtos import SessionDetailResult
from infrastructure.container import (
    default_question_repository,
    default_session_repository,
)


class GetSessionDetailUseCase:
    """Room context for a participant: questions (approved) + vocabulary + notes."""

    def __init__(self, *, sessions=None, questions=None):
        self.sessions = sessions or default_session_repository()
        self.questions = questions or default_question_repository()

    def execute(self, *, actor, session_id) -> SessionDetailResult:
        session = self.sessions.get(session_id)
        ensure_session_participant(actor, session)
        approved = self.questions.list_approved_for_topic(session.booking.topic)
        return mappers.session_detail(session, approved)
