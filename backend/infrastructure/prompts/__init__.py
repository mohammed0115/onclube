"""
Server-side prompt architecture (Sprint 4.5).

Prompts are INTERNAL, VERSIONED assets. Providers do not own prompt text — they
receive built messages from a PromptBuilder. Nothing here is ever exposed to the
frontend or through the API.
"""
from .base import PromptBuilder, PromptMessages, PromptTemplate, PromptVersion
from .placement_assessment import (
    PLACEMENT_ASSESSMENT_TEMPLATE,
    PlacementAssessmentPromptBuilder,
)
from .session_report import SESSION_REPORT_TEMPLATE, SessionReportPromptBuilder

__all__ = [
    "PromptTemplate",
    "PromptVersion",
    "PromptMessages",
    "PromptBuilder",
    "PlacementAssessmentPromptBuilder",
    "PLACEMENT_ASSESSMENT_TEMPLATE",
    "SessionReportPromptBuilder",
    "SESSION_REPORT_TEMPLATE",
]
