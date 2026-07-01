from django.contrib import admin

from .models import AdminAction


@admin.register(AdminAction)
class AdminActionAdmin(admin.ModelAdmin):
    """Read-only — the audit log is append-only and never edited."""

    list_display = ("action_type", "admin", "target_table", "target_id", "amount", "created_at")
    list_filter = ("action_type",)
    search_fields = ("target_id", "admin__email")
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
