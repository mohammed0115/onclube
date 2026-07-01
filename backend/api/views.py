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

from apps.common.enums import AIReportStatus
from api import serializers as s

# Use cases — accounts / onboarding
from application.accounts.queries import GetCurrentUserProfileUseCase
from application.accounts.use_cases import (
    RegisterStudentUseCase,
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
    RecordRefundNoteUseCase,
    RejectPaymentProofUseCase,
    ReopenPaymentProofUseCase,
    SubmitPaymentProofUseCase,
    TopUpSubscriptionUseCase,
)

# Instructor authoring
from application.instructor.use_cases import (
    AddManualQuestionUseCase,
    ApproveAIQuestionUseCase,
    CreateTopicUseCase,
    PublishTopicUseCase,
    SetAvailabilityUseCase,
    UpdateTopicUseCase,
)

# Notifications (command)
from application.notifications.use_cases import MarkNotificationReadUseCase

# Scheduling
from application.scheduling.queries import (
    GetBookingDetailUseCase,
    GetInstructorDashboardUseCase,
    GetQuestionsForBookingUseCase,
    GetStudentDashboardUseCase,
    GetTopicPreviewOrFullUseCase,
    ListInstructorAvailabilityUseCase,
    ListInstructorTopicsUseCase,
    ListStudentAvailableTopicsUseCase,
    ListStudentBookingsUseCase,
)
from application.scheduling.use_cases import (
    CancelBookingUseCase,
    CreateBookingUseCase,
    ListAvailableSlotsUseCase,
)

# Sessions
from application.sessions.queries import GetSessionDetailUseCase
from application.sessions.use_cases import (
    AttachTranscriptUseCase,
    CompleteSessionUseCase,
    JoinSessionUseCase,
    StartSessionUseCase,
)

# AI reports
from application.ai_reports.queries import GetAIReportDetailUseCase, GetSessionReportUseCase
from application.ai_reports.use_cases import (
    GenerateDiscussionQuestionsUseCase,
    GenerateSessionReportUseCase,
    GenerateTopicSubtopicsUseCase,
)

# Admin / notifications
from application.admin_ops.queries import (
    GetAdminDashboardUseCase,
    ListAdminPaymentApprovalsUseCase,
)
from application.notifications.queries import ListNotificationsUseCase


def _validated(serializer_cls, request):
    serializer = serializer_cls(data=request.data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


# ── Auth / Profile ────────────────────────────────────────────────────────────
class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        data = _validated(s.RegisterInputSerializer, request)
        dto = RegisterStudentUseCase().execute(
            full_name=data["fullName"], email=data["email"], password=data["password"]
        )
        return Response(s.UserProfileSerializer(dto).data, status=status.HTTP_201_CREATED)


class MeView(APIView):
    def get(self, request):
        dto = GetCurrentUserProfileUseCase().execute(actor=request.user)
        return Response(s.UserProfileSerializer(dto).data)

    def patch(self, request):
        data = _validated(s.UpdateProfileInputSerializer, request)
        dto = UpdateCurrentProfileUseCase().execute(actor=request.user, full_name=data["fullName"])
        return Response(s.UserProfileSerializer(dto).data)


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


class PlacementStatusView(APIView):
    def get(self, request):
        dto = GetPlacementAttemptStatusUseCase().execute(actor=request.user)
        return Response(s.PlacementAttemptStatusSerializer(dto).data)


class AdminPlacementResetSpokenView(APIView):
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
class AdminDashboardView(APIView):
    def get(self, request):
        dto = GetAdminDashboardUseCase().execute(actor=request.user)
        return Response(s.AdminDashboardSerializer(dto).data)


class AdminPaymentProofListView(APIView):
    def get(self, request):
        dtos = ListAdminPaymentApprovalsUseCase().execute(actor=request.user)
        return Response(s.PaymentApprovalItemSerializer(dtos, many=True).data)


class AdminApprovePaymentView(APIView):
    def post(self, request, proof_id):
        dto = ApprovePaymentProofUseCase().execute(actor=request.user, proof_id=proof_id)
        return Response(s.PaymentApprovalResultSerializer(dto).data)


class AdminRejectPaymentView(APIView):
    def post(self, request, proof_id):
        data = _validated(s.ReviewNoteInputSerializer, request)
        dto = RejectPaymentProofUseCase().execute(
            actor=request.user, proof_id=proof_id, note=data.get("note")
        )
        return Response(s.PaymentDecisionSerializer(dto).data)


class AdminReopenPaymentView(APIView):
    def post(self, request, proof_id):
        dto = ReopenPaymentProofUseCase().execute(actor=request.user, proof_id=proof_id)
        return Response(s.PaymentDecisionSerializer(dto).data)


class AdminExtendSubscriptionView(APIView):
    def patch(self, request, subscription_id):
        data = _validated(s.ExtendSubscriptionInputSerializer, request)
        dto = ExtendSubscriptionUseCase().execute(
            actor=request.user,
            subscription_id=subscription_id,
            new_expires_at=data["newExpiresAt"],
            reason=data.get("reason"),
        )
        return Response(s.SubscriptionResultSerializer(dto).data)


class AdminTopUpSubscriptionView(APIView):
    def patch(self, request, subscription_id):
        data = _validated(s.TopUpInputSerializer, request)
        dto = TopUpSubscriptionUseCase().execute(
            actor=request.user,
            subscription_id=subscription_id,
            sessions=data["sessions"],
            reason=data.get("reason"),
        )
        return Response(s.SubscriptionResultSerializer(dto).data)


class AdminRefundNoteView(APIView):
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


class AdminCancelBookingView(APIView):
    def post(self, request, booking_id):
        data = _validated(s.AdminCancelInputSerializer, request)
        dto = CancelBookingUseCase().execute(
            actor=request.user, booking_id=booking_id, force_credit=data.get("forceCredit")
        )
        return Response(s.CancellationSerializer(dto).data)


# ── Sessions ──────────────────────────────────────────────────────────────────
class SessionDetailView(APIView):
    def get(self, request, session_id):
        dto = GetSessionDetailUseCase().execute(actor=request.user, session_id=session_id)
        return Response(s.SessionDetailSerializer(dto).data)


class SessionJoinView(APIView):
    def post(self, request, session_id):
        dto = JoinSessionUseCase().execute(actor=request.user, session_id=session_id)
        return Response(s.VideoJoinSerializer(dto).data)


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
    def post(self, request, session_id):
        data = _validated(s.GenerateReportInputSerializer, request)
        dto = GenerateSessionReportUseCase().execute(
            actor=request.user, session_id=session_id, transcript=data.get("transcript")
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
