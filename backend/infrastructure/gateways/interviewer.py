"""
OneClub placement interview script — DETERMINISTIC and version-controlled.

NO LLM. NO prompts. NO network. Every line the tutor speaks in the placement
speaking interview comes from the fixed strings below, and the five questions are
OneClub-owned and asked verbatim, in order (the questions themselves live in the
seeded PlacementQuestion rows).

Sprint 2.0.1A: this module — and the whole placement-interview path — must never
import or call any language-model provider. A static test enforces that. The
separate placement ASSESSMENT engine keeps its own OpenAI adapter and is untouched.
"""
from application.ports.gateways import InterviewerProvider

# ── versioned OneClub script identity (exposed for auditability) ───────────────
SCRIPT_ID = "oneclub.placement.interview"
SCRIPT_VERSION = "1.0.0"
LANGUAGE = "en"

# ── fixed dialogue (reviewed, deterministic) ──────────────────────────────────
_GREETING = "Hello. Welcome to your OneClup speaking assessment."
_INSTRUCTIONS = (
    "I will ask you five short questions. Please answer naturally in English. "
    "You can listen again or record your answer again before confirming it."
)
_CLOSING = "You have completed the speaking interview. Your answers have been saved."
_ENCOURAGEMENT = "Thank you."

# Fixed, reviewed, meaning-preserving clarifications keyed by the canonical
# question text. No sample answers, no hints, no grammar/scoring cues.
_CLARIFICATIONS = {
    "What is your name?": "Please tell me the name people call you.",
    "How old are you?": "Please tell me your age.",
    "Where are you from?": "Please tell me your country or city.",
    "What do you do for a living?": "Please tell me your job or what you study.",
    "Why do you want to learn English?": "Please tell me your reason for learning English.",
}

_ORDINAL = {2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven"}


class OneClubInterviewScriptProvider(InterviewerProvider):
    """The deterministic OneClub interview script. Fixed, offline, versioned —
    identical input always yields identical lines. No model, no prompt, no key."""

    provider_name = "oneclub-script"

    # ── script identity ──
    def script_id(self) -> str:
        return SCRIPT_ID

    def script_version(self) -> str:
        return SCRIPT_VERSION

    def language(self) -> str:
        return LANGUAGE

    # ── fixed dialogue ──
    def greeting(self) -> str:
        return _GREETING

    def instructions(self) -> str:
        return _INSTRUCTIONS

    def closing(self) -> str:
        return _CLOSING

    def encouragement(self) -> str:
        return _ENCOURAGEMENT

    def preamble(self, *, order: int, total: int) -> str:
        # Neutral, fixed lead-in — never a paraphrase of the question itself.
        if order <= 1:
            return "Let's begin with the first question."
        if order >= total:
            return "Here is the last question."
        return "Let's continue."

    def clarification(self, *, prompt: str) -> str:
        # Fixed reviewed mapping; unknown prompt falls back to the exact question
        # (never altered), so meaning can never drift.
        return _CLARIFICATIONS.get(prompt, prompt)

    def resume_messages(self, *, total: int) -> tuple:
        """One deterministic 'Welcome back' line per progress point: when k answers
        (1..total-1) are already saved, continue with question k+1."""
        out = []
        for k in range(1, max(total, 1)):
            nxt = _ORDINAL.get(k + 1, str(k + 1))
            out.append(f"Welcome back. Let's continue with question {nxt}.")
        return tuple(out)
