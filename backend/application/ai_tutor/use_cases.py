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


class StartRealtimeCallUseCase:
    """Mint an ephemeral OpenAI Realtime token for a live WebRTC voice call. Gated on
    an active AI-tutor subscription (same gate as the text session)."""

    def execute(self, *, actor, voice="alloy") -> dict:
        from apps.common.exceptions import BusinessRuleError
        from apps.ai_tutor import realtime

        student = get_student_profile(actor)
        if ai_tutor_services.active_subscription(student) is None:
            raise BusinessRuleError(
                "An active AI-tutor subscription is required.", code="no_ai_tutor_subscription"
            )
        prompt = realtime.build_voice_system_prompt(student, voice=voice)
        session = realtime.request_ephemeral_session(system_prompt=prompt, voice=voice)
        from django.conf import settings

        return {
            "clientSecret": session["client_secret"],
            "sessionId": session["session_id"],
            "model": session["model"],
            "voice": realtime.coerce_voice(voice),
            "expiresAt": session.get("expires_at"),
            "maxSeconds": getattr(settings, "AI_REALTIME_MAX_SESSION_SECONDS", 300),
        }


class RelayRealtimeSdpUseCase:
    """Relay the browser's SDP offer to OpenAI Realtime; returns its SDP answer."""

    def execute(self, *, actor, client_secret, sdp):
        from apps.ai_tutor import realtime

        get_student_profile(actor)  # students only
        return realtime.relay_sdp(client_secret=client_secret, sdp=sdp)
