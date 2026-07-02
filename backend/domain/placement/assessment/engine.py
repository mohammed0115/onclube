"""
PlacementAssessmentEngine — pure orchestration over an AssessmentProvider.

Responsibilities (and ONLY these):
  * validate + normalize the input (written answers, spoken transcript, goal)
  * delegate scoring to the injected AssessmentProvider
  * return exactly one structured PlacementAssessmentResult DTO

Explicitly NOT responsibilities: persistence, notifications, dashboard/business
workflows, or touching interview data. The engine is pure and deterministic when
its provider is.
"""
from __future__ import annotations

from domain.placement.assessment.heuristic import HeuristicAssessmentProvider
from domain.placement.assessment.provider import AssessmentInput, AssessmentProvider
from domain.placement.dtos import PlacementAssessmentResult


class PlacementAssessmentEngine:
    def __init__(self, provider: AssessmentProvider | None = None):
        # Default to the deterministic heuristic so placement never depends on AI.
        self.provider: AssessmentProvider = provider or HeuristicAssessmentProvider()

    def run(self, assessment_input: AssessmentInput) -> PlacementAssessmentResult:
        return self.provider.assess(assessment_input)

    def assess(self, *, written, spoken, goal=None) -> PlacementAssessmentResult:
        """Convenience: build validated input, then run the provider."""
        return self.run(AssessmentInput.from_answers(written, spoken, goal))
