from django.contrib import admin

from .models import AIReport


@admin.register(AIReport)
class AIReportAdmin(admin.ModelAdmin):
    list_display = ("booking", "student", "topic_title", "overall_score", "status", "generated_at")
    list_filter = ("status",)
    search_fields = ("topic_title", "student__user__email")
    raw_id_fields = ("session", "booking", "student")
    readonly_fields = ("created_at", "updated_at")
