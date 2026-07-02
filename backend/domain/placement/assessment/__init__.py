"""
Placement Assessment Engine (Sprint 3).

A pure, deterministic, framework-independent engine that evaluates a student's
written answers + finalized speaking transcript (+ goal) and returns ONE
structured assessment DTO. It has NO dependency on Django, the ORM, the API, the
UI, or any AI provider, and it NEVER persists, notifies, or mutates anything.

Architecture:

    PlacementAssessmentEngine
        ↓ (depends on the abstract)
    AssessmentProvider
        ↳ HeuristicAssessmentProvider   (now — deterministic rules)
        ↳ OpenAIAssessmentProvider       (future — same interface, in infrastructure)

Swapping the provider requires no change to the domain, use cases, APIs, DB, or
frontend — only the composition root (container) picks the concrete provider.
"""
from .engine import PlacementAssessmentEngine
from .heuristic import HeuristicAssessmentProvider
from .provider import AssessmentInput, AssessmentProvider
from .schema import parse_assessment_payload

__all__ = [
    "PlacementAssessmentEngine",
    "AssessmentProvider",
    "AssessmentInput",
    "HeuristicAssessmentProvider",
    "parse_assessment_payload",
]
