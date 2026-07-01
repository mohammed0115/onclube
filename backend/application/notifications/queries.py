"""Notification query use cases (read-only). User-owned."""
from application import mappers
from domain.dtos import NotificationResult
from domain.exceptions import PermissionDenied
from infrastructure.container import default_notification_repository


class ListNotificationsUseCase:
    """The actor's own notifications, newest first."""

    def __init__(self, *, notifications=None):
        self.notifications = notifications or default_notification_repository()

    def execute(self, *, actor) -> list:
        if actor is None:
            raise PermissionDenied()
        rows = self.notifications.list_for_user(actor)
        return [mappers.notification(n) for n in rows]
