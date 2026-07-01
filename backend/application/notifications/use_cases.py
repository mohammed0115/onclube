"""Notification command use cases."""
from django.db import transaction

from application import mappers
from application.permissions import ensure_notification_owner
from domain.dtos import NotificationResult
from infrastructure.container import default_notification_repository


class MarkNotificationReadUseCase:
    def __init__(self, *, notifications=None):
        self.notifications = notifications or default_notification_repository()

    @transaction.atomic
    def execute(self, *, actor, notification_id) -> NotificationResult:
        notification = self.notifications.get(notification_id)
        ensure_notification_owner(actor, notification)
        if not notification.read:
            notification.read = True
            notification.save(update_fields=["read"])
        return mappers.notification(notification)
