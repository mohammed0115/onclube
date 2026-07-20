"""AI-tutor use cases — permission boundary over apps.ai_tutor.services."""
from apps.ai_tutor import services as ai_tutor_services
from application.permissions import get_student_profile


class GetAITutorStatusUseCase:
    def execute(self, *, actor) -> dict:
        return ai_tutor_services.get_status(get_student_profile(actor))


class StartAITutorSessionUseCase:
    def execute(self, *, actor, topic="") -> dict:
        return ai_tutor_services.start_session(get_student_profile(actor), topic=topic)


class SendAITutorMessageUseCase:
    def execute(self, *, actor, session_id, text) -> dict:
        return ai_tutor_services.post_message(get_student_profile(actor), session_id, text)


class EndAITutorSessionUseCase:
    def execute(self, *, actor, session_id) -> dict:
        return ai_tutor_services.end_session(get_student_profile(actor), session_id)
