from django.contrib import admin

from .models import File, PaymentProof, Plan, Subscription


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "price", "currency", "sessions_per_month", "active")
    list_filter = ("active", "recommended")
    search_fields = ("code", "name")


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("student", "plan", "status", "sessions_remaining", "started_at", "expires_at")
    list_filter = ("status",)
    raw_id_fields = ("student", "plan", "activated_by", "extended_by")
    readonly_fields = ("created_at", "updated_at")


@admin.register(PaymentProof)
class PaymentProofAdmin(admin.ModelAdmin):
    list_display = ("transaction_number", "student", "plan_name", "amount", "currency", "status", "submitted_at")
    list_filter = ("status", "currency")
    search_fields = ("transaction_number", "student__user__email")
    raw_id_fields = ("student", "subscription", "plan", "receipt_file", "reviewed_by")
    readonly_fields = ("submitted_at", "reviewed_at", "retain_until", "created_at", "updated_at")
    date_hierarchy = "submitted_at"


@admin.register(File)
class FileAdmin(admin.ModelAdmin):
    list_display = ("filename", "content_type", "size_bytes", "created_at")
    search_fields = ("filename", "storage_key")
