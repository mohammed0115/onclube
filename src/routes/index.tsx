import { Routes, Route, Navigate } from "react-router";
import { RequireRole } from "@/auth/guards";

// Public
import { LandingPage } from "@/pages/public/LandingPage";
import { RegisterPage } from "@/pages/public/RegisterPage";
import { LoginPage } from "@/pages/public/LoginPage";
import { ForgotPasswordPage } from "@/pages/public/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/public/ResetPasswordPage";

// Onboarding
import { GoalSelectionPage } from "@/pages/onboarding/GoalSelectionPage";
import { PlacementTestPage } from "@/pages/onboarding/PlacementTestPage";
import { PlacementResultPage } from "@/pages/onboarding/PlacementResultPage";

// Billing
import { PricingPage } from "@/pages/billing/PricingPage";
import { BankTransferPage } from "@/pages/billing/BankTransferPage";
import { PaymentProofPage } from "@/pages/billing/PaymentProofPage";
import { PaymentUnderReviewPage } from "@/pages/billing/PaymentUnderReviewPage";

// Student
import { StudentDashboardPage } from "@/pages/student/StudentDashboardPage";
import { BookSessionPage } from "@/pages/student/BookSessionPage";
import { WeeklySchedulePage } from "@/pages/student/WeeklySchedulePage";
import { ProgressPage } from "@/pages/student/ProgressPage";
import { BookingCalendarPage } from "@/pages/student/BookingCalendarPage";
import { BookingSummaryPage } from "@/pages/student/BookingSummaryPage";
import { BookingSuccessPage } from "@/pages/student/BookingSuccessPage";
import { QuestionsPreviewPage } from "@/pages/student/QuestionsPreviewPage";
import { WaitingRoomPage } from "@/pages/student/WaitingRoomPage";
import { AIReportPage } from "@/pages/student/AIReportPage";
import { SessionReportsPage } from "@/pages/student/SessionReportsPage";
import { SettingsPage } from "@/pages/student/SettingsPage";
import { PracticePage } from "@/pages/student/PracticePage";
import { CommunityPage } from "@/pages/student/CommunityPage";

// Instructor
import { InstructorDashboardPage } from "@/pages/instructor/InstructorDashboardPage";
import { AvailabilityPage } from "@/pages/instructor/AvailabilityPage";
import { TopicQuestionBuilderPage } from "@/pages/instructor/TopicQuestionBuilderPage";
import { InstructorProfilePage } from "@/pages/instructor/InstructorProfilePage";
import { InstructorSessionsPage } from "@/pages/instructor/InstructorSessionsPage";
import { InstructorStudentsPage } from "@/pages/instructor/InstructorStudentsPage";
import { InstructorStudentDetailPage } from "@/pages/instructor/InstructorStudentDetailPage";

// Admin
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { PaymentApprovalPage } from "@/pages/admin/PaymentApprovalPage";
import { AdminMembersPage } from "@/pages/admin/AdminMembersPage";
import { AdminAuditPage } from "@/pages/admin/AdminAuditPage";
import { AdminSessionsPage } from "@/pages/admin/AdminSessionsPage";
import { AdminBookingsPage } from "@/pages/admin/AdminBookingsPage";
import { AdminPlansPage } from "@/pages/admin/AdminPlansPage";
import { AdminBusinessPage } from "@/pages/admin/AdminBusinessPage";
import { AdminPlatformPage } from "@/pages/admin/AdminPlatformPage";

export function AppRoutes() {
  return (
    <Routes>
      {/* 01–03 Public */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage mode="reset" />} />
      <Route path="/set-password" element={<ResetPasswordPage mode="set" />} />

      {/* 04–06 Onboarding (authenticated student) */}
      <Route path="/onboarding/goal" element={<RequireRole roles={["student"]}><GoalSelectionPage /></RequireRole>} />
      <Route path="/onboarding/placement-test" element={<RequireRole roles={["student"]}><PlacementTestPage /></RequireRole>} />
      <Route path="/onboarding/placement-result" element={<RequireRole roles={["student"]}><PlacementResultPage /></RequireRole>} />

      {/* 07–10 Billing (pricing is public; the rest require a student) */}
      <Route path="/billing/pricing" element={<PricingPage />} />
      <Route path="/billing/bank-transfer" element={<RequireRole roles={["student"]}><BankTransferPage /></RequireRole>} />
      <Route path="/billing/payment-proof" element={<RequireRole roles={["student"]}><PaymentProofPage /></RequireRole>} />
      <Route path="/billing/under-review" element={<RequireRole roles={["student"]}><PaymentUnderReviewPage /></RequireRole>} />

      {/* 11–15 Student */}
      <Route path="/student" element={<RequireRole roles={["student"]}><StudentDashboardPage /></RequireRole>} />
      <Route path="/student/book" element={<RequireRole roles={["student"]}><BookSessionPage /></RequireRole>} />
      <Route path="/student/schedule" element={<RequireRole roles={["student"]}><WeeklySchedulePage /></RequireRole>} />
      <Route path="/student/progress" element={<RequireRole roles={["student"]}><ProgressPage /></RequireRole>} />
      <Route path="/student/book/:topicId" element={<RequireRole roles={["student"]}><BookingCalendarPage /></RequireRole>} />
      <Route path="/student/book/:topicId/confirm/:slotId" element={<RequireRole roles={["student"]}><BookingSummaryPage /></RequireRole>} />
      <Route path="/student/book/success/:bookingId" element={<RequireRole roles={["student"]}><BookingSuccessPage /></RequireRole>} />
      <Route path="/student/questions/:id" element={<RequireRole roles={["student"]}><QuestionsPreviewPage /></RequireRole>} />
      {/* Session room is shared by the booked student and the assigned instructor. */}
      <Route path="/student/session/:id" element={<RequireRole roles={["student", "instructor"]}><WaitingRoomPage /></RequireRole>} />
      <Route path="/student/report/:id" element={<RequireRole roles={["student", "instructor", "admin"]}><AIReportPage /></RequireRole>} />
      <Route path="/student/reports" element={<RequireRole roles={["student"]}><SessionReportsPage /></RequireRole>} />
      <Route path="/student/practice" element={<RequireRole roles={["student"]}><PracticePage /></RequireRole>} />
      <Route path="/student/community" element={<RequireRole roles={["student"]}><CommunityPage /></RequireRole>} />
      <Route path="/student/settings" element={<RequireRole roles={["student"]}><SettingsPage /></RequireRole>} />

      {/* 16–18 Instructor */}
      <Route path="/instructor" element={<RequireRole roles={["instructor", "admin"]}><InstructorDashboardPage /></RequireRole>} />
      <Route path="/instructor/availability" element={<RequireRole roles={["instructor", "admin"]}><AvailabilityPage /></RequireRole>} />
      <Route path="/instructor/topics" element={<RequireRole roles={["instructor", "admin"]}><TopicQuestionBuilderPage /></RequireRole>} />
      <Route path="/instructor/profile" element={<RequireRole roles={["instructor", "admin"]}><InstructorProfilePage /></RequireRole>} />
      <Route path="/instructor/sessions" element={<RequireRole roles={["instructor", "admin"]}><InstructorSessionsPage /></RequireRole>} />
      <Route path="/instructor/students" element={<RequireRole roles={["instructor", "admin"]}><InstructorStudentsPage /></RequireRole>} />
      <Route path="/instructor/students/:id" element={<RequireRole roles={["instructor", "admin"]}><InstructorStudentDetailPage /></RequireRole>} />

      {/* 19–20 Admin */}
      <Route path="/admin" element={<RequireRole roles={["admin"]}><AdminDashboardPage /></RequireRole>} />
      <Route path="/admin/payments" element={<RequireRole roles={["admin"]}><PaymentApprovalPage /></RequireRole>} />
      <Route path="/admin/members" element={<RequireRole roles={["admin"]}><AdminMembersPage /></RequireRole>} />
      <Route path="/admin/sessions" element={<RequireRole roles={["admin"]}><AdminSessionsPage /></RequireRole>} />
      <Route path="/admin/bookings" element={<RequireRole roles={["admin"]}><AdminBookingsPage /></RequireRole>} />
      <Route path="/admin/plans" element={<RequireRole roles={["admin"]}><AdminPlansPage /></RequireRole>} />
      <Route path="/admin/business" element={<RequireRole roles={["admin"]}><AdminBusinessPage /></RequireRole>} />
      <Route path="/admin/platform" element={<RequireRole roles={["admin"]}><AdminPlatformPage /></RequireRole>} />
      <Route path="/admin/audit" element={<RequireRole roles={["admin"]}><AdminAuditPage /></RequireRole>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
