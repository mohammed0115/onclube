"""
Prompt architecture primitives.

  PromptVersion   — version + review note (metadata for a template).
  PromptTemplate  — a versioned, reviewable prompt asset (system/instruction +
                    expected output schema). Server-side only.
  PromptMessages  — the built messages handed to a model provider.
  PromptBuilder   — abstract builder that turns typed context into PromptMessages.

These are infrastructure assets: the domain and application layers never import
them, and they are never serialized to a client.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class PromptVersion:
    version: str
    review_note: str = ""


@dataclass(frozen=True)
class PromptTemplate:
    prompt_id: str
    purpose: str
    system_message: str
    instruction_message: str
    expected_output_schema: dict = field(default_factory=dict)
    version: PromptVersion = field(default_factory=lambda: PromptVersion("v1"))

    def __post_init__(self):
        # A template is only usable if its core fields are present — this makes an
        # "invalid/missing template" fail fast (the provider catches → fallback).
        if not (self.prompt_id and self.system_message and self.instruction_message):
            raise ValueError("PromptTemplate requires prompt_id, system_message, instruction_message.")


@dataclass(frozen=True)
class PromptMessages:
    system: str
    instruction: str
    user: str

    def to_openai_messages(self) -> list[dict]:
        # System + instruction are combined into the system role for broad model
        # compatibility; the user message carries only the assessment content.
        system_content = self.system if not self.instruction else f"{self.system}\n\n{self.instruction}"
        return [
            {"role": "system", "content": system_content},
            {"role": "user", "content": self.user},
        ]


class PromptBuilder(ABC):
    """Turns typed context into PromptMessages using a versioned template."""

    @property
    @abstractmethod
    def template(self) -> PromptTemplate:
        ...

    @abstractmethod
    def build(self, context: Any) -> PromptMessages:
        ...
