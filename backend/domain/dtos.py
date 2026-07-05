"""
Result DTOs returned by use cases.

These are plain, framework-free dataclasses so the presentation layer (future
DRF serializers) and tests never depend on Django model instances leaking out of
the application layer.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Optional


@dataclass(frozen=True)
class PaymentProviderResult:
    """Configurable bank-transfer provider/account shown on the payment page.

    Bank details are configuration — never hardcoded in code or the frontend.
    """

    provider_key: str
    provider_name: str
    transfer_method: str
    bank_name: str
    account_name: str
    account_number: str
    instructions: str
    currency: str
    is_active: bool
    display_order: int
    iban: Optional[str] = None


@dataclass(frozen=True)
class PaymentApprovalResult:
    proof_id: str
    subscription_id: str
    subscription_status: str
    sessions_remaining: int
    started_at: Optional[datetime]
    expires_at: Optional[datetime]


@dataclass(frozen=True)
class PaymentDecisionResult:
    proof_id: str
    status: str
    reviewed_by_id: Optional[str]


@dataclass(frozen=True)
class SubscriptionResult:
    subscription_id: str
    status: str
    sessions_remaining: int
    expires_at: Optional[datetime]


@dataclass(frozen=True)
class RefundNoteResult:
    admin_action_id: str
    subscription_id: str
    amount: Any
    currency: Optional[str]


@dataclass(frozen=True)
class BookingResult:
    booking_id: str
    slot_id: str
    topic_id: str
    scheduled_at: datetime
    status: str
    sessions_remaining: int


@dataclass(frozen=True)
class CancellationResult:
    booking_id: str
    status: str
    credit_refunded: bool
    sessions_remaining: int


@dataclass(frozen=True)
class SlotDTO:
    slot_id: str
    instructor_id: str
    start_at: datetime
    duration_minutes: int
    status: str


@dataclass(frozen=True)
class TopicAccessResult:
    topic_id: str
    mode: str  # "preview" | "full"
    title: str
    level: str
    description: Optional[str]
    sample_prompts: list = field(default_factory=list)
    subtopics: list = field(default_factory=list)
    # Only populated when mode == "full".
    questions: Optional[list] = None
    vocabulary: Optional[list] = None


@dataclass(frozen=True)
class VideoJoinResult:
    session_id: str
    provider: str
    channel: str
    token: str
    uid: str
    expires_at: Optional[datetime]
    app_id: Optional[str] = None


@dataclass(frozen=True)
class SessionResult:
    session_id: str
    status: str
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    report_pending: bool = False


@dataclass(frozen=True)
class WaitingRoomResult:
    """Waiting-room view for a participant. Presentational + join-eligibility only —
    no transcript, questions, or video."""

    session_id: str
    booking_id: str
    topic_title: str
    instructor_name: str
    scheduled_at: datetime
    duration_minutes: int
    phase: str  # waiting | live | completed | cancelled | expired
    can_join: bool
    join_opens_at: datetime
    join_closes_at: datetime
    viewer_role: Optional[str] = None  # student | instructor | admin


@dataclass(frozen=True)
class AIReportResult:
    report_id: str
    session_id: str
    status: str
    overall_score: Optional[int]


@dataclass(frozen=True)
class PlacementResultDTO:
    result_id: str
    level: str
    level_label: str
    skills: list = field(default_factory=list)


@dataclass(frozen=True)
class SuggestionResult:
    """AI proposals returned to an instructor (subtopics or question drafts)."""

    topic_id: str
    items: list = field(default_factory=list)
    # For persisted question drafts, the created (unapproved) ids.
    created_ids: list = field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# Read / query DTOs (Phase 5.5)
#
# Returned by query use cases so the presentation layer never serializes Django
# models. Server-only fields (e.g. PlacementQuestion.correct_index, password
# hashes, Agora secrets) are deliberately ABSENT from these shapes.
# ─────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class UserProfileResult:
    id: str
    full_name: str
    email: str
    role: str
    status: str
    # Student-only (None for other roles)
    level: Optional[str] = None
    goal_id: Optional[str] = None
    payment_status: Optional[str] = None
    sessions_remaining: Optional[int] = None
    # Instructor-only
    rating: Optional[float] = None
    headline: Optional[str] = None


@dataclass(frozen=True)
class GoalOptionResult:
    id: str
    code: str
    label: str
    description: Optional[str]
    icon: Optional[str]
    accent: Optional[str]


@dataclass(frozen=True)
class PlacementQuestionResult:
    """Public placement question — NEVER carries `correct_index`."""

    id: str
    prompt: str
    options: list
    skill: str


@dataclass(frozen=True)
class PlacementResultDetail:
    id: str
    level: str
    level_label: str
    summary: Optional[str]
    skills: list = field(default_factory=list)


@dataclass(frozen=True)
class PlanResult:
    id: str
    code: str
    name: str
    emoji: Optional[str]
    price: Any
    currency: str
    cadence: str
    description: Optional[str]
    sessions_per_month: int
    features: list = field(default_factory=list)
    recommended: bool = False


@dataclass(frozen=True)
class SubscriptionDetailResult:
    id: str
    plan_id: str
    plan_name: str
    status: str
    started_at: Optional[datetime]
    expires_at: Optional[datetime]
    sessions_remaining: int


@dataclass(frozen=True)
class PaymentProofDetailResult:
    id: str
    plan_name: str
    amount: Any
    currency: str
    transaction_number: str
    transfer_datetime: datetime
    receipt_name: str
    status: str
    submitted_at: datetime
    retain_until: Optional[datetime] = None
    sender_name: Optional[str] = None
    receiver_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None
    receipt_url: Optional[str] = None
    # Admin context only.
    student_id: Optional[str] = None
    student_name: Optional[str] = None


@dataclass(frozen=True)
class BillingHistoryItemResult:
    id: str
    plan_name: str
    amount: Any
    currency: str
    status: str
    submitted_at: datetime
    receipt_url: Optional[str] = None


@dataclass(frozen=True)
class QuestionPreviewResult:
    """A teaser prompt shown BEFORE a confirmed booking. Text only, no metadata."""

    text: str


@dataclass(frozen=True)
class QuestionFullResult:
    """A real discussion question — only exposed AFTER a confirmed booking."""

    id: str
    text: str
    ai_assisted: bool
    approved: bool


@dataclass(frozen=True)
class BookingListItemResult:
    id: str
    topic_title: str
    instructor_name: str
    scheduled_at: datetime
    duration_minutes: int
    status: str
    report_id: Optional[str] = None


@dataclass(frozen=True)
class BookingDetailResult:
    id: str
    topic_id: str
    topic_title: str
    instructor_id: str
    instructor_name: str
    scheduled_at: datetime
    duration_minutes: int
    status: str
    credit_refunded: bool
    cancelled_at: Optional[datetime] = None
    session_id: Optional[str] = None
    report_id: Optional[str] = None


@dataclass(frozen=True)
class AvailabilitySlotResult:
    id: str
    instructor_id: str
    start_at: datetime
    duration_minutes: int
    status: str


# ── weekly calendar (Sprint 7) ────────────────────────────────────────────────
@dataclass(frozen=True)
class CalendarSlotResult:
    id: str
    start_at: datetime
    duration_minutes: int
    status: str  # available | booked | blocked | completed (only available is selectable)


@dataclass(frozen=True)
class CalendarDayResult:
    date: date
    weekday: str  # monday..sunday
    slots: tuple = ()


@dataclass(frozen=True)
class WeeklyCalendarResult:
    topic_id: str
    instructor_id: str
    instructor_name: str
    week_start: date
    week_end: date
    days: tuple = ()  # 7 CalendarDayResult (Mon..Sun)


@dataclass(frozen=True)
class AdminBookingItemResult:
    id: str
    student_id: str
    student_name: str
    topic_title: str
    instructor_name: str
    scheduled_at: datetime
    duration_minutes: int
    status: str
    credit_refunded: bool


@dataclass(frozen=True)
class TopicPreviewResult:
    id: str
    title: str
    category: str
    level: str
    description: Optional[str]
    instructor_id: str
    instructor_name: str
    instructor_headline: Optional[str]
    sample_prompts: list = field(default_factory=list)   # [QuestionPreviewResult]
    subtopics: list = field(default_factory=list)          # [{id,title,ai_generated}]
    mode: str = "preview"


@dataclass(frozen=True)
class TopicFullResult:
    id: str
    title: str
    category: str
    level: str
    description: Optional[str]
    instructor_id: str
    instructor_name: str
    instructor_headline: Optional[str]
    subtopics: list = field(default_factory=list)          # [{id,title,ai_generated}]
    questions: list = field(default_factory=list)          # [QuestionFullResult]
    vocabulary: list = field(default_factory=list)
    sample_prompts: list = field(default_factory=list)     # [QuestionPreviewResult]
    mode: str = "full"


@dataclass(frozen=True)
class StudentDashboardResult:
    sessions_remaining: int
    sessions_completed: int
    payment_status: str
    level: Optional[str] = None
    latest_score: Optional[int] = None
    next_session: Optional["BookingListItemResult"] = None
    recent_sessions: list = field(default_factory=list)    # [BookingListItemResult]
    progress_trend: list = field(default_factory=list)     # [{label, score}]


@dataclass(frozen=True)
class InstructorDashboardResult:
    upcoming_sessions: int
    active_students: int
    topics_owned: int
    average_rating: float
    today_sessions: list = field(default_factory=list)     # [BookingListItemResult]
    topics: list = field(default_factory=list)             # [{id,title,published,...}]
    weekly: dict = field(default_factory=dict)


@dataclass(frozen=True)
class PaymentApprovalItemResult:
    id: str
    student_name: str
    plan_name: str
    amount: Any
    currency: str
    status: str
    submitted_at: datetime


@dataclass(frozen=True)
class AdminDashboardResult:
    pending_payments: int
    active_members: int
    instructors: int
    revenue: Any
    currency: str
    pending_proofs: list = field(default_factory=list)     # [PaymentApprovalItemResult]
    recent_activity: list = field(default_factory=list)    # [{actor,action,when}]


@dataclass(frozen=True)
class SessionDetailResult:
    id: str
    booking_id: str
    topic_title: str
    status: str
    scheduled_at: datetime
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    questions: list = field(default_factory=list)          # [QuestionFullResult]
    vocabulary: list = field(default_factory=list)
    student_notes: Optional[str] = None


@dataclass(frozen=True)
class AIReportDetailResult:
    id: str
    session_id: str
    booking_id: str
    topic_title: str
    instructor_name: str
    session_date: datetime
    duration_minutes: int
    status: str
    overall_score: Optional[int] = None
    skills: list = field(default_factory=list)
    mistakes: list = field(default_factory=list)
    recommendations: list = field(default_factory=list)
    vocabulary: list = field(default_factory=list)
    instructor_note: Optional[str] = None


@dataclass(frozen=True)
class NotificationResult:
    id: str
    type: str
    title: str
    read: bool
    created_at: datetime
    body: Optional[str] = None
    data: Optional[dict] = None


@dataclass(frozen=True)
class TranscriptResult:
    transcript_id: str
    session_id: str
    source: str
