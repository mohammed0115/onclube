"""Onboarding query use cases."""
from application import mappers
from application.permissions import ensure_student_owns
from domain.dtos import GoalOptionResult, PlacementResultDetail
from infrastructure.container import (
    default_goal_repository,
    default_placement_repository,
)


class ListGoalOptionsUseCase:
    """Reference data — any authenticated actor may read the goal catalogue."""

    def __init__(self, *, goals=None):
        self.goals = goals or default_goal_repository()

    def execute(self, *, actor) -> list:
        return [mappers.goal_option(g) for g in self.goals.list_active()]


class GetPlacementTestUseCase:
    """Active placement questions WITHOUT the server-only `correct_index`."""

    def __init__(self, *, placement=None):
        self.placement = placement or default_placement_repository()

    def execute(self, *, actor) -> list:
        return [
            mappers.placement_question(q) for q in self.placement.list_active_questions()
        ]


class GetPlacementAttemptUseCase:
    """Read the scored result for a placement attempt (owner-only)."""

    def __init__(self, *, placement=None):
        self.placement = placement or default_placement_repository()

    def execute(self, *, actor, attempt_id) -> PlacementResultDetail:
        attempt = self.placement.get_attempt(attempt_id)
        ensure_student_owns(actor, attempt.student)
        result = self.placement.get_result_for_attempt(attempt)
        if result is None:
            # No result yet — surface as not-found to the presentation layer.
            from apps.onboarding.models import PlacementResult

            raise PlacementResult.DoesNotExist("Placement not scored yet.")
        return mappers.placement_result_detail(result)
