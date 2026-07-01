from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("user", "type", "title", "read", "created_at")
    list_filter = ("type", "read")
    search_fields = ("user__email", "title")
    raw_id_fields = ("user",)
