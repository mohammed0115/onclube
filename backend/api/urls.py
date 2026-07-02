"""API v1 routing — grouped by the endpoint plan."""
from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from api import views as v

urlpatterns = [
    # ── Auth / Profile ──
    path("auth/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/register/", v.RegisterView.as_view()),
    path("me/", v.MeView.as_view(), name="me"),
    path("me/goal/", v.MeGoalView.as_view()),

    # ── Onboarding / Goals ──
    path("onboarding/goals/", v.GoalListView.as_view()),

    # ── Placement (Phase 8E — AI-led written + spoken) ──
    path("placement/test/", v.PlacementTestView.as_view()),
    path("placement/interview/", v.PlacementInterviewView.as_view()),
    path("placement/interview/session/", v.InterviewSessionView.as_view()),
    path("placement/interview/answer/", v.InterviewAnswerView.as_view()),
    path("placement/interview/finalize/", v.InterviewFinalizeView.as_view()),
    path("placement/start/", v.PlacementStartView.as_view()),
    path("placement/written-answers/", v.PlacementWrittenAnswersView.as_view()),
    path("placement/spoken-transcripts/", v.PlacementSpokenTranscriptsView.as_view()),
    path("placement/submit/", v.PlacementSubmitView.as_view()),
    path("placement/result/", v.PlacementResultView.as_view()),
    path("placement/status/", v.PlacementStatusView.as_view()),
    path("admin/placement/<uuid:student_id>/reset-spoken/", v.AdminPlacementResetSpokenView.as_view()),

    # ── Billing ──
    path("billing/plans/", v.PlanListView.as_view()),
    path("billing/providers/", v.PaymentProvidersView.as_view()),
    path("billing/bank-account/", v.BankAccountView.as_view()),
    # Backward-compatible alias of bank-account (subset shape).
    path("billing/payment-instructions/", v.PaymentInstructionsView.as_view()),
    path("billing/payment-proof/", v.SubmitPaymentProofView.as_view()),
    path("student/subscription/", v.StudentSubscriptionView.as_view()),
    path("student/billing/history/", v.StudentBillingHistoryView.as_view()),

    # ── Student Scheduling ──
    path("student/dashboard/", v.StudentDashboardView.as_view()),
    path("student/topics/", v.StudentTopicListView.as_view()),
    path("student/topics/<uuid:topic_id>/", v.StudentTopicDetailView.as_view()),
    path("student/topics/<uuid:topic_id>/questions/", v.StudentTopicQuestionsView.as_view()),
    path("instructors/<uuid:instructor_id>/availability/", v.InstructorOpenSlotsView.as_view()),
    path("student/bookings/", v.StudentBookingsView.as_view()),
    path("student/bookings/<uuid:booking_id>/", v.StudentBookingDetailView.as_view()),

    # ── Instructor ──
    path("instructor/dashboard/", v.InstructorDashboardView.as_view()),
    path("instructor/topics/", v.InstructorTopicListView.as_view()),
    path("instructor/topics/create/", v.InstructorTopicCreateView.as_view()),
    path("instructor/topics/<uuid:topic_id>/", v.InstructorTopicUpdateView.as_view()),
    path("instructor/topics/<uuid:topic_id>/publish/", v.InstructorTopicPublishView.as_view()),
    path("instructor/topics/<uuid:topic_id>/questions/", v.InstructorAddQuestionView.as_view()),
    path("instructor/topics/<uuid:topic_id>/questions/<uuid:question_id>/approve/", v.InstructorApproveQuestionView.as_view()),
    path("instructor/availability/", v.InstructorAvailabilityView.as_view()),
    path("instructor/availability/set/", v.InstructorSetAvailabilityView.as_view()),
    path("instructor/topics/<uuid:topic_id>/suggest-subtopics/", v.InstructorSuggestSubtopicsView.as_view()),
    path("instructor/topics/<uuid:topic_id>/suggest-questions/", v.InstructorSuggestQuestionsView.as_view()),

    # ── Admin ──
    path("admin/dashboard/", v.AdminDashboardView.as_view()),
    path("admin/payment-proofs/", v.AdminPaymentProofListView.as_view()),
    path("admin/payment-proofs/<uuid:proof_id>/approve/", v.AdminApprovePaymentView.as_view()),
    path("admin/payment-proofs/<uuid:proof_id>/reject/", v.AdminRejectPaymentView.as_view()),
    path("admin/payment-proofs/<uuid:proof_id>/reopen/", v.AdminReopenPaymentView.as_view()),
    path("admin/subscriptions/<uuid:subscription_id>/extend/", v.AdminExtendSubscriptionView.as_view()),
    path("admin/subscriptions/<uuid:subscription_id>/topup/", v.AdminTopUpSubscriptionView.as_view()),
    path("admin/subscriptions/<uuid:subscription_id>/refund-note/", v.AdminRefundNoteView.as_view()),
    path("admin/bookings/<uuid:booking_id>/cancel/", v.AdminCancelBookingView.as_view()),

    # ── Sessions ──
    path("sessions/<uuid:session_id>/", v.SessionDetailView.as_view()),
    path("sessions/<uuid:session_id>/join/", v.SessionJoinView.as_view()),
    path("sessions/<uuid:session_id>/start/", v.SessionStartView.as_view()),
    path("sessions/<uuid:session_id>/end/", v.SessionEndView.as_view()),
    path("sessions/<uuid:session_id>/transcript/", v.SessionTranscriptView.as_view()),

    # ── AI Reports ──
    path("reports/<uuid:report_id>/", v.AIReportDetailView.as_view()),
    path("sessions/<uuid:session_id>/report/", v.SessionReportView.as_view()),
    path("sessions/<uuid:session_id>/report/generate/", v.SessionReportGenerateView.as_view()),

    # ── Notifications ──
    path("notifications/", v.NotificationListView.as_view()),
    path("notifications/<uuid:notification_id>/read/", v.NotificationReadView.as_view()),
]
