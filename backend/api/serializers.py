"""
DRF serializers — request validation + DTO serialization ONLY.

Output serializers read attributes off frozen DTO dataclasses (never Django
models) and emit camelCase. Because DTOs carry no server-only fields, these
serializers cannot leak `correct_index`, password hashes, staff flags, or
provider secrets — the field simply does not exist on the source object.
"""
from rest_framework import serializers

from api.upload import validate_receipt_file


# ── shared ────────────────────────────────────────────────────────────────────
class ErrorSerializer(serializers.Serializer):
    code = serializers.CharField()
    detail = serializers.CharField()


# ── accounts ──────────────────────────────────────────────────────────────────
class UserProfileSerializer(serializers.Serializer):
    id = serializers.CharField()
    fullName = serializers.CharField(source="full_name")
    email = serializers.EmailField()
    role = serializers.CharField()
    status = serializers.CharField()
    level = serializers.CharField(allow_null=True)
    goalId = serializers.CharField(source="goal_id", allow_null=True)
    paymentStatus = serializers.CharField(source="payment_status", allow_null=True)
    sessionsRemaining = serializers.IntegerField(source="sessions_remaining", allow_null=True)
    rating = serializers.FloatField(allow_null=True)
    headline = serializers.CharField(allow_null=True)


# ── onboarding ────────────────────────────────────────────────────────────────
class GoalOptionSerializer(serializers.Serializer):
    id = serializers.CharField()
    code = serializers.CharField()
    label = serializers.CharField()
    description = serializers.CharField(allow_null=True)
    icon = serializers.CharField(allow_null=True)
    accent = serializers.CharField(allow_null=True)


class PlacementQuestionSerializer(serializers.Serializer):
    # NOTE: no `correctIndex` — the DTO never carries the answer key.
    id = serializers.CharField()
    prompt = serializers.CharField()
    options = serializers.JSONField()
    skill = serializers.CharField()


class PlacementResultSerializer(serializers.Serializer):
    id = serializers.CharField()
    level = serializers.CharField()
    levelLabel = serializers.CharField(source="level_label")
    summary = serializers.CharField(allow_null=True)
    skills = serializers.JSONField()


class PlacementResultAckSerializer(serializers.Serializer):
    resultId = serializers.CharField(source="result_id")
    level = serializers.CharField()
    levelLabel = serializers.CharField(source="level_label")
    skills = serializers.JSONField()


# ── billing ───────────────────────────────────────────────────────────────────
class PaymentProviderSerializer(serializers.Serializer):
    """Full configurable provider/account — used by /providers/ and /bank-account/."""

    providerKey = serializers.CharField(source="provider_key")
    providerName = serializers.CharField(source="provider_name")
    transferMethod = serializers.CharField(source="transfer_method")
    bankName = serializers.CharField(source="bank_name")
    accountName = serializers.CharField(source="account_name")
    accountNumber = serializers.CharField(source="account_number")
    iban = serializers.CharField(allow_null=True, allow_blank=True)
    instructions = serializers.CharField()
    currency = serializers.CharField()
    isActive = serializers.BooleanField(source="is_active")
    displayOrder = serializers.IntegerField(source="display_order")


class PaymentInstructionsSerializer(serializers.Serializer):
    """Backward-compatible subset for the /payment-instructions/ alias."""

    bankName = serializers.CharField(source="bank_name")
    accountName = serializers.CharField(source="account_name")
    accountNumber = serializers.CharField(source="account_number")
    iban = serializers.CharField(allow_null=True, allow_blank=True)
    transferMethod = serializers.CharField(source="transfer_method")
    instructions = serializers.CharField()


class PlanSerializer(serializers.Serializer):
    id = serializers.CharField()
    code = serializers.CharField()
    name = serializers.CharField()
    emoji = serializers.CharField(allow_null=True)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, coerce_to_string=False)
    currency = serializers.CharField()
    cadence = serializers.CharField()
    description = serializers.CharField(allow_null=True)
    sessionsPerMonth = serializers.IntegerField(source="sessions_per_month")
    features = serializers.JSONField()
    recommended = serializers.BooleanField()
    active = serializers.BooleanField(required=False)


class CreatePlanInputSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=40)
    name = serializers.CharField(max_length=60)
    price = serializers.DecimalField(max_digits=10, decimal_places=2)
    currency = serializers.CharField(max_length=3, required=False, default="SDG")
    cadence = serializers.CharField(max_length=20, required=False, default="/ month")
    billing_period_days = serializers.IntegerField(required=False, default=30)
    description = serializers.CharField(required=False, allow_blank=True, default=None)
    emoji = serializers.CharField(max_length=8, required=False, allow_blank=True, default=None)
    sessions_per_month = serializers.IntegerField(min_value=0)
    features = serializers.JSONField(required=False, default=list)
    recommended = serializers.BooleanField(required=False, default=False)
    active = serializers.BooleanField(required=False, default=True)


class UpdatePlanInputSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=60, required=False)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    currency = serializers.CharField(max_length=3, required=False)
    cadence = serializers.CharField(max_length=20, required=False)
    billing_period_days = serializers.IntegerField(required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    emoji = serializers.CharField(max_length=8, required=False, allow_blank=True)
    sessions_per_month = serializers.IntegerField(required=False, min_value=0)
    features = serializers.JSONField(required=False)
    recommended = serializers.BooleanField(required=False)
    active = serializers.BooleanField(required=False)


class SubscriptionDetailSerializer(serializers.Serializer):
    id = serializers.CharField()
    planId = serializers.CharField(source="plan_id")
    planName = serializers.CharField(source="plan_name")
    status = serializers.CharField()
    startedAt = serializers.DateTimeField(source="started_at", allow_null=True)
    expiresAt = serializers.DateTimeField(source="expires_at", allow_null=True)
    sessionsRemaining = serializers.IntegerField(source="sessions_remaining")


class SubscriptionResultSerializer(serializers.Serializer):
    subscriptionId = serializers.CharField(source="subscription_id")
    status = serializers.CharField()
    sessionsRemaining = serializers.IntegerField(source="sessions_remaining")
    expiresAt = serializers.DateTimeField(source="expires_at", allow_null=True)


class BillingHistoryItemSerializer(serializers.Serializer):
    id = serializers.CharField()
    planName = serializers.CharField(source="plan_name")
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, coerce_to_string=False)
    currency = serializers.CharField()
    status = serializers.CharField()
    submittedAt = serializers.DateTimeField(source="submitted_at")
    receiptUrl = serializers.CharField(source="receipt_url", allow_null=True)


class PaymentApprovalResultSerializer(serializers.Serializer):
    proofId = serializers.CharField(source="proof_id")
    subscriptionId = serializers.CharField(source="subscription_id")
    subscriptionStatus = serializers.CharField(source="subscription_status")
    sessionsRemaining = serializers.IntegerField(source="sessions_remaining")
    startedAt = serializers.DateTimeField(source="started_at", allow_null=True)
    expiresAt = serializers.DateTimeField(source="expires_at", allow_null=True)


class PaymentDecisionSerializer(serializers.Serializer):
    proofId = serializers.CharField(source="proof_id")
    status = serializers.CharField()
    reviewedById = serializers.CharField(source="reviewed_by_id", allow_null=True)


class RefundNoteSerializer(serializers.Serializer):
    adminActionId = serializers.CharField(source="admin_action_id")
    subscriptionId = serializers.CharField(source="subscription_id")
    amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, coerce_to_string=False, allow_null=True
    )
    currency = serializers.CharField(allow_null=True)


class PaymentApprovalItemSerializer(serializers.Serializer):
    id = serializers.CharField()
    studentName = serializers.CharField(source="student_name")
    planName = serializers.CharField(source="plan_name")
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, coerce_to_string=False)
    currency = serializers.CharField()
    status = serializers.CharField()
    submittedAt = serializers.DateTimeField(source="submitted_at")


# ── scheduling: questions & topics ────────────────────────────────────────────
class QuestionPreviewSerializer(serializers.Serializer):
    text = serializers.CharField()


class QuestionFullSerializer(serializers.Serializer):
    id = serializers.CharField()
    text = serializers.CharField()
    aiAssisted = serializers.BooleanField(source="ai_assisted")
    approved = serializers.BooleanField()


class TopicPreviewSerializer(serializers.Serializer):
    id = serializers.CharField()
    title = serializers.CharField()
    category = serializers.CharField()
    level = serializers.CharField()
    description = serializers.CharField(allow_null=True)
    instructorId = serializers.CharField(source="instructor_id")
    instructorName = serializers.CharField(source="instructor_name")
    instructorHeadline = serializers.CharField(source="instructor_headline", allow_null=True)
    samplePrompts = QuestionPreviewSerializer(source="sample_prompts", many=True)
    subtopics = serializers.JSONField()
    mode = serializers.CharField()


class TopicFullSerializer(serializers.Serializer):
    id = serializers.CharField()
    title = serializers.CharField()
    category = serializers.CharField()
    level = serializers.CharField()
    description = serializers.CharField(allow_null=True)
    instructorId = serializers.CharField(source="instructor_id")
    instructorName = serializers.CharField(source="instructor_name")
    instructorHeadline = serializers.CharField(source="instructor_headline", allow_null=True)
    subtopics = serializers.JSONField()
    questions = QuestionFullSerializer(many=True)
    vocabulary = serializers.JSONField()
    samplePrompts = QuestionPreviewSerializer(source="sample_prompts", many=True)
    mode = serializers.CharField()


# ── scheduling: slots & bookings ──────────────────────────────────────────────
class AvailableSlotSerializer(serializers.Serializer):
    """For SlotDTO (student-facing open slots)."""

    id = serializers.CharField(source="slot_id")
    instructorId = serializers.CharField(source="instructor_id")
    startAt = serializers.DateTimeField(source="start_at")
    durationMinutes = serializers.IntegerField(source="duration_minutes")
    status = serializers.CharField()


class InstructorSlotSerializer(serializers.Serializer):
    """For AvailabilitySlotResult (instructor's own slots)."""

    id = serializers.CharField()
    instructorId = serializers.CharField(source="instructor_id")
    startAt = serializers.DateTimeField(source="start_at")
    durationMinutes = serializers.IntegerField(source="duration_minutes")
    status = serializers.CharField()


class BookingListItemSerializer(serializers.Serializer):
    id = serializers.CharField()
    topicTitle = serializers.CharField(source="topic_title")
    instructorName = serializers.CharField(source="instructor_name")
    scheduledAt = serializers.DateTimeField(source="scheduled_at")
    durationMinutes = serializers.IntegerField(source="duration_minutes")
    status = serializers.CharField()
    reportId = serializers.CharField(source="report_id", allow_null=True)


class BookingDetailSerializer(serializers.Serializer):
    id = serializers.CharField()
    topicId = serializers.CharField(source="topic_id")
    topicTitle = serializers.CharField(source="topic_title")
    instructorId = serializers.CharField(source="instructor_id")
    instructorName = serializers.CharField(source="instructor_name")
    scheduledAt = serializers.DateTimeField(source="scheduled_at")
    durationMinutes = serializers.IntegerField(source="duration_minutes")
    status = serializers.CharField()
    creditRefunded = serializers.BooleanField(source="credit_refunded")
    cancelledAt = serializers.DateTimeField(source="cancelled_at", allow_null=True)
    sessionId = serializers.CharField(source="session_id", allow_null=True)
    reportId = serializers.CharField(source="report_id", allow_null=True)


class BookingResultSerializer(serializers.Serializer):
    bookingId = serializers.CharField(source="booking_id")
    slotId = serializers.CharField(source="slot_id")
    topicId = serializers.CharField(source="topic_id")
    scheduledAt = serializers.DateTimeField(source="scheduled_at")
    status = serializers.CharField()
    sessionsRemaining = serializers.IntegerField(source="sessions_remaining")


class CancellationSerializer(serializers.Serializer):
    bookingId = serializers.CharField(source="booking_id")
    status = serializers.CharField()
    creditRefunded = serializers.BooleanField(source="credit_refunded")
    sessionsRemaining = serializers.IntegerField(source="sessions_remaining")


# ── weekly calendar (Sprint 7) ────────────────────────────────────────────────
class CalendarSlotSerializer(serializers.Serializer):
    id = serializers.CharField()
    startAt = serializers.DateTimeField(source="start_at")
    durationMinutes = serializers.IntegerField(source="duration_minutes")
    status = serializers.CharField()  # available | booked | blocked | completed


class CalendarDaySerializer(serializers.Serializer):
    date = serializers.DateField()
    weekday = serializers.CharField()
    slots = CalendarSlotSerializer(many=True)


class WeeklyCalendarSerializer(serializers.Serializer):
    topicId = serializers.CharField(source="topic_id")
    instructorId = serializers.CharField(source="instructor_id")
    instructorName = serializers.CharField(source="instructor_name")
    weekStart = serializers.DateField(source="week_start")
    weekEnd = serializers.DateField(source="week_end")
    days = CalendarDaySerializer(many=True)


class AdminBookingItemSerializer(serializers.Serializer):
    id = serializers.CharField()
    studentId = serializers.CharField(source="student_id")
    studentName = serializers.CharField(source="student_name")
    topicTitle = serializers.CharField(source="topic_title")
    instructorName = serializers.CharField(source="instructor_name")
    scheduledAt = serializers.DateTimeField(source="scheduled_at")
    durationMinutes = serializers.IntegerField(source="duration_minutes")
    status = serializers.CharField()
    creditRefunded = serializers.BooleanField(source="credit_refunded")


class AdminBookingUpdateInputSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["cancelled"])
    forceCredit = serializers.BooleanField(required=False, allow_null=True, default=None)


class RescheduleInputSerializer(serializers.Serializer):
    newSlotId = serializers.UUIDField()


class SessionNotesInputSerializer(serializers.Serializer):
    participation = serializers.CharField(required=False, allow_blank=True)
    strengths = serializers.CharField(required=False, allow_blank=True)
    weaknesses = serializers.CharField(required=False, allow_blank=True)
    homework = serializers.CharField(required=False, allow_blank=True)
    next_focus = serializers.CharField(required=False, allow_blank=True)


class AvailabilityExceptionSerializer(serializers.Serializer):
    id = serializers.CharField()
    kind = serializers.CharField()
    startAt = serializers.DateTimeField(source="start_at")
    endAt = serializers.DateTimeField(source="end_at")
    note = serializers.CharField(allow_blank=True)


class AddAvailabilityExceptionInputSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=["vacation", "holiday", "block"])
    startAt = serializers.DateTimeField()
    endAt = serializers.DateTimeField()
    note = serializers.CharField(max_length=160, required=False, allow_blank=True)


class GroupSessionSerializer(serializers.Serializer):
    id = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField()
    instructorName = serializers.CharField(source="instructor_name")
    level = serializers.CharField()
    startAt = serializers.DateTimeField(source="start_at")
    durationMinutes = serializers.IntegerField(source="duration_minutes")
    capacity = serializers.IntegerField()
    seatsTaken = serializers.IntegerField(source="seats_taken")
    seatsLeft = serializers.IntegerField(source="seats_left")
    joined = serializers.BooleanField()
    attendees = serializers.ListField(child=serializers.CharField())
    status = serializers.CharField()


class StudentDashboardSerializer(serializers.Serializer):
    sessionsRemaining = serializers.IntegerField(source="sessions_remaining")
    sessionsCompleted = serializers.IntegerField(source="sessions_completed")
    paymentStatus = serializers.CharField(source="payment_status")
    level = serializers.CharField(allow_null=True)
    latestScore = serializers.IntegerField(source="latest_score", allow_null=True)
    nextSession = BookingListItemSerializer(source="next_session", allow_null=True)
    recentSessions = BookingListItemSerializer(source="recent_sessions", many=True)
    progressTrend = serializers.JSONField(source="progress_trend")
    gamification = serializers.JSONField()


class InstructorDashboardSerializer(serializers.Serializer):
    upcomingSessions = serializers.IntegerField(source="upcoming_sessions")
    activeStudents = serializers.IntegerField(source="active_students")
    topicsOwned = serializers.IntegerField(source="topics_owned")
    averageRating = serializers.FloatField(source="average_rating")
    todaySessions = BookingListItemSerializer(source="today_sessions", many=True)
    topics = serializers.JSONField()
    weekly = serializers.JSONField()
    completedSessions = serializers.IntegerField(source="completed_sessions")
    teachingHours = serializers.FloatField(source="teaching_hours")
    cancellationRate = serializers.FloatField(source="cancellation_rate")


class AdminDashboardSerializer(serializers.Serializer):
    pendingPayments = serializers.IntegerField(source="pending_payments")
    activeMembers = serializers.IntegerField(source="active_members")
    instructors = serializers.IntegerField()
    revenue = serializers.DecimalField(max_digits=12, decimal_places=2, coerce_to_string=False)
    currency = serializers.CharField()
    pendingProofs = PaymentApprovalItemSerializer(source="pending_proofs", many=True)
    recentActivity = serializers.JSONField(source="recent_activity")
    totalStudents = serializers.IntegerField(source="total_students")
    sessionsToday = serializers.IntegerField(source="sessions_today")
    reportsWaiting = serializers.IntegerField(source="reports_waiting")
    systemStatus = serializers.CharField(source="system_status")
    alerts = serializers.JSONField()


class SuggestionSerializer(serializers.Serializer):
    topicId = serializers.CharField(source="topic_id")
    items = serializers.JSONField()
    createdIds = serializers.JSONField(source="created_ids")


# ── sessions ──────────────────────────────────────────────────────────────────
class SessionDetailSerializer(serializers.Serializer):
    id = serializers.CharField()
    bookingId = serializers.CharField(source="booking_id")
    topicTitle = serializers.CharField(source="topic_title")
    status = serializers.CharField()
    scheduledAt = serializers.DateTimeField(source="scheduled_at")
    startedAt = serializers.DateTimeField(source="started_at", allow_null=True)
    endedAt = serializers.DateTimeField(source="ended_at", allow_null=True)
    questions = QuestionFullSerializer(many=True)
    vocabulary = serializers.JSONField()
    studentNotes = serializers.CharField(source="student_notes", allow_null=True)


class SessionResultSerializer(serializers.Serializer):
    sessionId = serializers.CharField(source="session_id")
    status = serializers.CharField()
    startedAt = serializers.DateTimeField(source="started_at", allow_null=True)
    endedAt = serializers.DateTimeField(source="ended_at", allow_null=True)
    reportPending = serializers.BooleanField(source="report_pending")


class VideoJoinSerializer(serializers.Serializer):
    sessionId = serializers.CharField(source="session_id")
    provider = serializers.CharField()
    agoraAppId = serializers.CharField(source="app_id", allow_null=True)
    channel = serializers.CharField()
    agoraToken = serializers.CharField(source="token")
    uid = serializers.CharField()
    expiresAt = serializers.DateTimeField(source="expires_at", allow_null=True)


class WaitingRoomSerializer(serializers.Serializer):
    sessionId = serializers.CharField(source="session_id")
    bookingId = serializers.CharField(source="booking_id")
    topicTitle = serializers.CharField(source="topic_title")
    instructorName = serializers.CharField(source="instructor_name")
    scheduledAt = serializers.DateTimeField(source="scheduled_at")
    durationMinutes = serializers.IntegerField(source="duration_minutes")
    phase = serializers.CharField()  # waiting | live | completed | cancelled | expired
    canJoin = serializers.BooleanField(source="can_join")
    joinOpensAt = serializers.DateTimeField(source="join_opens_at")
    joinClosesAt = serializers.DateTimeField(source="join_closes_at")
    viewerRole = serializers.CharField(source="viewer_role", allow_null=True)


class TranscriptSerializer(serializers.Serializer):
    transcriptId = serializers.CharField(source="transcript_id")
    sessionId = serializers.CharField(source="session_id")
    source = serializers.CharField()


# ── ai reports ────────────────────────────────────────────────────────────────
class AIReportAckSerializer(serializers.Serializer):
    reportId = serializers.CharField(source="report_id")
    sessionId = serializers.CharField(source="session_id")
    status = serializers.CharField()
    overallScore = serializers.IntegerField(source="overall_score", allow_null=True)


class AIReportDetailSerializer(serializers.Serializer):
    id = serializers.CharField()
    sessionId = serializers.CharField(source="session_id")
    bookingId = serializers.CharField(source="booking_id")
    topicTitle = serializers.CharField(source="topic_title")
    instructorName = serializers.CharField(source="instructor_name")
    sessionDate = serializers.DateTimeField(source="session_date")
    durationMinutes = serializers.IntegerField(source="duration_minutes")
    status = serializers.CharField()
    overallScore = serializers.IntegerField(source="overall_score", allow_null=True)
    skills = serializers.JSONField()
    mistakes = serializers.JSONField()
    recommendations = serializers.JSONField()
    vocabulary = serializers.JSONField()
    instructorNote = serializers.CharField(source="instructor_note", allow_null=True)
    # Sprint 9 — validated AI session report content (11 fields) or null while pending.
    content = serializers.JSONField(allow_null=True, required=False)


class RateSessionInputSerializer(serializers.Serializer):
    stars = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(required=False, allow_blank=True, default="", max_length=1000)


# ── notifications ─────────────────────────────────────────────────────────────
class NotificationSerializer(serializers.Serializer):
    id = serializers.CharField()
    type = serializers.CharField()
    title = serializers.CharField()
    read = serializers.BooleanField()
    createdAt = serializers.DateTimeField(source="created_at")
    body = serializers.CharField(allow_null=True)
    data = serializers.JSONField(allow_null=True)


# ─────────────────────────────────────────────────────────────────────────────
# Input serializers (request validation only)
# ─────────────────────────────────────────────────────────────────────────────
class CreateBookingInputSerializer(serializers.Serializer):
    topicId = serializers.UUIDField()
    slotId = serializers.UUIDField()


class AdminCancelInputSerializer(serializers.Serializer):
    forceCredit = serializers.BooleanField(required=False, allow_null=True, default=None)


class ReviewNoteInputSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True, default=None)


class ExtendSubscriptionInputSerializer(serializers.Serializer):
    newExpiresAt = serializers.DateTimeField()
    reason = serializers.CharField(required=False, allow_blank=True, default=None)


class TopUpInputSerializer(serializers.Serializer):
    sessions = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(required=False, allow_blank=True, default=None)


class RefundNoteInputSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    currency = serializers.CharField(max_length=3)
    reason = serializers.CharField()


class AttachTranscriptInputSerializer(serializers.Serializer):
    content = serializers.JSONField()
    source = serializers.ChoiceField(choices=["asr", "manual"], required=False, default="manual")


class GenerateReportInputSerializer(serializers.Serializer):
    transcript = serializers.JSONField(required=False, default=None)


# ── Phase 6C inputs/outputs ───────────────────────────────────────────────────
class RegisterInputSerializer(serializers.Serializer):
    fullName = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, write_only=True)


class UpdateProfileInputSerializer(serializers.Serializer):
    fullName = serializers.CharField(max_length=150)


class InstructorProfileSerializer(serializers.Serializer):
    id = serializers.CharField()
    fullName = serializers.CharField(source="full_name")
    email = serializers.EmailField()
    headline = serializers.CharField(allow_blank=True)
    bio = serializers.CharField(allow_blank=True)
    country = serializers.CharField(allow_blank=True)
    specialty = serializers.CharField(allow_blank=True)
    languages = serializers.ListField(child=serializers.CharField())
    interests = serializers.ListField(child=serializers.CharField())
    yearsExperience = serializers.IntegerField(source="years_experience")
    avatarUrl = serializers.CharField(source="avatar_url", allow_blank=True)
    introVideoUrl = serializers.CharField(source="intro_video_url", allow_blank=True)
    rating = serializers.FloatField()
    sessionsHosted = serializers.IntegerField(source="sessions_hosted")


class UpdateInstructorProfileInputSerializer(serializers.Serializer):
    """All fields optional — PATCH semantics. camelCase in, snake_case to the use case."""
    fullName = serializers.CharField(max_length=150, required=False)
    headline = serializers.CharField(max_length=160, required=False, allow_blank=True)
    bio = serializers.CharField(required=False, allow_blank=True)
    country = serializers.CharField(max_length=80, required=False, allow_blank=True)
    specialty = serializers.CharField(max_length=120, required=False, allow_blank=True)
    languages = serializers.ListField(child=serializers.CharField(max_length=40), required=False)
    interests = serializers.ListField(child=serializers.CharField(max_length=40), required=False)
    yearsExperience = serializers.IntegerField(min_value=0, max_value=80, required=False)
    avatarUrl = serializers.URLField(max_length=500, required=False, allow_blank=True)
    introVideoUrl = serializers.URLField(max_length=500, required=False, allow_blank=True)


class ChangePasswordInputSerializer(serializers.Serializer):
    currentPassword = serializers.CharField(write_only=True)
    newPassword = serializers.CharField(min_length=8, write_only=True)


class PasswordResetRequestInputSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmInputSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    newPassword = serializers.CharField(min_length=8, write_only=True)


class InviteUserInputSerializer(serializers.Serializer):
    fullName = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=["instructor", "admin", "student"])


class SetUserStatusInputSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["active", "suspended"])


class ChangeUserRoleInputSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["student", "instructor", "admin"])


class SetGoalInputSerializer(serializers.Serializer):
    goalId = serializers.UUIDField()


class SubmitPaymentProofInputSerializer(serializers.Serializer):
    planId = serializers.UUIDField()
    transactionNumber = serializers.CharField(max_length=60)
    transferDatetime = serializers.DateTimeField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    receipt = serializers.FileField()
    senderName = serializers.CharField(max_length=150, required=False, allow_blank=True, default=None)
    receiverName = serializers.CharField(max_length=150, required=False, allow_blank=True, default=None)
    rawOcrData = serializers.JSONField(required=False, default=None)

    def validate_receipt(self, value):
        # Type / size / magic-byte / filename validation for the receipt upload.
        return validate_receipt_file(value)


class PaymentProofDetailSerializer(serializers.Serializer):
    id = serializers.CharField()
    planName = serializers.CharField(source="plan_name")
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, coerce_to_string=False)
    currency = serializers.CharField()
    transactionNumber = serializers.CharField(source="transaction_number")
    transferDatetime = serializers.DateTimeField(source="transfer_datetime")
    receiptName = serializers.CharField(source="receipt_name")
    status = serializers.CharField()
    submittedAt = serializers.DateTimeField(source="submitted_at")
    retainUntil = serializers.DateTimeField(source="retain_until", allow_null=True)
    senderName = serializers.CharField(source="sender_name", allow_null=True)
    receiverName = serializers.CharField(source="receiver_name", allow_null=True)
    reviewedAt = serializers.DateTimeField(source="reviewed_at", allow_null=True)
    reviewNote = serializers.CharField(source="review_note", allow_null=True)
    receiptUrl = serializers.CharField(source="receipt_url", allow_null=True)
    # Admin-review context (null for the student's own view).
    studentId = serializers.CharField(source="student_id", allow_null=True)
    studentName = serializers.CharField(source="student_name", allow_null=True)


class CreateTopicInputSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=120)
    category = serializers.CharField(max_length=60)
    level = serializers.CharField(max_length=2)
    description = serializers.CharField(required=False, allow_blank=True, default=None)
    icon = serializers.CharField(max_length=40, required=False, allow_blank=True, default=None)
    accent = serializers.CharField(max_length=60, required=False, allow_blank=True, default=None)
    vocabulary = serializers.JSONField(required=False, default=None)
    samplePrompts = serializers.JSONField(required=False, default=None)


class UpdateTopicInputSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=120, required=False, default=None)
    category = serializers.CharField(max_length=60, required=False, default=None)
    level = serializers.CharField(max_length=2, required=False, default=None)
    description = serializers.CharField(required=False, allow_blank=True, default=None)
    icon = serializers.CharField(max_length=40, required=False, allow_blank=True, default=None)
    accent = serializers.CharField(max_length=60, required=False, allow_blank=True, default=None)
    vocabulary = serializers.JSONField(required=False, default=None)
    samplePrompts = serializers.JSONField(required=False, default=None)


class AddQuestionInputSerializer(serializers.Serializer):
    text = serializers.CharField()


class _SlotInputSerializer(serializers.Serializer):
    startAt = serializers.DateTimeField()
    durationMinutes = serializers.IntegerField(min_value=1, required=False, default=45)


class SetAvailabilityInputSerializer(serializers.Serializer):
    slots = _SlotInputSerializer(many=True)


# ── placement (Phase 8E) ───────────────────────────────────────────────────────
# Output serializers read frozen DTOs only. `options` are the visible MCQ choices;
# the answer key (`correct_answer`, `correct_index`, `scoring_rubric`) and any
# pronunciation field simply do not exist on the source DTO, so they cannot leak.
class PlacementQuestionItemSerializer(serializers.Serializer):
    id = serializers.CharField()
    type = serializers.CharField(source="question_type")
    prompt = serializers.CharField()
    skill = serializers.CharField()
    cefrBand = serializers.CharField(source="cefr_band")
    order = serializers.IntegerField()
    options = serializers.ListField(child=serializers.CharField(), default=list)


class PlacementTestSerializer(serializers.Serializer):
    written = PlacementQuestionItemSerializer(many=True)
    spoken = PlacementQuestionItemSerializer(many=True)


# ── speaking interview (Sprint 2) ──────────────────────────────────────────────
# Presentational script lines only. The DTO carries no model prompt / provider key
# / answer key / score, so none can leak here.
class InterviewStepSerializer(serializers.Serializer):
    questionId = serializers.CharField(source="question_id")
    order = serializers.IntegerField()
    prompt = serializers.CharField()
    preamble = serializers.CharField()
    clarification = serializers.CharField()


class SpeakingInterviewSerializer(serializers.Serializer):
    greeting = serializers.CharField()
    instructions = serializers.CharField()
    encouragement = serializers.CharField()
    closing = serializers.CharField()
    steps = InterviewStepSerializer(many=True)
    # Deterministic OneClub script metadata (Sprint 2.0.1A).
    scriptId = serializers.CharField(source="script_id")
    scriptVersion = serializers.CharField(source="script_version")
    language = serializers.CharField()
    resumeMessages = serializers.ListField(child=serializers.CharField(), source="resume_messages")


# Interview SESSION (Sprint 2.5) — lifecycle + transcript only, NO assessment fields.
class InterviewAnswerSerializer(serializers.Serializer):
    questionId = serializers.CharField(source="question_id")
    order = serializers.IntegerField()
    transcriptText = serializers.CharField(source="transcript_text")
    source = serializers.CharField()  # "voice" (locked) | "manual"


class InterviewSessionSerializer(serializers.Serializer):
    interviewId = serializers.CharField(source="interview_id")
    attemptId = serializers.CharField(source="attempt_id")
    status = serializers.CharField()  # created | running | completed | finalized
    currentQuestionIndex = serializers.IntegerField(source="current_question_index")
    startedAt = serializers.DateTimeField(source="started_at", allow_null=True)
    finishedAt = serializers.DateTimeField(source="finished_at", allow_null=True)
    answers = InterviewAnswerSerializer(many=True)
    scriptVersion = serializers.CharField(source="script_version", required=False, default="")


class InterviewAnswerInputSerializer(serializers.Serializer):
    questionId = serializers.UUIDField()
    transcriptText = serializers.CharField(allow_blank=True, trim_whitespace=False)
    source = serializers.ChoiceField(choices=["voice", "manual"], default="manual")




class PlacementAttemptSerializer(serializers.Serializer):
    id = serializers.CharField()
    status = serializers.CharField()
    version = serializers.IntegerField()
    goalId = serializers.CharField(source="goal_id", allow_null=True)
    startedAt = serializers.DateTimeField(source="started_at", allow_null=True)
    submittedAt = serializers.DateTimeField(source="submitted_at", allow_null=True)
    assessedAt = serializers.DateTimeField(source="assessed_at", allow_null=True)
    fallbackUsed = serializers.BooleanField(source="fallback_used")
    providerName = serializers.CharField(source="provider_name", allow_null=True, allow_blank=True)


class PlacementAttemptStatusSerializer(serializers.Serializer):
    status = serializers.CharField()
    attemptId = serializers.CharField(source="attempt_id", allow_null=True)
    writtenComplete = serializers.BooleanField(source="written_complete")
    spokenComplete = serializers.BooleanField(source="spoken_complete")
    assessed = serializers.BooleanField()
    canSubmit = serializers.BooleanField(source="can_submit")


class PlacementAssessmentSerializer(serializers.Serializer):
    """Serializes a PlacementStoredResult (Submit + Result). No pronunciation field."""

    cefrLevel = serializers.CharField(source="cefr_level")
    overallConversationScore = serializers.IntegerField(source="overall_conversation_score")
    grammarScore = serializers.IntegerField(source="grammar_score")
    vocabularyScore = serializers.IntegerField(source="vocabulary_score")
    fluencyScore = serializers.IntegerField(source="fluency_score")
    confidenceScore = serializers.IntegerField(source="confidence_score")
    writtenScore = serializers.IntegerField(source="written_score")
    spokenScore = serializers.IntegerField(source="spoken_score")
    spokenCapped = serializers.BooleanField(source="spoken_capped")
    spokenCeiling = serializers.CharField(source="spoken_ceiling")
    strengths = serializers.ListField(source="recommendation.strengths", child=serializers.CharField())
    weaknesses = serializers.ListField(source="recommendation.weaknesses", child=serializers.CharField())
    recommendedFocus = serializers.ListField(source="recommendation.recommended_focus", child=serializers.CharField())
    recommendedConversationTopics = serializers.ListField(
        source="recommendation.recommended_conversation_topics", child=serializers.CharField()
    )
    recommendedInstructorDifficulty = serializers.CharField(
        source="recommendation.recommended_instructor_difficulty"
    )
    fallbackUsed = serializers.BooleanField(source="fallback_used")
    providerName = serializers.CharField(source="provider_name")


class PlacementResetAuditSerializer(serializers.Serializer):
    auditId = serializers.CharField(source="audit_id")
    attemptId = serializers.CharField(source="attempt_id")
    studentId = serializers.CharField(source="student_id")
    resetById = serializers.CharField(source="reset_by_id", allow_null=True)
    reason = serializers.CharField()


# input serializers
class _WrittenAnswerInputSerializer(serializers.Serializer):
    questionId = serializers.UUIDField()
    answerText = serializers.CharField(allow_blank=True, trim_whitespace=False)


class _SpokenTranscriptInputSerializer(serializers.Serializer):
    questionId = serializers.UUIDField()
    transcriptText = serializers.CharField(allow_blank=True, trim_whitespace=False)


class PlacementWrittenAnswersInputSerializer(serializers.Serializer):
    attemptId = serializers.UUIDField()
    answers = _WrittenAnswerInputSerializer(many=True)


class PlacementSpokenTranscriptsInputSerializer(serializers.Serializer):
    attemptId = serializers.UUIDField()
    transcripts = _SpokenTranscriptInputSerializer(many=True)


class PlacementResetInputSerializer(serializers.Serializer):
    # allow_blank so the *domain* rule (reason required) owns the check → 422,
    # rather than a serializer 400; trim_whitespace=False so "   " reaches it.
    reason = serializers.CharField(allow_blank=True, trim_whitespace=False)
