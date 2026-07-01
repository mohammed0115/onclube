"""
admin_ops — append-only audit log of manual admin actions (§1.21, §6).

Never updated or deleted. The system of record for: manual payment
approval/rejection/reopen, subscription extension/top-up, manual refund notes,
and booking-cancellation credit overrides.
"""
from django.db import models

from apps.common.enums import AdminActionType
from apps.common.models import UUIDModel


class AdminAction(UUIDModel):
    admin = models.ForeignKey(
        "accounts.User", on_delete=models.PROTECT, related_name="admin_actions"
    )
    action_type = models.CharField(max_length=40, choices=AdminActionType.choices)
    target_table = models.CharField(max_length=60)
    target_id = models.UUIDField()
    amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, null=True, blank=True)
    reason = models.TextField(null=True, blank=True)
    metadata = models.JSONField(null=True, blank=True)  # before/after snapshot
    created_at = models.DateTimeField(auto_now_add=True)  # append-only; no updated_at

    class Meta:
        db_table = "admin_actions"
        indexes = [
            models.Index(fields=["target_table", "target_id"]),
            models.Index(fields=["admin", "-created_at"]),
            models.Index(fields=["action_type", "-created_at"]),
        ]

    def __str__(self):
        return f"AdminAction<{self.action_type} {self.target_table}:{self.target_id}>"
