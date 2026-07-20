"""
DRF views — THIN presentation layer.

Each view: validates request data (input serializer), calls exactly ONE
application use case with actor=request.user, and serializes the returned DTO.
No business logic, no ORM, no raw models. Domain exceptions propagate to the
global handler (api.exceptions.api_exception_handler).
"""
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from api.permissions import IsAdminRole
from apps.common.enums import AIReportStatus


from api import serializers as s

# Use cases — accounts / onboarding
from application.accounts.queries import GetCurrentUserProfileUseCase
from application.accounts.use_cases import (
    ChangePasswordUseCase,
    ConfirmPasswordResetUseCase,
    InviteUserUseCase,
    RegisterStudentUseCase,
    RequestPasswordResetUseCase,
    UpdateCurrentProfileUseCase,
)
from application.onboarding.queries import ListGoalOptionsUseCase
from application.onboarding.use_cases import SetStudentGoalUseCase

# Placement (Phase 8E)
from application.placement.use_cases import (
    AdminResetSpokenAttemptUseCase,
    GetMyPlacementResultUseCase,
    GetPlacementAttemptStatusUseCase,
    ListPlacementQuestionsUseCase,
    SaveSpokenTranscriptsUseCase,
    SaveWrittenAnswersUseCase,
    StartPlacementAttemptUseCase,
    SubmitPlacementAttemptUseCase,
)

# Billing
from application.billing.queries import (
    GetBankAccountUseCase,
    GetCurrentSubscriptionUseCase,
    ListPaymentProvidersUseCase,
    ListPlansUseCase,
    ListStudentBillingHistoryUseCase,
)
from application.billing.use_cases import (
    ApprovePaymentProofUseCase,
    ExtendSubscriptionUseCase,
    GetAdminPaymentProofUseCase,
    GetMyLatestPaymentProofUseCase,
    RecordRefundNoteUseCase,
    RejectPaymentProofUseCase,
    ReopenPaymentProofUseCase,
    RequestPaymentInformationUseCase,
    SubmitPaymentProofUseCase,
    TopUpSubscriptionUseCase,
)

# Instructor authoring
from application.instructor.use_cases import (
    AddAvailabilityExceptionUseCase,
    AddManualQuestionUseCase,
    ApproveAIQuestionUseCase,
    CreateTopicUseCase,
    GetInstructorProfileUseCase,
    ListAvailabilityExceptionsUseCase,
    PublishTopicUseCase,
    RemoveAvailabilityExceptionUseCase,
    SetAvailabilityUseCase,
    UpdateInstructorProfileUseCase,
    UpdateTopicUseCase,
)

# Notifications (command)
from application.notifications.use_cases import MarkNotificationReadUseCase

# Scheduling
from application.scheduling.queries import (
    GetBookingDetailUseCase,
    GetInstructorDashboardUseCase,
    GetInstructorWindowsUseCase,
    GetPracticeContentUseCase,
    GetQuestionsForBookingUseCase,
    GetRecurringAvailabilityUseCase,
    GetStudentDashboardUseCase,
    GetStudentScheduleUseCase,
    GetTopicPreviewOrFullUseCase,
    GetWeeklyCalendarUseCase,
    ListAdminBookingsUseCase,
    MatchInstructorsForTimeUseCase,
    GetInstructorStudentUseCase,
    ListCommunitySessionsUseCase,
    ListInstructorBookingsUseCase,
    ListInstructorStudentsUseCase,
    ListInstructorAvailabilityUseCase,
    ListInstructorTopicsUseCase,
    ListStudentAvailableTopicsUseCase,
    ListStudentBookingsUseCase,
)
from application.scheduling.use_cases import (
    CancelBookingUseCase,
    CreateBookingUseCase,
    GenerateScheduleBookingsUseCase,
    JoinGroupSessionUseCase,
    LeaveGroupSessionUseCase,
    ListAvailableSlotsUseCase,
    RateSessionUseCase,
    RescheduleBookingUseCase,
    SetRecurringAvailabilityUseCase,
    SetStudentScheduleUseCase,
)

# Sessions
from application.sessions.queries import GetSessionDetailUseCase
from application.sessions.use_cases import (
    AcceptReportUseCase,
    AttachTranscriptUseCase,
    CompleteSessionUseCase,
    GetSessionUseCase,
    JoinSessionUseCase,
    LeaveSessionUseCase,
    SaveSessionNotesUseCase,
    StartSessionUseCase,
)

# AI reports
from application.ai_reports.queries import (
    GetAIReportDetailUseCase,
    GetSessionReportUseCase,
    GetStudentPlanUseCase,
    GetStudentProgressUseCase,
)
from application.ai_reports.use_cases import (
    GenerateAISessionReportUseCase,
    GenerateDiscussionQuestionsUseCase,
    GenerateSessionReportUseCase,
    GenerateTopicSubtopicsUseCase,
)

# Admin / notifications
from application.admin_ops.queries import (
    GetAdminDashboardUseCase,
    GetBusinessOverviewUseCase,
    GetPlatformStatusUseCase,
    ListAdminPaymentApprovalsUseCase,
    ListAdminSessionsUseCase,
    ListAuditLogUseCase,
    ListUsersUseCase,
)
from application.admin_ops.use_cases import (
    ChangeUserRoleUseCase,
    CreatePlanUseCase,
    ListPlansAdminUseCase,
    SetUserStatusUseCase,
    UpdatePlanUseCase,
)
from application.notifications.queries import ListNotificationsUseCase


def _validated(serializer_cls, request):
    serializer = serializer_cls(data=request.data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


class AdminAPIView(APIView):
    """Base for every /admin/* view — enforces the admin role at the HTTP layer
    (in addition to ensure_admin in the use case). Defense-in-depth: a forgotten
    domain check can never expose an admin endpoint to an ordinary user."""

    permission_classes = [IsAdminRole]


# ── Auth / Profile ────────────────────────────────────────────────────────────
class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "auth"  # blunt automated sign-up abuse

    def post(self, request):
        data = _validated(s.RegisterInputSerializer, request)
        dto = RegisterStudentUseCase().execute(
            full_name=data["fullName"], email=data["email"], password=data["password"]
        )
        return Response(s.UserProfileSerializer(dto).data, status=status.HTTP_201_CREATED)


class LogoutView(APIView):
    """Real, server-side logout: blacklist the presented refresh token so it can
    no longer mint new access tokens. Idempotent and safe to call with just the
    refresh token (an already-expired/blacklisted token is a no-op)."""

    permission_classes = [AllowAny]

    def post(self, request):
        from rest_framework_simplejwt.exceptions import TokenError
        from rest_framework_simplejwt.tokens import RefreshToken

        raw = request.data.get("refresh")
        if not raw:
            return Response(
                {"code": "validation_error", "detail": "refresh is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            RefreshToken(raw).blacklist()
        except TokenError:
            pass  # already invalid — logout still succeeds
        return Response({"loggedOut": True})


class MeView(APIView):
    def get(self, request):
        dto = GetCurrentUserProfileUseCase().execute(actor=request.user)
        return Response(s.UserProfileSerializer(dto).data)

    def patch(self, request):
        data = _validated(s.UpdateProfileInputSerializer, request)
        dto = UpdateCurrentProfileUseCase().execute(actor=request.user, full_name=data["fullName"])
        return Response(s.UserProfileSerializer(dto).data)


class ChangePasswordView(APIView):
    """Any authenticated user changes their own password."""

    def post(self, request):
        data = _validated(s.ChangePasswordInputSerializer, request)
        result = ChangePasswordUseCase().execute(
            actor=request.user,
            current_password=data["currentPassword"],
            new_password=data["newPassword"],
        )
        return Response(result)


class PasswordResetRequestView(APIView):
    """Public — email a password-reset link. Always 200 (no account enumeration)."""

    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        data = _validated(s.PasswordResetRequestInputSerializer, request)
        result = RequestPasswordResetUseCase().execute(email=data["email"])
        return Response(result)


class PasswordResetConfirmView(APIView):
    """Public — set a new password from a valid uid+token (also activates invitees)."""

    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        data = _validated(s.PasswordResetConfirmInputSerializer, request)
        result = ConfirmPasswordResetUseCase().execute(
            uid=data["uid"], token=data["token"], new_password=data["newPassword"]
        )
        return Response(result)


class AdminInviteUserView(AdminAPIView):
    """Admin invites a user (instructor/admin/student) and emails a set-password link."""

    def post(self, request):
        data = _validated(s.InviteUserInputSerializer, request)
        result = InviteUserUseCase().execute(
            actor=request.user, full_name=data["fullName"], email=data["email"], role=data["role"]
        )
        return Response(result, status=status.HTTP_201_CREATED)


class AdminUsersView(AdminAPIView):
    """Members table — all users (optionally filtered by ?role=)."""

    def get(self, request):
        items = ListUsersUseCase().execute(actor=request.user, role=request.query_params.get("role"))
        return Response(items)


class AdminUserStatusView(AdminAPIView):
    def post(self, request, user_id):
        data = _validated(s.SetUserStatusInputSerializer, request)
        result = SetUserStatusUseCase().execute(actor=request.user, user_id=user_id, status=data["status"])
        return Response(result)


class AdminUserRoleView(AdminAPIView):
    def post(self, request, user_id):
        data = _validated(s.ChangeUserRoleInputSerializer, request)
        result = ChangeUserRoleUseCase().execute(actor=request.user, user_id=user_id, role=data["role"])
        return Response(result)


class AdminAuditLogView(AdminAPIView):
    def get(self, request):
        return Response(ListAuditLogUseCase().execute(actor=request.user))


class AdminSessionsView(AdminAPIView):
    """Operations monitor — all sessions across the platform."""

    def get(self, request):
        return Response(ListAdminSessionsUseCase().execute(actor=request.user))


class AdminBusinessView(AdminAPIView):
    """Business KPIs — revenue, subscriptions, plan mix, teaching output."""

    def get(self, request):
        return Response(GetBusinessOverviewUseCase().execute(actor=request.user))


class AdminPlatformView(AdminAPIView):
    """Platform monitor — provider health + AI report queue."""

    def get(self, request):
        return Response(GetPlatformStatusUseCase().execute(actor=request.user))


class InstructorProfileView(APIView):
    """The instructor reads (GET) and edits (PATCH) their own teaching profile."""

    def get(self, request):
        dto = GetInstructorProfileUseCase().execute(actor=request.user)
        return Response(s.InstructorProfileSerializer(dto).data)

    def patch(self, request):
        data = _validated(s.UpdateInstructorProfileInputSerializer, request)
        mapped = {
            "full_name": data.get("fullName"),
            "headline": data.get("headline"),
            "bio": data.get("bio"),
            "country": data.get("country"),
            "specialty": data.get("specialty"),
            "languages": data.get("languages"),
            "interests": data.get("interests"),
            "years_experience": data.get("yearsExperience"),
            "avatar_url": data.get("avatarUrl"),
            "intro_video_url": data.get("introVideoUrl"),
        }
        dto = UpdateInstructorProfileUseCase().execute(
            actor=request.user, **{k: v for k, v in mapped.items() if v is not None}
        )
        return Response(s.InstructorProfileSerializer(dto).data)


class MeGoalView(APIView):
    def put(self, request):
        data = _validated(s.SetGoalInputSerializer, request)
        dto = SetStudentGoalUseCase().execute(actor=request.user, goal_id=data["goalId"])
        return Response(s.UserProfileSerializer(dto).data)


# ── Onboarding / Placement ────────────────────────────────────────────────────
class GoalListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        dtos = ListGoalOptionsUseCase().execute(actor=request.user)
        return Response(s.GoalOptionSerializer(dtos, many=True).data)


# ── Placement (Phase 8E — thin) ───────────────────────────────────────────────
class PlacementTestView(APIView):
    def get(self, request):
        dto = ListPlacementQuestionsUseCase().execute(actor=request.user)
        return Response(s.PlacementTestSerializer(dto).data)


class PlacementInterviewView(APIView):
    def get(self, request):
        from application.placement.interview import GetSpeakingInterviewUseCase

        dto = GetSpeakingInterviewUseCase().execute(actor=request.user)
        return Response(s.SpeakingInterviewSerializer(dto).data)


class InterviewSessionView(APIView):
    def get(self, request):
        # Resume: get-or-create the session with every captured answer so far.
        from application.placement.interview import GetOrCreateInterviewSessionUseCase

        dto = GetOrCreateInterviewSessionUseCase().execute(actor=request.user)
        return Response(s.InterviewSessionSerializer(dto).data)


class InterviewAnswerView(APIView):
    def post(self, request):
        from application.placement.interview import SaveInterviewAnswerUseCase

        data = _validated(s.InterviewAnswerInputSerializer, request)
        dto = SaveInterviewAnswerUseCase().execute(
            actor=request.user,
            question_id=str(data["questionId"]),
            transcript_text=data["transcriptText"],
            source=data["source"],
        )
        return Response(s.InterviewSessionSerializer(dto).data)


class InterviewFinalizeView(APIView):
    def post(self, request):
        from application.placement.interview import FinalizeInterviewUseCase

        dto = FinalizeInterviewUseCase().execute(actor=request.user)
        return Response(s.InterviewSessionSerializer(dto).data)


class PlacementStartView(APIView):
    def post(self, request):
        dto = StartPlacementAttemptUseCase().execute(actor=request.user)
        return Response(s.PlacementAttemptSerializer(dto).data, status=status.HTTP_201_CREATED)


class PlacementWrittenAnswersView(APIView):
    def post(self, request):
        data = _validated(s.PlacementWrittenAnswersInputSerializer, request)
        answers = [
            {"question_id": str(a["questionId"]), "answer_text": a["answerText"]}
            for a in data["answers"]
        ]
        dto = SaveWrittenAnswersUseCase().execute(actor=request.user, answers=answers)
        return Response(s.PlacementAttemptSerializer(dto).data)


class PlacementSpokenTranscriptsView(APIView):
    def post(self, request):
        data = _validated(s.PlacementSpokenTranscriptsInputSerializer, request)
        transcripts = [
            {"question_id": str(t["questionId"]), "transcript_text": t["transcriptText"]}
            for t in data["transcripts"]
        ]
        dto = SaveSpokenTranscriptsUseCase().execute(actor=request.user, transcripts=transcripts)
        return Response(s.PlacementAttemptSerializer(dto).data)


class PlacementSubmitView(APIView):
    def post(self, request):
        dto = SubmitPlacementAttemptUseCase().execute(actor=request.user)
        return Response(s.PlacementAssessmentSerializer(dto).data)


class PlacementResultView(APIView):
    def get(self, request):
        dto = GetMyPlacementResultUseCase().execute(actor=request.user)
        return Response(s.PlacementAssessmentSerializer(dto).data)


class PlacementReviewView(APIView):
    """Transparent per-question review of the assessed attempt (questions, the
    learner's answers, correct answers, transcripts, and scores)."""

    def get(self, request):
        from application.placement.use_cases import GetPlacementReviewUseCase

        data = GetPlacementReviewUseCase().execute(actor=request.user)
        return Response(data)


class PlacementStatusView(APIView):
    def get(self, request):
        dto = GetPlacementAttemptStatusUseCase().execute(actor=request.user)
        return Response(s.PlacementAttemptStatusSerializer(dto).data)


class AdminPlacementResetSpokenView(AdminAPIView):
    def post(self, request, student_id):
        data = _validated(s.PlacementResetInputSerializer, request)
        dto = AdminResetSpokenAttemptUseCase().execute(
            actor=request.user, student_id=student_id, reason=data["reason"]
        )
        return Response(s.PlacementResetAuditSerializer(dto).data)


# ── Billing ───────────────────────────────────────────────────────────────────
class PlanListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        dtos = ListPlansUseCase().execute(actor=request.user)
        return Response(s.PlanSerializer(dtos, many=True).data)


class PaymentProvidersView(APIView):
    """Active payment providers, ordered by displayOrder (no hardcoded bank)."""

    permission_classes = [AllowAny]

    def get(self, request):
        dtos = ListPaymentProvidersUseCase().execute(actor=request.user)
        return Response(s.PaymentProviderSerializer(dtos, many=True).data)


class BankAccountView(APIView):
    """The default active bank-transfer account (no hardcoded bank name)."""

    permission_classes = [AllowAny]

    def get(self, request):
        dto = GetBankAccountUseCase().execute(actor=request.user)
        return Response(s.PaymentProviderSerializer(dto).data)


class PaymentInstructionsView(APIView):
    """Backward-compatible alias of /billing/bank-account/ (subset shape)."""

    permission_classes = [AllowAny]

    def get(self, request):
        dto = GetBankAccountUseCase().execute(actor=request.user)
        return Response(s.PaymentInstructionsSerializer(dto).data)


class StudentSubscriptionView(APIView):
    def get(self, request):
        dto = GetCurrentSubscriptionUseCase().execute(actor=request.user)
        if dto is None:  # GetCurrentSubscriptionUseCase returns None → 404
            return Response(
                {"code": "not_found", "detail": "No active subscription."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(s.SubscriptionDetailSerializer(dto).data)


class StudentBillingHistoryView(APIView):
    def get(self, request):
        dtos = ListStudentBillingHistoryUseCase().execute(actor=request.user)
        return Response(s.BillingHistoryItemSerializer(dtos, many=True).data)


class StudentLatestPaymentProofView(APIView):
    """The student's own most recent payment proof (status + review note), so the
    under-review screen can show pending / approved / rejected / needs-info."""

    def get(self, request):
        dto = GetMyLatestPaymentProofUseCase().execute(actor=request.user)
        if dto is None:
            return Response(
                {"code": "not_found", "detail": "No payment proof submitted yet."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(s.PaymentProofDetailSerializer(dto).data)


# ── Student Scheduling ────────────────────────────────────────────────────────
class StudentDashboardView(APIView):
    def get(self, request):
        dto = GetStudentDashboardUseCase().execute(actor=request.user)
        return Response(s.StudentDashboardSerializer(dto).data)


class StudentTopicListView(APIView):
    def get(self, request):
        category = request.query_params.get("category")
        dtos = ListStudentAvailableTopicsUseCase().execute(actor=request.user, category=category)
        return Response(s.TopicPreviewSerializer(dtos, many=True).data)


class StudentTopicDetailView(APIView):
    def get(self, request, topic_id):
        dto = GetTopicPreviewOrFullUseCase().execute(actor=request.user, topic_id=topic_id)
        serializer = s.TopicFullSerializer if dto.mode == "full" else s.TopicPreviewSerializer
        return Response(serializer(dto).data)


class StudentTopicQuestionsView(APIView):
    def get(self, request, topic_id):
        dtos = GetQuestionsForBookingUseCase().execute(actor=request.user, topic_id=topic_id)
        return Response(s.QuestionFullSerializer(dtos, many=True).data)


class InstructorOpenSlotsView(APIView):
    def get(self, request, instructor_id):
        dtos = ListAvailableSlotsUseCase().execute(actor=request.user, instructor_id=instructor_id)
        return Response(s.AvailableSlotSerializer(dtos, many=True).data)


class StudentBookingsView(APIView):
    def get(self, request):
        dtos = ListStudentBookingsUseCase().execute(actor=request.user)
        return Response(s.BookingListItemSerializer(dtos, many=True).data)

    def post(self, request):
        data = _validated(s.CreateBookingInputSerializer, request)
        dto = CreateBookingUseCase().execute(
            actor=request.user, topic_id=data["topicId"], slot_id=data["slotId"]
        )
        return Response(s.BookingResultSerializer(dto).data, status=status.HTTP_201_CREATED)


class StudentBookingDetailView(APIView):
    def get(self, request, booking_id):
        dto = GetBookingDetailUseCase().execute(actor=request.user, booking_id=booking_id)
        return Response(s.BookingDetailSerializer(dto).data)

    def delete(self, request, booking_id):
        dto = CancelBookingUseCase().execute(actor=request.user, booking_id=booking_id)
        return Response(s.CancellationSerializer(dto).data)


class SessionRatingView(APIView):
    """A student rates their completed session (1–5 + optional review)."""

    def post(self, request, booking_id):
        data = _validated(s.RateSessionInputSerializer, request)
        result = RateSessionUseCase().execute(
            actor=request.user, booking_id=booking_id, stars=data["stars"], comment=data.get("comment", "")
        )
        return Response(result, status=status.HTTP_201_CREATED)


class StudentPracticeView(APIView):
    """Practice-hub study material (vocabulary + practice phrases)."""

    def get(self, request):
        data = GetPracticeContentUseCase().execute(actor=request.user)
        return Response(data)


class CommunitySessionsView(APIView):
    """Upcoming group/community sessions a student can browse and join."""

    def get(self, request):
        sessions = ListCommunitySessionsUseCase().execute(actor=request.user)
        return Response(s.GroupSessionSerializer(sessions, many=True).data)


class CommunitySessionJoinView(APIView):
    """Join (POST) or leave (DELETE) a group session."""

    def post(self, request, group_session_id):
        result = JoinGroupSessionUseCase().execute(actor=request.user, group_session_id=group_session_id)
        return Response(result, status=status.HTTP_201_CREATED)

    def delete(self, request, group_session_id):
        result = LeaveGroupSessionUseCase().execute(actor=request.user, group_session_id=group_session_id)
        return Response(result)


class StudentCalendarView(APIView):
    """Weekly (Mon–Sun) calendar of a topic's instructor slots."""

    def get(self, request):
        from datetime import date

        topic_id = request.query_params.get("topicId")
        if not topic_id:
            return Response(
                {"code": "validation_error", "detail": "topicId is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        week_start = None
        raw = request.query_params.get("weekStart")
        if raw:
            try:
                week_start = date.fromisoformat(raw)
            except ValueError:
                week_start = None  # ignore a malformed week; default to current week
        dto = GetWeeklyCalendarUseCase().execute(
            actor=request.user, topic_id=topic_id, week_start=week_start
        )
        return Response(s.WeeklyCalendarSerializer(dto).data)


class StudentScheduleView(APIView):
    """The student's recurring weekly schedule. GET returns the saved picks and the
    upcoming bookings materialised from them; PUT replaces the schedule and
    (re)generates the next couple of weeks of bookings."""

    def get(self, request):
        return Response(GetStudentScheduleUseCase().execute(actor=request.user))

    def put(self, request):
        data = _validated(s.SetStudentScheduleInputSerializer, request)
        picks = [
            {
                "weekday": p["weekday"],
                "start_time": p["startTime"],
                "topic_id": p["topicId"],
                "duration_minutes": p.get("durationMinutes", 45),
            }
            for p in data["picks"]
        ]
        result = SetStudentScheduleUseCase().execute(actor=request.user, picks=picks)
        return Response(result)


class StudentScheduleGenerateView(APIView):
    """Materialise upcoming bookings from the student's existing schedule (idempotent)."""

    def post(self, request):
        return Response(GenerateScheduleBookingsUseCase().execute(actor=request.user))


class StudentProgressView(APIView):
    """The student's session-over-session progress (overall + per-skill, with a
    time series and current-vs-previous deltas)."""

    def get(self, request):
        return Response(GetStudentProgressUseCase().execute(actor=request.user))


class StudentPlanView(APIView):
    """The student's personal learning plan, regenerated from their latest report."""

    def get(self, request):
        return Response(GetStudentPlanUseCase().execute(actor=request.user))


# ── AI tutor ────────────────────────────────────────────────────────────────────
class AITutorStatusView(APIView):
    """Whether the student is subscribed + any live practice session to resume."""

    def get(self, request):
        from application.ai_tutor.use_cases import GetAITutorStatusUseCase

        return Response(GetAITutorStatusUseCase().execute(actor=request.user))


class AITutorStartView(APIView):
    """Start a new 5-minute AI practice session."""

    def post(self, request):
        from application.ai_tutor.use_cases import StartAITutorSessionUseCase

        data = _validated(s.StartAITutorInputSerializer, request)
        result = StartAITutorSessionUseCase().execute(actor=request.user, topic=data.get("topic", ""))
        return Response(result, status=status.HTTP_201_CREATED)


class AITutorMessageView(APIView):
    """Send a message in a live practice session; returns the tutor's reply."""

    def post(self, request, session_id):
        from application.ai_tutor.use_cases import SendAITutorMessageUseCase

        data = _validated(s.AITutorMessageInputSerializer, request)
        result = SendAITutorMessageUseCase().execute(
            actor=request.user, session_id=session_id, text=data["text"]
        )
        return Response(result)


class AITutorEndView(APIView):
    """End a practice session early."""

    def post(self, request, session_id):
        from application.ai_tutor.use_cases import EndAITutorSessionUseCase

        return Response(EndAITutorSessionUseCase().execute(actor=request.user, session_id=session_id))


# ── Public instructor directory + profiles ────────────────────────────────────
_PROFILE_KEY_MAP = {
    "jobTitle": "job_title", "yearsExperience": "years_experience",
    "avatarUrl": "avatar_url", "coverPhotoUrl": "cover_photo_url",
    "introVideoUrl": "intro_video_url", "specialization": "specialty",
    "headline": "headline", "bio": "bio", "country": "country", "city": "city",
    "nationality": "nationality", "specialty": "specialty", "languages": "languages",
}
_SETTINGS_KEY_MAP = {
    "showOnLanding": "show_on_landing", "acceptStudents": "accept_students",
    "availableForIelts": "available_for_ielts",
    "availableForBusiness": "available_for_business",
    "availableForConversation": "available_for_conversation",
}


def _map_keys(data, mapping):
    return {mapping[k]: v for k, v in data.items() if k in mapping}


class InstructorPublicListView(APIView):
    """Approved, public instructors for the landing page / directory."""

    permission_classes = [AllowAny]

    def get(self, request):
        from application.instructor.public_profile import ListPublicInstructorsUseCase

        return Response(ListPublicInstructorsUseCase().execute())


class InstructorPublicDetailView(APIView):
    """A single public instructor profile by slug (SEO-friendly)."""

    permission_classes = [AllowAny]

    def get(self, request, slug):
        from application.instructor.public_profile import GetPublicInstructorUseCase

        return Response(GetPublicInstructorUseCase().execute(slug=slug))


class InstructorPublicProfileView(APIView):
    """Teacher edits their own professional information."""

    def put(self, request):
        from application.instructor.public_profile import UpdatePublicProfileUseCase

        data = _map_keys(request.data, _PROFILE_KEY_MAP)
        return Response(UpdatePublicProfileUseCase().execute(actor=request.user, data=data))

    patch = put


class InstructorPublicSettingsView(APIView):
    """Teacher toggles their public-profile settings."""

    def put(self, request):
        from application.instructor.public_profile import UpdatePublicSettingsUseCase

        data = _map_keys(request.data, _SETTINGS_KEY_MAP)
        return Response(UpdatePublicSettingsUseCase().execute(actor=request.user, data=data))

    patch = put


class InstructorSocialLinksView(APIView):
    def put(self, request):
        from application.instructor.public_profile import ReplaceSocialLinksUseCase

        links = request.data.get("links", request.data if isinstance(request.data, list) else [])
        return Response(ReplaceSocialLinksUseCase().execute(actor=request.user, links=links))


class InstructorEducationView(APIView):
    def put(self, request):
        from application.instructor.public_profile import ReplaceEducationUseCase

        items = request.data.get("items", [])
        return Response(ReplaceEducationUseCase().execute(actor=request.user, items=items))


class InstructorExperienceView(APIView):
    def put(self, request):
        from application.instructor.public_profile import ReplaceExperienceUseCase

        items = request.data.get("items", [])
        return Response(ReplaceExperienceUseCase().execute(actor=request.user, items=items))


class InstructorCertificationsView(APIView):
    def put(self, request):
        from application.instructor.public_profile import ReplaceCertificationsUseCase

        items = request.data.get("items", [])
        return Response(ReplaceCertificationsUseCase().execute(actor=request.user, items=items))


# ── Admin instructor controls ─────────────────────────────────────────────────
class AdminInstructorListView(AdminAPIView):
    def get(self, request):
        from application.instructor.public_profile import ListAdminInstructorsUseCase

        return Response(ListAdminInstructorsUseCase().execute(actor=request.user))


class AdminInstructorApproveView(AdminAPIView):
    def patch(self, request, instructor_id):
        from application.instructor.public_profile import SetInstructorApprovedUseCase

        return Response(SetInstructorApprovedUseCase().execute(
            actor=request.user, instructor_id=instructor_id,
            approved=bool(request.data.get("approved", True)),
        ))


class AdminInstructorFeatureView(AdminAPIView):
    def patch(self, request, instructor_id):
        from application.instructor.public_profile import SetInstructorFeaturedUseCase

        return Response(SetInstructorFeaturedUseCase().execute(
            actor=request.user, instructor_id=instructor_id,
            featured=bool(request.data.get("featured", True)),
        ))


class AdminInstructorVisibilityView(AdminAPIView):
    def patch(self, request, instructor_id):
        from application.instructor.public_profile import SetInstructorVisibilityUseCase

        return Response(SetInstructorVisibilityUseCase().execute(
            actor=request.user, instructor_id=instructor_id,
            show=bool(request.data.get("showOnLanding", True)),
        ))


class AdminInstructorFoundingView(AdminAPIView):
    def patch(self, request, instructor_id):
        from application.instructor.public_profile import SetInstructorFoundingUseCase

        return Response(SetInstructorFoundingUseCase().execute(
            actor=request.user, instructor_id=instructor_id,
            founding=bool(request.data.get("founding", True)),
        ))


class AdminInstructorDisplayOrderView(AdminAPIView):
    def patch(self, request, instructor_id):
        from application.instructor.public_profile import SetInstructorDisplayOrderUseCase

        return Response(SetInstructorDisplayOrderUseCase().execute(
            actor=request.user, instructor_id=instructor_id,
            order=int(request.data.get("displayOrder", 0)),
        ))


class StudentScheduleWindowsView(APIView):
    """The recurring availability windows a student may pick within — resolved from
    a topicId (its instructor) or an explicit instructorId query param."""

    def get(self, request):
        topic_id = request.query_params.get("topicId")
        instructor_id = request.query_params.get("instructorId")
        if not topic_id and not instructor_id:
            return Response(
                {"code": "validation_error", "detail": "topicId or instructorId is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            GetInstructorWindowsUseCase().execute(
                actor=request.user, topic_id=topic_id, instructor_id=instructor_id
            )
        )


class StudentScheduleCandidatesView(APIView):
    """Which instructors can teach at a given weekday + time (time-first matching)."""

    def get(self, request):
        from datetime import time as _time

        weekday = request.query_params.get("weekday")
        raw_time = request.query_params.get("startTime")
        try:
            weekday_int = int(weekday)
            assert 0 <= weekday_int <= 6
            hh, mm = (int(p) for p in raw_time.split(":")[:2])
            start_time = _time(hh, mm)
        except (TypeError, ValueError, AssertionError):
            return Response(
                {"code": "validation_error", "detail": "weekday (0-6) and startTime (HH:MM) are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            MatchInstructorsForTimeUseCase().execute(
                actor=request.user, weekday=weekday_int, start_time=start_time
            )
        )


# ── Instructor ────────────────────────────────────────────────────────────────
class InstructorDashboardView(APIView):
    def get(self, request):
        dto = GetInstructorDashboardUseCase().execute(actor=request.user)
        return Response(s.InstructorDashboardSerializer(dto).data)


class InstructorTopicListView(APIView):
    def get(self, request):
        dtos = ListInstructorTopicsUseCase().execute(actor=request.user)
        return Response(s.TopicFullSerializer(dtos, many=True).data)


class InstructorAvailabilityView(APIView):
    def get(self, request):
        dtos = ListInstructorAvailabilityUseCase().execute(actor=request.user)
        return Response(s.InstructorSlotSerializer(dtos, many=True).data)


class InstructorSuggestSubtopicsView(APIView):
    def post(self, request, topic_id):
        dto = GenerateTopicSubtopicsUseCase().execute(actor=request.user, topic_id=topic_id)
        return Response(s.SuggestionSerializer(dto).data)


class InstructorSuggestQuestionsView(APIView):
    def post(self, request, topic_id):
        dto = GenerateDiscussionQuestionsUseCase().execute(actor=request.user, topic_id=topic_id)
        return Response(s.SuggestionSerializer(dto).data, status=status.HTTP_201_CREATED)


# ── Admin ─────────────────────────────────────────────────────────────────────
class AdminDashboardView(AdminAPIView):
    def get(self, request):
        dto = GetAdminDashboardUseCase().execute(actor=request.user)
        return Response(s.AdminDashboardSerializer(dto).data)


class AdminPaymentProofListView(AdminAPIView):
    def get(self, request):
        dtos = ListAdminPaymentApprovalsUseCase().execute(actor=request.user)
        return Response(s.PaymentApprovalItemSerializer(dtos, many=True).data)


class AdminApprovePaymentView(AdminAPIView):
    def post(self, request, proof_id):
        dto = ApprovePaymentProofUseCase().execute(actor=request.user, proof_id=proof_id)
        return Response(s.PaymentApprovalResultSerializer(dto).data)


class AdminRejectPaymentView(AdminAPIView):
    def post(self, request, proof_id):
        data = _validated(s.ReviewNoteInputSerializer, request)
        dto = RejectPaymentProofUseCase().execute(
            actor=request.user, proof_id=proof_id, note=data.get("note")
        )
        return Response(s.PaymentDecisionSerializer(dto).data)


class AdminReopenPaymentView(AdminAPIView):
    def post(self, request, proof_id):
        dto = ReopenPaymentProofUseCase().execute(actor=request.user, proof_id=proof_id)
        return Response(s.PaymentDecisionSerializer(dto).data)


class AdminPaymentProofDetailView(AdminAPIView):
    def get(self, request, proof_id):
        dto = GetAdminPaymentProofUseCase().execute(actor=request.user, proof_id=proof_id)
        return Response(s.PaymentProofDetailSerializer(dto).data)


class AdminRequestPaymentInfoView(AdminAPIView):
    def post(self, request, proof_id):
        data = _validated(s.ReviewNoteInputSerializer, request)
        dto = RequestPaymentInformationUseCase().execute(
            actor=request.user, proof_id=proof_id, note=data.get("note")
        )
        return Response(s.PaymentDecisionSerializer(dto).data)


class AdminExtendSubscriptionView(AdminAPIView):
    def patch(self, request, subscription_id):
        data = _validated(s.ExtendSubscriptionInputSerializer, request)
        dto = ExtendSubscriptionUseCase().execute(
            actor=request.user,
            subscription_id=subscription_id,
            new_expires_at=data["newExpiresAt"],
            reason=data.get("reason"),
        )
        return Response(s.SubscriptionResultSerializer(dto).data)


class AdminTopUpSubscriptionView(AdminAPIView):
    def patch(self, request, subscription_id):
        data = _validated(s.TopUpInputSerializer, request)
        dto = TopUpSubscriptionUseCase().execute(
            actor=request.user,
            subscription_id=subscription_id,
            sessions=data["sessions"],
            reason=data.get("reason"),
        )
        return Response(s.SubscriptionResultSerializer(dto).data)


class AdminRefundNoteView(AdminAPIView):
    def post(self, request, subscription_id):
        data = _validated(s.RefundNoteInputSerializer, request)
        dto = RecordRefundNoteUseCase().execute(
            actor=request.user,
            subscription_id=subscription_id,
            amount=data["amount"],
            currency=data["currency"],
            reason=data["reason"],
        )
        return Response(s.RefundNoteSerializer(dto).data, status=status.HTTP_201_CREATED)


class AdminCancelBookingView(AdminAPIView):
    def post(self, request, booking_id):
        data = _validated(s.AdminCancelInputSerializer, request)
        dto = CancelBookingUseCase().execute(
            actor=request.user, booking_id=booking_id, force_credit=data.get("forceCredit")
        )
        return Response(s.CancellationSerializer(dto).data)


class AdminPlansView(AdminAPIView):
    def get(self, request):
        plans = ListPlansAdminUseCase().execute(actor=request.user)
        return Response(s.PlanSerializer(plans, many=True).data)

    def post(self, request):
        data = _validated(s.CreatePlanInputSerializer, request)
        plan = CreatePlanUseCase().execute(actor=request.user, data=data)
        return Response(s.PlanSerializer(plan).data, status=status.HTTP_201_CREATED)


class AdminPlanDetailView(AdminAPIView):
    def patch(self, request, plan_id):
        data = _validated(s.UpdatePlanInputSerializer, request)
        plan = UpdatePlanUseCase().execute(actor=request.user, plan_id=plan_id, data=data)
        return Response(s.PlanSerializer(plan).data)


class AdminBookingsListView(AdminAPIView):
    def get(self, request):
        dtos = ListAdminBookingsUseCase().execute(actor=request.user)
        return Response(s.AdminBookingItemSerializer(dtos, many=True).data)


class AdminBookingUpdateView(AdminAPIView):
    def patch(self, request, booking_id):
        # The supported admin update is a cancellation (with an optional credit override).
        data = _validated(s.AdminBookingUpdateInputSerializer, request)
        dto = CancelBookingUseCase().execute(
            actor=request.user, booking_id=booking_id, force_credit=data.get("forceCredit")
        )
        return Response(s.CancellationSerializer(dto).data)


# ── Sessions ──────────────────────────────────────────────────────────────────
class SessionDetailView(APIView):
    def get(self, request, session_id):
        dto = GetSessionDetailUseCase().execute(actor=request.user, session_id=session_id)
        return Response(s.SessionDetailSerializer(dto).data)


class SessionWaitingRoomView(APIView):
    def get(self, request, session_id):
        dto = GetSessionUseCase().execute(actor=request.user, session_id=session_id)
        return Response(s.WaitingRoomSerializer(dto).data)


class SessionJoinView(APIView):
    def post(self, request, session_id):
        dto = JoinSessionUseCase().execute(actor=request.user, session_id=session_id)
        return Response(s.VideoJoinSerializer(dto).data)


class SessionLeaveView(APIView):
    def post(self, request, session_id):
        dto = LeaveSessionUseCase().execute(actor=request.user, session_id=session_id)
        return Response(s.SessionResultSerializer(dto).data)


class SessionStartView(APIView):
    def post(self, request, session_id):
        dto = StartSessionUseCase().execute(actor=request.user, session_id=session_id)
        return Response(s.SessionResultSerializer(dto).data)


class SessionEndView(APIView):
    def post(self, request, session_id):
        dto = CompleteSessionUseCase().execute(actor=request.user, session_id=session_id)
        return Response(s.SessionResultSerializer(dto).data)


class SessionTranscriptView(APIView):
    def post(self, request, session_id):
        data = _validated(s.AttachTranscriptInputSerializer, request)
        dto = AttachTranscriptUseCase().execute(
            actor=request.user,
            session_id=session_id,
            content=data["content"],
            source=data["source"],
        )
        return Response(s.TranscriptSerializer(dto).data, status=status.HTTP_201_CREATED)


# ── AI Reports ────────────────────────────────────────────────────────────────
class AIReportDetailView(APIView):
    def get(self, request, report_id):
        dto = GetAIReportDetailUseCase().execute(actor=request.user, report_id=report_id)
        return Response(s.AIReportDetailSerializer(dto).data)


class SessionReportGenerateView(APIView):
    """Sprint 9 — generate the AI session report from server-side artifacts.
    Generate-once + idempotent; the finalized transcript is read server-side (never
    supplied by the client)."""

    def post(self, request, session_id):
        dto = GenerateAISessionReportUseCase().execute(actor=request.user, session_id=session_id)
        return Response(s.AIReportAckSerializer(dto).data, status=status.HTTP_201_CREATED)


class SessionNotesView(APIView):
    """Instructor saves structured post-session notes."""

    def post(self, request, session_id):
        data = _validated(s.SessionNotesInputSerializer, request)
        result = SaveSessionNotesUseCase().execute(actor=request.user, session_id=session_id, notes=data)
        return Response(result)


class SessionReportAcceptView(APIView):
    """Instructor accepts the AI report as reviewed."""

    def post(self, request, session_id):
        result = AcceptReportUseCase().execute(
            actor=request.user, session_id=session_id, note=request.data.get("note", "")
        )
        return Response(result)


class SessionReportRegenerateView(APIView):
    """The session's instructor (or admin) regenerates the AI report."""

    def post(self, request, session_id):
        dto = GenerateAISessionReportUseCase().execute(
            actor=request.user, session_id=session_id, regenerate=True
        )
        return Response(s.AIReportAckSerializer(dto).data, status=status.HTTP_201_CREATED)


class AdminSessionReportRegenerateView(AdminAPIView):
    """Explicit admin-only regeneration of a session report."""

    def post(self, request, session_id):
        dto = GenerateAISessionReportUseCase().execute(
            actor=request.user, session_id=session_id, regenerate=True
        )
        return Response(s.AIReportAckSerializer(dto).data, status=status.HTTP_201_CREATED)


# ── Notifications ─────────────────────────────────────────────────────────────
class NotificationListView(APIView):
    def get(self, request):
        dtos = ListNotificationsUseCase().execute(actor=request.user)
        return Response(s.NotificationSerializer(dtos, many=True).data)


class NotificationReadView(APIView):
    def post(self, request, notification_id):
        dto = MarkNotificationReadUseCase().execute(
            actor=request.user, notification_id=notification_id
        )
        return Response(s.NotificationSerializer(dto).data)


# ── Billing: submit payment proof (multipart) ─────────────────────────────────
class SubmitPaymentProofView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        data = _validated(s.SubmitPaymentProofInputSerializer, request)
        receipt = data["receipt"]
        dto = SubmitPaymentProofUseCase().execute(
            actor=request.user,
            plan_id=data["planId"],
            transaction_number=data["transactionNumber"],
            transfer_datetime=data["transferDatetime"],
            amount=data["amount"],
            receipt_filename=receipt.name,
            receipt_content_type=getattr(receipt, "content_type", "application/octet-stream"),
            receipt_data=receipt.read(),
            sender_name=data.get("senderName"),
            receiver_name=data.get("receiverName"),
            raw_ocr_data=data.get("rawOcrData"),
        )
        return Response(s.PaymentProofDetailSerializer(dto).data, status=status.HTTP_201_CREATED)


# ── Instructor authoring ──────────────────────────────────────────────────────
class InstructorTopicCreateView(APIView):
    def post(self, request):
        data = _validated(s.CreateTopicInputSerializer, request)
        dto = CreateTopicUseCase().execute(
            actor=request.user,
            title=data["title"],
            category=data["category"],
            level=data["level"],
            description=data.get("description"),
            icon=data.get("icon"),
            accent=data.get("accent"),
            vocabulary=data.get("vocabulary"),
            sample_prompts=data.get("samplePrompts"),
        )
        return Response(s.TopicFullSerializer(dto).data, status=status.HTTP_201_CREATED)


class InstructorTopicUpdateView(APIView):
    def put(self, request, topic_id):
        data = _validated(s.UpdateTopicInputSerializer, request)
        dto = UpdateTopicUseCase().execute(
            actor=request.user,
            topic_id=topic_id,
            title=data.get("title"),
            category=data.get("category"),
            level=data.get("level"),
            description=data.get("description"),
            icon=data.get("icon"),
            accent=data.get("accent"),
            vocabulary=data.get("vocabulary"),
            sample_prompts=data.get("samplePrompts"),
        )
        return Response(s.TopicFullSerializer(dto).data)

    patch = put  # accept PATCH too (all fields are optional — partial update)


class InstructorTopicPublishView(APIView):
    def post(self, request, topic_id):
        dto = PublishTopicUseCase().execute(actor=request.user, topic_id=topic_id)
        return Response(s.TopicFullSerializer(dto).data)


class InstructorAddQuestionView(APIView):
    def post(self, request, topic_id):
        data = _validated(s.AddQuestionInputSerializer, request)
        dto = AddManualQuestionUseCase().execute(
            actor=request.user, topic_id=topic_id, text=data["text"]
        )
        return Response(s.QuestionFullSerializer(dto).data, status=status.HTTP_201_CREATED)


class InstructorApproveQuestionView(APIView):
    def post(self, request, topic_id, question_id):
        dto = ApproveAIQuestionUseCase().execute(actor=request.user, question_id=question_id)
        return Response(s.QuestionFullSerializer(dto).data)


class InstructorSetAvailabilityView(APIView):
    def put(self, request):
        data = _validated(s.SetAvailabilityInputSerializer, request)
        slots = [
            {"start_at": sl["startAt"], "duration_minutes": sl["durationMinutes"]}
            for sl in data["slots"]
        ]
        dtos = SetAvailabilityUseCase().execute(actor=request.user, slots=slots)
        return Response(s.InstructorSlotSerializer(dtos, many=True).data)


class InstructorRecurringAvailabilityView(APIView):
    """The instructor's recurring weekly availability windows (the times within
    which students may build their own schedule). GET lists; PUT replaces."""

    def get(self, request):
        return Response(GetRecurringAvailabilityUseCase().execute(actor=request.user))

    def put(self, request):
        data = _validated(s.SetRecurringAvailabilityInputSerializer, request)
        windows = [
            {
                "weekday": w["weekday"],
                "start_time": w["startTime"],
                "end_time": w["endTime"],
            }
            for w in data["windows"]
        ]
        result = SetRecurringAvailabilityUseCase().execute(actor=request.user, windows=windows)
        return Response(result)


class InstructorBookingsView(APIView):
    """The instructor's own bookings (for cancel/reschedule)."""

    def get(self, request):
        items = ListInstructorBookingsUseCase().execute(actor=request.user)
        return Response(s.BookingListItemSerializer(items, many=True).data)


class InstructorStudentsView(APIView):
    """Distinct students the instructor has taught."""

    def get(self, request):
        return Response(ListInstructorStudentsUseCase().execute(actor=request.user))


class InstructorStudentDetailView(APIView):
    """Per-student prep view (level, goal, sessions, reports)."""

    def get(self, request, student_id):
        return Response(GetInstructorStudentUseCase().execute(actor=request.user, student_id=student_id))


class InstructorBookingCancelView(APIView):
    def post(self, request, booking_id):
        result = CancelBookingUseCase().execute(actor=request.user, booking_id=booking_id)
        return Response(s.CancellationSerializer(result).data)


class InstructorBookingRescheduleView(APIView):
    def post(self, request, booking_id):
        data = _validated(s.RescheduleInputSerializer, request)
        result = RescheduleBookingUseCase().execute(
            actor=request.user, booking_id=booking_id, new_slot_id=data["newSlotId"]
        )
        return Response(result)


class InstructorAvailabilityExceptionsView(APIView):
    """Instructor's availability exceptions — vacation / holiday / block time."""

    def get(self, request):
        items = ListAvailabilityExceptionsUseCase().execute(actor=request.user)
        return Response(s.AvailabilityExceptionSerializer(items, many=True).data)

    def post(self, request):
        data = _validated(s.AddAvailabilityExceptionInputSerializer, request)
        exc = AddAvailabilityExceptionUseCase().execute(
            actor=request.user,
            kind=data["kind"],
            start_at=data["startAt"],
            end_at=data["endAt"],
            note=data.get("note", ""),
        )
        return Response(s.AvailabilityExceptionSerializer(exc).data, status=status.HTTP_201_CREATED)


class InstructorAvailabilityExceptionDetailView(APIView):
    def delete(self, request, exception_id):
        result = RemoveAvailabilityExceptionUseCase().execute(actor=request.user, exception_id=exception_id)
        return Response(result)


# ── AI Reports: read by session (202 if pending) ──────────────────────────────
class SessionReportView(APIView):
    def get(self, request, session_id):
        dto = GetSessionReportUseCase().execute(actor=request.user, session_id=session_id)
        http_status = (
            status.HTTP_202_ACCEPTED
            if dto.status == AIReportStatus.PENDING
            else status.HTTP_200_OK
        )
        return Response(s.AIReportDetailSerializer(dto).data, status=http_status)
