from django.contrib import admin

from .models import Goal, PlacementAttempt, PlacementQuestion, PlacementResult


@admin.register(Goal)
class GoalAdmin(admin.ModelAdmin):
    list_display = ("label", "code", "active")
    list_filter = ("active",)
    search_fields = ("code", "label")


@admin.register(PlacementQuestion)
class PlacementQuestionAdmin(admin.ModelAdmin):
    list_display = ("prompt", "skill", "active")
    list_filter = ("skill", "active")
    search_fields = ("prompt",)


@admin.register(PlacementAttempt)
class PlacementAttemptAdmin(admin.ModelAdmin):
    list_display = ("student", "submitted_at")
    raw_id_fields = ("student",)
    date_hierarchy = "submitted_at"


@admin.register(PlacementResult)
class PlacementResultAdmin(admin.ModelAdmin):
    list_display = ("student", "level", "level_label", "created_at")
    list_filter = ("level",)
    raw_id_fields = ("student", "attempt")
