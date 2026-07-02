"""
Heuristic assessment provider — the deterministic DEFAULT.

Every score comes from explicit rules in `domain.placement.scoring` /
`domain.placement.cefr` / `domain.placement.recommendations`. There is NO
randomness and NO network call: identical input always yields identical output.

This provider wraps the proven pure `assessor.assess(...)` so the scoring policy
lives in one place. A future `OpenAIAssessmentProvider` implements the same
`AssessmentProvider` interface (in the infrastructure layer, since it does I/O)
and can replace this one behind the engine.
"""
from __future__ import annotations

from domain.placement import assessor
from domain.placement.assessment.provider import AssessmentInput, AssessmentProvider
from domain.placement.dtos import PlacementAssessmentResult


class HeuristicAssessmentProvider(AssessmentProvider):
    name = "heuristic"

    def assess(self, assessment_input: AssessmentInput) -> PlacementAssessmentResult:
        return assessor.assess(
            list(assessment_input.written),
            list(assessment_input.spoken),
            goal=assessment_input.goal,
        )
