"""
Interviewer provider — deterministic STUB.

This is the seam where a real conversational model (e.g. OpenAI) will plug in
later behind the same `InterviewerProvider` port. It makes NO network calls and
returns fixed, offline English lines.

SECURITY: the model system instructions / prompt live in `_SYSTEM_INSTRUCTIONS`
below and are NEVER returned from any method — only short presentational lines
cross the boundary. The real adapter must keep prompts and provider keys internal
in exactly the same way.
"""
from application.ports.gateways import InterviewerProvider

# Server-only. NEVER serialized or returned to a caller/client. Kept here to show
# the boundary the real adapter must honour: prompts stay inside the adapter.
_SYSTEM_INSTRUCTIONS = (
    "You are an English placement interviewer. Ask ONLY the provided fixed "
    "questions in order. Do not generate new questions, do not teach, correct, "
    "hint, or score. Keep replies brief and encouraging."
)

# Fixed, meaning-preserving rephrasings keyed by the canonical question text.
# Deterministic — NOT model-generated — so the meaning can never drift.
_CLARIFICATIONS = {
    "What is your name?": "Could you tell me your name, please?",
    "How old are you?": "May I ask how old you are?",
    "Where are you from?": "Which country or city are you from?",
    "What do you do for a living?": "What is your job or occupation?",
    "Why do you want to learn English?": "What is your reason for learning English?",
}


class StubInterviewerProvider(InterviewerProvider):
    provider_name = "stub"

    def greeting(self) -> str:
        return "Hello, and welcome! I'm your interviewer for today's short speaking practice."

    def instructions(self) -> str:
        return (
            "I'll ask you five simple questions, one at a time. Just answer naturally in "
            "English — there are no right or wrong answers, and this is only for practice. "
            "Take your time, and let's begin whenever you're ready."
        )

    def preamble(self, *, order: int, total: int) -> str:
        if order <= 1:
            return "Let's start with the first question."
        if order >= total:
            return "Here's the last question."
        return "Thank you. Here's the next question."

    def clarification(self, *, prompt: str) -> str:
        # Meaning-preserving rephrase; falls back to a neutral repeat.
        return _CLARIFICATIONS.get(prompt, f"Let me say that again: {prompt}")

    def encouragement(self) -> str:
        return "Great, thank you for sharing that."

    def closing(self) -> str:
        return (
            "That's the end of the interview — thank you for your answers! "
            "Your responses have been saved."
        )
