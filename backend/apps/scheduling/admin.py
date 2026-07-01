from django.contrib import admin

from .models import AvailabilitySlot, Booking, Question, Subtopic, Topic


class SubtopicInline(admin.TabularInline):
    model = Subtopic
    extra = 0


class QuestionInline(admin.TabularInline):
    model = Question
    extra = 0
    fields = ("text", "ai_assisted", "approved", "sort_order")


@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "level", "instructor", "published")
    list_filter = ("published", "category", "level")
    search_fields = ("title", "category")
    raw_id_fields = ("instructor",)
    inlines = [SubtopicInline, QuestionInline]


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("text", "topic", "ai_assisted", "approved", "approved_at")
    list_filter = ("approved", "ai_assisted")
    search_fields = ("text",)
    raw_id_fields = ("topic", "approved_by")


@admin.register(AvailabilitySlot)
class AvailabilitySlotAdmin(admin.ModelAdmin):
    list_display = ("instructor", "start_at", "duration_minutes", "status")
    list_filter = ("status",)
    raw_id_fields = ("instructor",)
    date_hierarchy = "start_at"


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ("topic_title", "student", "instructor", "scheduled_at", "status", "credit_refunded")
    list_filter = ("status", "credit_refunded")
    search_fields = ("topic_title", "student__user__email")
    raw_id_fields = ("student", "topic", "instructor", "slot", "subscription")
    date_hierarchy = "scheduled_at"


admin.site.register(Subtopic)
