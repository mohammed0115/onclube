from django.contrib import admin

from .models import (
    PlacementAssessmentResult,
    PlacementAttempt,
    PlacementQuestion,
    PlacementResetAudit,
    PlacementSpokenAnswer,
    PlacementWrittenAnswer,
)


@admin.register(PlacementQuestion)
class PlacementQuestionAdmin(admin.ModelAdmin):
    list_display = ("question_type", "order", "skill", "cefr_band", "is_active", "prompt")
    list_filter = ("question_type", "skill", "cefr_band", "is_active")
    search_fields = ("prompt",)
    ordering = ("question_type", "order")


@admin.register(PlacementAttempt)
class PlacementAttemptAdmin(admin.ModelAdmin):
    list_display = ("id", "student", "status", "version", "provider_name", "started_at", "assessed_at")
    list_filter = ("status",)
    raw_id_fields = ("student", "goal")
    date_hierarchy = "started_at"


@admin.register(PlacementAssessmentResult)
class PlacementAssessmentResultAdmin(admin.ModelAdmin):
    list_display = ("attempt", "cefr_level", "overall_conversation_score", "provider_name", "fallback_used", "created_at")
    list_filter = ("cefr_level", "provider_name", "fallback_used")
    raw_id_fields = ("attempt",)


@admin.register(PlacementResetAudit)
class PlacementResetAuditAdmin(admin.ModelAdmin):
    """Read-only audit trail — never edited or deleted."""

    list_display = ("student", "attempt", "reset_by", "reset_at")
    raw_id_fields = ("student", "attempt", "reset_by")
    date_hierarchy = "reset_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register(PlacementWrittenAnswer)
admin.site.register(PlacementSpokenAnswer)
