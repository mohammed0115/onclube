"""
Strict validation of a raw session-report payload → SessionReportContent.

Pure domain code (no Django, no I/O). This is the anti-corruption boundary for an
external report provider (e.g. OpenAI): an infrastructure adapter parses the raw
response to a plain dict and hands it here. ANY schema violation raises
`InvalidSessionReport`, which the adapter catches to trigger the heuristic
fallback. Nothing from the model is trusted until it passes here.
"""
from __future__ import annotations

from domain.exceptions import InvalidSessionReport
from domain.session_report.provider import SessionReportContent

REQUIRED_STRING_FIELDS = (
    "overallSummary",
    "grammarFeedback",
    "vocabularyFeedback",
    "fluencyFeedback",
    "pronunciationFeedback",
    "nextLessonFocus",
)
REQUIRED_LIST_FIELDS = ("strengths", "weaknesses", "recommendedTopics", "homework")

MAX_TEXT_LEN = 4000
MAX_ITEM_LEN = 400
MAX_LIST_ITEMS = 25


def _text(value, field: str) -> str:
    if not isinstance(value, str):
        raise InvalidSessionReport(f"{field} must be a string.")
    cleaned = value.strip()
    if not cleaned:
        raise InvalidSessionReport(f"{field} must not be empty.")
    if len(cleaned) > MAX_TEXT_LEN:
        raise InvalidSessionReport(f"{field} exceeds the maximum length.")
    return cleaned


def _str_list(value, field: str) -> list[str]:
    if not isinstance(value, list):
        raise InvalidSessionReport(f"{field} must be a list.")
    if len(value) > MAX_LIST_ITEMS:
        raise InvalidSessionReport(f"{field} has too many items.")
    out: list[str] = []
    for item in value:
        if not isinstance(item, str):
            raise InvalidSessionReport(f"{field} must be a list of strings.")
        cleaned = item.strip()
        if not cleaned:
            continue  # drop blanks, keep the rest
        if len(cleaned) > MAX_ITEM_LEN:
            raise InvalidSessionReport(f"{field} item exceeds the maximum length.")
        out.append(cleaned)
    return out


def _confidence(value) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise InvalidSessionReport("confidenceScore must be a number.")
    if not (0 <= value <= 100):
        raise InvalidSessionReport("confidenceScore must be between 0 and 100.")
    return int(round(value))


def _opt_score(data, field: str):
    """Optional 0-100 skill score. Absent/null ⇒ None. Present-but-invalid ⇒ raise
    (a malformed provider payload still triggers the heuristic fallback)."""
    if field not in data or data[field] is None:
        return None
    value = data[field]
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise InvalidSessionReport(f"{field} must be a number.")
    if not (0 <= value <= 100):
        raise InvalidSessionReport(f"{field} must be between 0 and 100.")
    return int(round(value))


def parse_session_report_payload(data) -> SessionReportContent:
    """Validate a provider payload dict and assemble the report, or raise."""
    if not isinstance(data, dict):
        raise InvalidSessionReport("Report payload must be a JSON object.")

    for key in (*REQUIRED_STRING_FIELDS, *REQUIRED_LIST_FIELDS, "confidenceScore"):
        if key not in data:
            raise InvalidSessionReport(f"Missing required field: {key}.")

    return SessionReportContent(
        overall_summary=_text(data["overallSummary"], "overallSummary"),
        grammar_feedback=_text(data["grammarFeedback"], "grammarFeedback"),
        vocabulary_feedback=_text(data["vocabularyFeedback"], "vocabularyFeedback"),
        fluency_feedback=_text(data["fluencyFeedback"], "fluencyFeedback"),
        pronunciation_feedback=_text(data["pronunciationFeedback"], "pronunciationFeedback"),
        strengths=_str_list(data["strengths"], "strengths"),
        weaknesses=_str_list(data["weaknesses"], "weaknesses"),
        recommended_topics=_str_list(data["recommendedTopics"], "recommendedTopics"),
        homework=_str_list(data["homework"], "homework"),
        next_lesson_focus=_text(data["nextLessonFocus"], "nextLessonFocus"),
        confidence_score=_confidence(data["confidenceScore"]),
        grammar_score=_opt_score(data, "grammarScore"),
        vocabulary_score=_opt_score(data, "vocabularyScore"),
        fluency_score=_opt_score(data, "fluencyScore"),
        pronunciation_score=_opt_score(data, "pronunciationScore"),
    )
