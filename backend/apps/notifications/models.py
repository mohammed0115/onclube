"""
notifications — per-user notifications. Maps database design table: notifications.
"""
from django.db import models

from apps.common.enums import NotificationType
from apps.common.models import UUIDModel


class Notification(UUIDModel):
    user = models.ForeignKey(
        "accounts.User", on_delete=models.CASCADE, related_name="notifications"
    )
    type = models.CharField(max_length=40, choices=NotificationType.choices)
    title = models.CharField(max_length=160)
    body = models.TextField(null=True, blank=True)
    read = models.BooleanField(default=False)
    data = models.JSONField(null=True, blank=True)  # deep-link ids
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications"
        indexes = [models.Index(fields=["user", "read", "-created_at"])]

    def __str__(self):
        return f"Notification<{self.user_id} {self.type}>"
