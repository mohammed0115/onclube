"""
Composition root — default wiring of ports to concrete adapters.

Use cases call these factories when no dependency is injected, so production code
gets Django/stub adapters by default while tests inject fakes. This is the only
place that knows which concrete adapter backs each port.
"""
from infrastructure.gateways.ai import StubAIProvider
from infrastructure.gateways.events import NoOpEventBus
from infrastructure.gateways.file_storage import StubFileStorageGateway
from infrastructure.gateways.notification import DjangoNotificationGateway
from infrastructure.gateways.video import StubVideoProvider
from infrastructure.repositories.django import (
    DjangoAIReportRepository,
    DjangoBookingRepository,
    DjangoGoalRepository,
    DjangoNotificationRepository,
    DjangoPaymentRepository,
    DjangoPlacementRepository,
    DjangoPlanRepository,
    DjangoQuestionRepository,
    DjangoSessionRepository,
    DjangoSubscriptionRepository,
    DjangoTopicRepository,
    DjangoUserRepository,
)


# Repositories
def default_payment_repository():
    return DjangoPaymentRepository()


def default_subscription_repository():
    return DjangoSubscriptionRepository()


def default_booking_repository():
    return DjangoBookingRepository()


def default_session_repository():
    return DjangoSessionRepository()


def default_topic_repository():
    return DjangoTopicRepository()


def default_user_repository():
    return DjangoUserRepository()


def default_goal_repository():
    return DjangoGoalRepository()


def default_plan_repository():
    return DjangoPlanRepository()


def default_placement_repository():
    return DjangoPlacementRepository()


def default_question_repository():
    return DjangoQuestionRepository()


def default_ai_report_repository():
    return DjangoAIReportRepository()


def default_notification_repository():
    return DjangoNotificationRepository()


# Placement repositories (Phase 8C)
def default_placement_question_repository():
    from infrastructure.repositories.placement import DjangoPlacementQuestionRepository
    return DjangoPlacementQuestionRepository()


def default_placement_attempt_repository():
    from infrastructure.repositories.placement import DjangoPlacementAttemptRepository
    return DjangoPlacementAttemptRepository()


def default_placement_answer_repository():
    from infrastructure.repositories.placement import DjangoPlacementAnswerRepository
    return DjangoPlacementAnswerRepository()


def default_placement_result_repository():
    from infrastructure.repositories.placement import DjangoPlacementResultRepository
    return DjangoPlacementResultRepository()


def default_placement_reset_audit_repository():
    from infrastructure.repositories.placement import DjangoPlacementResetAuditRepository
    return DjangoPlacementResetAuditRepository()


def default_placement_interview_session_repository():
    from infrastructure.repositories.placement import DjangoPlacementInterviewSessionRepository
    return DjangoPlacementInterviewSessionRepository()


def default_assessment_engine():
    # Composition root chooses the scoring provider. OpenAI is primary WHEN a key
    # is configured; otherwise the deterministic heuristic is used. Either way the
    # heuristic remains the in-provider fallback, so assessment never breaks.
    from django.conf import settings

    from domain.placement.assessment import (
        HeuristicAssessmentProvider,
        PlacementAssessmentEngine,
    )

    heuristic = HeuristicAssessmentProvider()
    api_key = getattr(settings, "OPENAI_API_KEY", "") or ""
    if api_key:
        from infrastructure.gateways.openai_assessment import OpenAIAssessmentProvider

        provider = OpenAIAssessmentProvider(
            fallback=heuristic,
            api_key=api_key,
            model=getattr(settings, "OPENAI_MODEL", "gpt-4o-mini"),
            timeout=getattr(settings, "OPENAI_TIMEOUT_SECONDS", 20),
        )
    else:
        provider = heuristic
    return PlacementAssessmentEngine(provider=provider)


def default_placement_profile_repository():
    from infrastructure.repositories.placement import DjangoPlacementProfileRepository
    return DjangoPlacementProfileRepository()


# Gateways
def default_notification_gateway():
    return DjangoNotificationGateway()


def _provider_mode() -> str:
    """development | testing | staging | production. Read ONLY here (Sprint 10)."""
    from django.conf import settings
    return getattr(settings, "PROVIDER_MODE", "development")


def _is_production_mode() -> bool:
    return _provider_mode() in ("staging", "production")


def default_video_provider():
    # Real Agora video provisioning in staging/production WHEN configured; else stub.
    from django.conf import settings

    app_id = getattr(settings, "AGORA_APP_ID", "") or ""
    if _is_production_mode() and app_id:
        from infrastructure.gateways.agora import AgoraVideoProvider
        return AgoraVideoProvider(app_id=app_id, fallback=StubVideoProvider())
    return StubVideoProvider()


def default_meeting_token_provider():
    # Real Agora token minting in staging/production WHEN app id + certificate are
    # configured; otherwise the stub. The Agora adapter also self-heals to the stub
    # on any signing failure.
    from django.conf import settings
    from infrastructure.gateways.meeting_token import StubMeetingTokenProvider

    app_id = getattr(settings, "AGORA_APP_ID", "") or ""
    certificate = getattr(settings, "AGORA_APP_CERTIFICATE", "") or ""
    if _is_production_mode() and app_id and certificate:
        from infrastructure.gateways.agora import AgoraMeetingTokenProvider
        return AgoraMeetingTokenProvider(
            app_id=app_id,
            app_certificate=certificate,
            ttl_seconds=getattr(settings, "AGORA_TOKEN_TTL_SECONDS", 3600),
            fallback=StubMeetingTokenProvider(),
        )
    return StubMeetingTokenProvider()


def default_ai_provider():
    # Real OpenAI topic assistance (subtopic/question suggestions) WHEN a key is
    # configured; otherwise the deterministic stub. OpenAI always falls back to the
    # stub on any failure, so topic building never breaks.
    from django.conf import settings

    stub = StubAIProvider()
    api_key = getattr(settings, "OPENAI_API_KEY", "") or ""
    if api_key:
        from infrastructure.gateways.topic_assist import OpenAITopicAssistProvider

        return OpenAITopicAssistProvider(
            fallback=stub,
            api_key=api_key,
            model=getattr(settings, "OPENAI_MODEL", "gpt-4o-mini"),
            timeout=getattr(settings, "OPENAI_TIMEOUT_SECONDS", 20),
        )
    return stub


def default_session_report_provider():
    """AI session report generator (Sprint 9). OpenAI is primary WHEN a key is
    configured; otherwise the deterministic heuristic is used. OpenAI always falls
    back to the heuristic on any failure."""
    from django.conf import settings

    from domain.session_report import HeuristicSessionReportProvider

    heuristic = HeuristicSessionReportProvider()
    api_key = getattr(settings, "OPENAI_API_KEY", "") or ""
    if api_key:
        from infrastructure.gateways.session_report import OpenAISessionReportProvider

        return OpenAISessionReportProvider(
            fallback=heuristic,
            api_key=api_key,
            model=getattr(settings, "OPENAI_MODEL", "gpt-4o-mini"),
            timeout=getattr(settings, "OPENAI_TIMEOUT_SECONDS", 20),
        )
    return heuristic


def default_interviewer_provider():
    # Sprint 2.0.1A: the placement interview is FULLY DETERMINISTIC and OneClub-owned
    # — NO LLM in the interview path. Every spoken line comes from the fixed, versioned
    # OneClub script. (The separate placement ASSESSMENT engine keeps its own OpenAI
    # adapter and is untouched.)
    from infrastructure.gateways.interviewer import OneClubInterviewScriptProvider

    return OneClubInterviewScriptProvider()


def default_file_storage():
    return StubFileStorageGateway()


def default_event_bus():
    return NoOpEventBus()


def default_payment_settings_gateway():
    from infrastructure.gateways.payment_settings import DjangoPaymentSettingsGateway
    return DjangoPaymentSettingsGateway()
