"""
Gateway ports (interfaces) for external systems.

  NotificationGateway — fan-out of user notifications.
  VideoProvider       — live-room provisioning (Agora later; stub now).
  AIProvider          — placement scoring, suggestions, session analysis
                        (OpenAI later; stub now).
  FileStorageGateway  — receipt / artifact storage.
  EventBus            — domain event dispatch (no-op now).
"""
from abc import ABC, abstractmethod


class NotificationGateway(ABC):
    @abstractmethod
    def notify(self, *, user_id, type, title, body=None, data=None):
        ...


class VideoToken:
    """Lightweight value returned by VideoProvider.issue_join."""

    def __init__(self, *, provider, channel, token, uid, expires_at, app_id=None):
        self.provider = provider
        self.channel = channel
        self.token = token
        self.uid = uid
        self.expires_at = expires_at
        self.app_id = app_id


class VideoProvider(ABC):
    """Provisions the live-room channel (Agora later; stub now). Channel
    provisioning is separate from token minting (see MeetingTokenProvider)."""

    @abstractmethod
    def create_channel(self, *, session_id) -> str:
        """Return a channel identifier for a session."""

    @abstractmethod
    def issue_join(self, *, channel, identity) -> "VideoToken":
        """Mint a short-lived join credential. MUST be server-side only.
        (Legacy: JoinSession now uses MeetingTokenProvider to mint tokens.)"""


class MeetingTokenProvider(ABC):
    """Mints short-lived meeting join tokens — the ONLY place tokens are created.
    Kept distinct from VideoProvider so channel provisioning and credential
    minting can evolve independently. Tokens are server-side only and never
    stored. Stub now; a real adapter mints genuine RTC tokens later."""

    @abstractmethod
    def issue(self, *, channel, identity) -> "VideoToken":
        ...


class InterviewerProvider(ABC):
    """Supplies the AI interviewer's *spoken script lines* for the placement
    speaking interview.

    The AI is an INTERVIEWER ONLY: it greets, explains, reads the fixed known
    questions, may politely rephrase (same meaning) or encourage, and closes. It
    NEVER generates questions, reorders/skips them, teaches, corrects, hints, or
    scores. Model instructions / prompts / provider keys live inside the adapter
    and MUST NOT cross this boundary — only presentational lines are returned.
    """

    @abstractmethod
    def greeting(self) -> str:
        """A short welcome line."""

    @abstractmethod
    def instructions(self) -> str:
        """A short explanation of how the interview works."""

    @abstractmethod
    def preamble(self, *, order: int, total: int) -> str:
        """A brief lead-in for question `order` of `total` (no new questions)."""

    @abstractmethod
    def clarification(self, *, prompt: str) -> str:
        """A polite rephrase of the SAME question (meaning unchanged)."""

    @abstractmethod
    def encouragement(self) -> str:
        """A neutral encouraging line — never feedback or correction."""

    @abstractmethod
    def closing(self) -> str:
        """A polite closing line for the finished interview."""


class AIProvider(ABC):
    @abstractmethod
    def score_placement(self, *, answers) -> dict:
        ...

    @abstractmethod
    def suggest_subtopics(self, *, topic_title, topic_description) -> list:
        ...

    @abstractmethod
    def generate_questions(self, *, topic_title, topic_description) -> list:
        ...

    @abstractmethod
    def analyze_session(self, *, transcript) -> dict:
        ...


class FileStorageGateway(ABC):
    @abstractmethod
    def save(self, *, filename, content_type, data=None) -> dict:
        """Persist bytes and return {storage_key, ...} metadata."""

    @abstractmethod
    def url_for(self, *, storage_key) -> str:
        ...


class EventBus(ABC):
    @abstractmethod
    def publish(self, event) -> None:
        ...


class PaymentSettingsGateway(ABC):
    @abstractmethod
    def list_providers(self) -> list:
        """Active payment providers (plain dicts), ordered by display_order."""

    @abstractmethod
    def default_account(self) -> dict:
        """The default active provider/account, or None if none is active."""
