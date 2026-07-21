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
    NEEDS_INFO = "needs_info", "Needs more information"


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
    NEEDS_INFO = "needs_info", "Needs more information"


class PlanKind(models.TextChoices):
    SESSIONS = "sessions", "Live sessions"   # 1:1 / group sessions with an instructor
    AI_TUTOR = "ai_tutor", "AI tutor"        # 5-minute AI speaking practice


class AITutorSessionStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    ENDED = "ended", "Ended"


class SlotStatus(models.TextChoices):
    OPEN = "open", "Open"
    BOOKED = "booked", "Booked"
    BLOCKED = "blocked", "Blocked"


class BookingStatus(models.TextChoices):
    UPCOMING = "upcoming", "Upcoming"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class GroupSessionStatus(models.TextChoices):
    SCHEDULED = "scheduled", "Scheduled"
    LIVE = "live", "Live"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class AvailabilityExceptionKind(models.TextChoices):
    VACATION = "vacation", "Vacation"
    HOLIDAY = "holiday", "Holiday"
    BLOCK = "block", "Block time"


class SessionStatus(models.TextChoices):
    SCHEDULED = "scheduled", "Scheduled"  # the waiting-room state
    LIVE = "live", "Live"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"
    EXPIRED = "expired", "Expired"


class TranscriptSource(models.TextChoices):
    ASR = "asr", "ASR"
    MANUAL = "manual", "Manual"


class AIReportStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    READY = "ready", "Ready"
    FAILED = "failed", "Failed"


class ScheduleReviewStatus(models.TextChoices):
    """Admin review gate for a student's recurring weekly pick. A pick is only
    materialised into concrete bookings once an admin APPROVES it."""

    PENDING = "pending", "Pending review"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class NotificationType(models.TextChoices):
    PAYMENT_APPROVED = "payment_approved", "Payment approved"
    PAYMENT_REJECTED = "payment_rejected", "Payment rejected"
    PAYMENT_INFO_REQUESTED = "payment_info_requested", "Payment info requested"
    BOOKING_CONFIRMED = "booking_confirmed", "Booking confirmed"
    NEW_BOOKING = "new_booking", "New booking"           # → instructor
    BOOKING_CANCELLED = "booking_cancelled", "Booking cancelled"
    SESSION_REMINDER = "session_reminder", "Session reminder"
    REPORT_READY = "report_ready", "Report ready"
    SCHEDULE_SUBMITTED = "schedule_submitted", "Schedule submitted"   # → admin
    SCHEDULE_APPROVED = "schedule_approved", "Schedule approved"      # → student
    SCHEDULE_REJECTED = "schedule_rejected", "Schedule rejected"      # → student
    SCHEDULE_ASSIGNED = "schedule_assigned", "Assigned to schedule"   # → instructor


class AdminActionType(models.TextChoices):
    PAYMENT_APPROVE = "payment_approve", "Payment approve"
    PAYMENT_REJECT = "payment_reject", "Payment reject"
    PAYMENT_REQUEST_INFO = "payment_request_info", "Payment request info"
    PAYMENT_REOPEN = "payment_reopen", "Payment reopen"
    SUBSCRIPTION_EXTEND = "subscription_extend", "Subscription extend"
    SUBSCRIPTION_TOPUP = "subscription_topup", "Subscription top-up"
    REFUND_NOTE = "refund_note", "Refund note"
    BOOKING_CANCEL_OVERRIDE = "booking_cancel_override", "Booking cancel override"
    SCHEDULE_APPROVE = "schedule_approve", "Schedule approve"
    SCHEDULE_REJECT = "schedule_reject", "Schedule reject"
    SCHEDULE_REASSIGN = "schedule_reassign", "Schedule reassign instructor"
    USER_STATUS_CHANGED = "user_status_changed", "User status changed"
    USER_ROLE_CHANGED = "user_role_changed", "User role changed"
    PLAN_CREATED = "plan_created", "Plan created"
    PLAN_UPDATED = "plan_updated", "Plan updated"
