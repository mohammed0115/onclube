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


def default_file_storage():
    return StubFileStorageGateway()


def default_event_bus():
    return NoOpEventBus()


def default_payment_settings_gateway():
    from infrastructure.gateways.payment_settings import DjangoPaymentSettingsGateway
    return DjangoPaymentSettingsGateway()
