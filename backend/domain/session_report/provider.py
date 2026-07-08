"""
AI Session Report — domain provider interface + value objects (Sprint 9).

Pure domain: no Django, no OpenAI, no I/O. The report is generated ONLY from
already-captured session artifacts and NEVER participates in the live meeting.

  SessionReportContext   — the read-only inputs a report may consume.
  SessionReportContent   — the validated report (the ONLY fields we generate).
  GeneratedSessionReport — content + minimal server-side meta (never exposed).
  SessionReportProvider  — the port an adapter (heuristic / OpenAI / …) implements.

The report deliberately excludes placement level, CEFR, grades, attendance score,
subscription data, and teacher evaluation — those are out of scope here.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass(frozen=True)
class SessionReportContext:
    """Read-only inputs. FINALIZED transcript only — never partial / live events."""

    topic_title: str
    instructor_name: str
    duration_minutes: int
    goal: str | None = None
    level: str | None = None  # placement level (read-only signal; never emitted)
    transcript_lines: tuple[str, ...] = ()  # finalized transcript text only
    teacher_notes: str | None = None
    attended_minutes: int | None = None  # attendance metadata (read-only)
    had_recording: bool = False  # recording metadata (read-only)

    @property
    def turns(self) -> int:
        return len(self.transcript_lines)


@dataclass(frozen=True)
class SessionReportContent:
    """The report — EXACTLY these fields, nothing more."""

    overall_summary: str
    grammar_feedback: str
    vocabulary_feedback: str
    fluency_feedback: str
    pronunciation_feedback: str
    strengths: list[str] = field(default_factory=list)
    weaknesses: list[str] = field(default_factory=list)
    recommended_topics: list[str] = field(default_factory=list)
    homework: list[str] = field(default_factory=list)
    next_lesson_focus: str = ""
    confidence_score: int = 0  # 0-100

    def to_camel_dict(self) -> dict:
        """Client-facing shape (camelCase). Only the validated fields — no prompt,
        no provider, no raw output, no chain of thought."""
        return {
            "overallSummary": self.overall_summary,
            "grammarFeedback": self.grammar_feedback,
            "vocabularyFeedback": self.vocabulary_feedback,
            "fluencyFeedback": self.fluency_feedback,
            "pronunciationFeedback": self.pronunciation_feedback,
            "strengths": list(self.strengths),
            "weaknesses": list(self.weaknesses),
            "recommendedTopics": list(self.recommended_topics),
            "homework": list(self.homework),
            "nextLessonFocus": self.next_lesson_focus,
            "confidenceScore": self.confidence_score,
        }


@dataclass(frozen=True)
class GeneratedSessionReport:
    content: SessionReportContent
    provider_name: str  # server-side meta — NEVER serialized to the client
    fallback_used: bool


class SessionReportProvider(ABC):
    """Port for report generation. Implementations own generation, validation, and
    fallback; the domain/application never learn which engine is used."""

    @abstractmethod
    def generate(self, *, context: SessionReportContext) -> GeneratedSessionReport:
        ...
