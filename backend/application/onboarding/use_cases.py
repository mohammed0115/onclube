"""Onboarding command use cases."""
from django.db import transaction

from application import mappers
from application.permissions import get_student_profile
from domain.dtos import UserProfileResult
from infrastructure.container import default_goal_repository


class SetStudentGoalUseCase:
    """A student sets their learning goal (own profile only)."""

    def __init__(self, *, goals=None):
        self.goals = goals or default_goal_repository()

    @transaction.atomic
    def execute(self, *, actor, goal_id) -> UserProfileResult:
        student = get_student_profile(actor)
        goal = self.goals.get(goal_id)  # raises DoesNotExist → 404 if unknown
        student.goal = goal
        student.save(update_fields=["goal", "updated_at"])
        return mappers.user_profile(student.user, student=student)
