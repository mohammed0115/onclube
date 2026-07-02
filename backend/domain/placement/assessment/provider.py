"""
Assessment provider contract + input value object.

Pure domain code: no Django, no ORM, no I/O. The `AssessmentProvider` is the
single seam behind which a scoring strategy lives (deterministic heuristic now,
OpenAI later) — the engine and use cases depend ONLY on this abstraction.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

from domain.exceptions import InvalidAssessmentInput
from domain.placement.dtos import (
    PlacementAssessmentResult,
    PlacementSpokenAnswer,
    PlacementWrittenAnswer,
)


@dataclass(frozen=True)
class AssessmentInput:
    """The ONLY inputs the engine accepts: written answers, the finalized speaking
    transcript, and the student's goal. Nothing else (no ids, no PII, no DB rows)."""

    written: tuple = ()
    spoken: tuple = ()
    goal: Optional[str] = None

    @classmethod
    def from_answers(cls, written, spoken, goal=None) -> "AssessmentInput":
        """Coerce + validate inputs. Raises InvalidAssessmentInput on bad shapes."""
        written_t = _validate_written(written)
        spoken_t = _validate_spoken(spoken)
        if goal is not None and not isinstance(goal, str):
            raise InvalidAssessmentInput("goal must be a string or None.")
        return cls(written=written_t, spoken=spoken_t, goal=goal)


def _validate_written(written) -> tuple:
    items = list(written or [])
    for a in items:
        # Accept the domain DTO or any object exposing the same attributes.
        if not (hasattr(a, "answer_text") and hasattr(a, "question_id")):
            raise InvalidAssessmentInput(
                "Each written answer must have question_id and answer_text."
            )
        if not isinstance(getattr(a, "answer_text"), str):
            raise InvalidAssessmentInput("written answer_text must be a string.")
    return tuple(items)


def _validate_spoken(spoken) -> tuple:
    items = list(spoken or [])
    for a in items:
        if not hasattr(a, "transcript"):
            raise InvalidAssessmentInput("Each spoken answer must have a transcript.")
        if not isinstance(getattr(a, "transcript"), str):
            raise InvalidAssessmentInput("spoken transcript must be a string.")
    return tuple(items)


class AssessmentProvider(ABC):
    """A scoring strategy. Implementations must be side-effect free: evaluate the
    input and return a DTO. They MUST NOT persist, notify, or mutate anything, and
    MUST NOT leak prompts / provider configuration through the returned DTO."""

    #: Stable identifier recorded on the result (e.g. "heuristic", "openai").
    name: str = "provider"

    @abstractmethod
    def assess(self, assessment_input: AssessmentInput) -> PlacementAssessmentResult:
        ...


# Re-export the answer DTOs so callers can build input from one module.
__all__ = [
    "AssessmentInput",
    "AssessmentProvider",
    "PlacementWrittenAnswer",
    "PlacementSpokenAnswer",
]
