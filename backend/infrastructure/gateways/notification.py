"""Django-backed notification gateway — persists Notification rows."""
from apps.notifications.models import Notification

from application.ports.gateways import NotificationGateway


class DjangoNotificationGateway(NotificationGateway):
    def notify(self, *, user_id, type, title, body=None, data=None):
        return Notification.objects.create(
            user_id=user_id, type=type, title=title, body=body, data=data
        )
