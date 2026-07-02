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


def default_video_provider():
    # STUB — replace with AgoraVideoProvider in a later phase.
    return StubVideoProvider()


def default_ai_provider():
    # STUB — replace with OpenAIProvider in a later phase.
    return StubAIProvider()


def default_interviewer_provider():
    # STUB — replace with a real conversational adapter behind the same port later.
    from infrastructure.gateways.interviewer import StubInterviewerProvider
    return StubInterviewerProvider()


def default_file_storage():
    return StubFileStorageGateway()


def default_event_bus():
    return NoOpEventBus()


def default_payment_settings_gateway():
    from infrastructure.gateways.payment_settings import DjangoPaymentSettingsGateway
    return DjangoPaymentSettingsGateway()
