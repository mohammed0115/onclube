from django.contrib import admin

from .models import Session, SessionTranscript


@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_display = ("booking", "status", "started_at", "ended_at", "agora_channel")
    list_filter = ("status",)
    raw_id_fields = ("booking",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(SessionTranscript)
class SessionTranscriptAdmin(admin.ModelAdmin):
    list_display = ("session", "source", "created_at")
    list_filter = ("source",)
    raw_id_fields = ("session",)
