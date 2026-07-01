"""
Status enums as Django TextChoices — the single source of truth for the state
machines defined in the approved database design (§3).
"""
from django.db import models


class CEFRLevel(models.TextChoices):
    A1 = "A1", "A1"
    A2 = "A2", "A2"
    B1 = "B1", "B1"
    B2 = "B2", "B2"
    C1 = "C1", "C1"
    C2 = "C2", "C2"


class UserRole(models.TextChoices):
    STUDENT = "student", "Student"
    INSTRUCTOR = "instructor", "Instructor"
    ADMIN = "admin", "Admin"


class UserStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    SUSPENDED = "suspended", "Suspended"


class PaymentStatus(models.TextChoices):
    """Denormalized mirror carried on StudentProfile for fast dashboard reads."""

    NONE = "none", "None"
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class PlacementSkill(models.TextChoices):
    GRAMMAR = "grammar", "Grammar"
    VOCABULARY = "vocabulary", "Vocabulary"
    COMPREHENSION = "comprehension", "Comprehension"
    USAGE = "usage", "Usage"


class SubscriptionStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    ACTIVE = "active", "Active"
    EXPIRED = "expired", "Expired"
    CANCELLED = "cancelled", "Cancelled"


class PaymentProofStatus(models.TextChoices):
    # A submitted proof starts in PENDING ("pending_review") — it awaits MANUAL
    # admin approval. There is no auto-approval path.
    PENDING = "pending_review", "Pending review"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class SlotStatus(models.TextChoices):
    OPEN = "open", "Open"
    BOOKED = "booked", "Booked"
    BLOCKED = "blocked", "Blocked"


class BookingStatus(models.TextChoices):
    UPCOMING = "upcoming", "Upcoming"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class SessionStatus(models.TextChoices):
    SCHEDULED = "scheduled", "Scheduled"
    LIVE = "live", "Live"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class TranscriptSource(models.TextChoices):
    ASR = "asr", "ASR"
    MANUAL = "manual", "Manual"


class AIReportStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    READY = "ready", "Ready"
    FAILED = "failed", "Failed"


class NotificationType(models.TextChoices):
    PAYMENT_APPROVED = "payment_approved", "Payment approved"
    PAYMENT_REJECTED = "payment_rejected", "Payment rejected"
    BOOKING_CONFIRMED = "booking_confirmed", "Booking confirmed"
    SESSION_REMINDER = "session_reminder", "Session reminder"
    REPORT_READY = "report_ready", "Report ready"


class AdminActionType(models.TextChoices):
    PAYMENT_APPROVE = "payment_approve", "Payment approve"
    PAYMENT_REJECT = "payment_reject", "Payment reject"
    PAYMENT_REOPEN = "payment_reopen", "Payment reopen"
    SUBSCRIPTION_EXTEND = "subscription_extend", "Subscription extend"
    SUBSCRIPTION_TOPUP = "subscription_topup", "Subscription top-up"
    REFUND_NOTE = "refund_note", "Refund note"
    BOOKING_CANCEL_OVERRIDE = "booking_cancel_override", "Booking cancel override"
