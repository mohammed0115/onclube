"""
Domain exceptions.

All inherit from the existing `BusinessRuleError` so that:
  * code already written against `BusinessRuleError` keeps working, and
  * each exception still carries a `.code` matching the API error codes in the
    backend plan.

Subclassing lets the application/presentation layers catch a specific domain
error or the common base, as needed.
"""
from apps.common.exceptions import BusinessRuleError


class DomainError(BusinessRuleError):
    """Base for all domain rule violations."""

    default_code = "domain_error"
    default_message = "Domain rule violated."

    def __init__(self, message=None, code=None):
        super().__init__(message or self.default_message, code or self.default_code)


class PermissionDenied(DomainError):
    default_code = "permission_denied"
    default_message = "You do not have permission to perform this action."


class InvalidStateTransition(DomainError):
    default_code = "invalid_state"
    default_message = "Invalid state transition."


class PaymentAlreadyDecided(InvalidStateTransition):
    default_code = "invalid_state"
    default_message = "This payment proof has already been decided."


class NoActiveSubscription(DomainError):
    default_code = "no_active_subscription"
    default_message = "An approved, active subscription is required."


class SubscriptionExpired(DomainError):
    default_code = "subscription_expired"
    default_message = "Your subscription has expired."


class InsufficientSessionCredits(DomainError):
    default_code = "no_sessions_remaining"
    default_message = "No sessions remaining."


class SlotAlreadyBooked(DomainError):
    default_code = "slot_unavailable"
    default_message = "That slot is no longer available."


class BookingCancellationWindowClosed(DomainError):
    default_code = "cancellation_window_closed"
    default_message = "The cancellation window has closed."


class QuestionsNotAvailable(DomainError):
    default_code = "questions_not_available"
    default_message = "Questions are available only after a confirmed booking."


class SessionNotJoinable(DomainError):
    default_code = "session_not_joinable"
    default_message = "This session cannot be joined in its current state."


class SessionExpired(DomainError):
    default_code = "session_expired"
    default_message = "This session's join window has closed."


# ── in-session chat (Sprint 8.3) ──────────────────────────────────────────────
class EmptyChatMessage(DomainError):
    default_code = "empty_message"
    default_message = "A chat message cannot be empty."


class ChatMessageTooLong(DomainError):
    default_code = "message_too_long"
    default_message = "This chat message exceeds the maximum length."


# ── whiteboard (Sprint 8.4) ───────────────────────────────────────────────────
class InvalidWhiteboardOperation(DomainError):
    default_code = "operation_rejected"
    default_message = "This whiteboard operation is not valid."


# ── file sharing (Sprint 8.5) ─────────────────────────────────────────────────
class UnsupportedFileType(DomainError):
    default_code = "unsupported_file_type"
    default_message = "This file type is not allowed."


class FileTooLarge(DomainError):
    default_code = "file_too_large"
    default_message = "This file exceeds the maximum allowed size."


# ── participant signals (Sprint 8.6) ──────────────────────────────────────────
class UnsupportedReaction(DomainError):
    default_code = "unsupported_reaction"
    default_message = "This reaction is not allowed."


# ── session recording (Sprint 8.7) ────────────────────────────────────────────
class InvalidRecordingTransition(DomainError):
    default_code = "invalid_recording_state"
    default_message = "This recording action is not valid in the current state."


# ── attendance & presence (Sprint 8.8) ────────────────────────────────────────
class AttendanceLocked(DomainError):
    default_code = "attendance_locked"
    default_message = "Attendance for this session has been finalized and is locked."


class AIReportAlreadyGenerated(DomainError):
    default_code = "ai_report_already_generated"
    default_message = "An AI report has already been generated for this session."


class EmailAlreadyRegistered(DomainError):
    default_code = "email_already_registered"
    default_message = "An account with this email already exists."


class DuplicateTransactionNumber(DomainError):
    default_code = "duplicate_transaction_number"
    default_message = "This transaction number has already been submitted."


# ── placement (Phase 8B) ──────────────────────────────────────────────────────
class SpokenAttemptAlreadyUsed(DomainError):
    default_code = "spoken_attempt_used"
    default_message = "The one spoken placement attempt has already been used."


class PlacementResetRequired(DomainError):
    default_code = "placement_reset_required"
    default_message = "An admin reset is required before another spoken attempt."


class PlacementIncomplete(DomainError):
    default_code = "placement_incomplete"
    default_message = "Both the written and spoken sections must be completed."


class InvalidPlacementQuestion(DomainError):
    default_code = "invalid_placement_question"
    default_message = "An answer references a question that is not in the placement set."


class InvalidPlacementAnswer(DomainError):
    default_code = "invalid_placement_answer"
    default_message = "An answer is not one of the allowed choices for its question."


class TranscriptLocked(DomainError):
    default_code = "transcript_locked"
    default_message = "This answer was captured by voice and can no longer be edited."


class InterviewIncomplete(DomainError):
    default_code = "interview_incomplete"
    default_message = "Every interview question must be answered before finalizing."


class InvalidAssessmentInput(DomainError):
    default_code = "invalid_assessment_input"
    default_message = "The assessment input is not valid."


class InvalidAssessmentOutput(DomainError):
    default_code = "invalid_assessment_output"
    default_message = "The assessment output failed schema validation."


class PlacementAttemptNotFound(DomainError):
    default_code = "placement_attempt_not_found"
    default_message = "No active placement attempt was found."


class PlacementResultNotFound(DomainError):
    default_code = "placement_result_not_found"
    default_message = "No placement result was found yet."
