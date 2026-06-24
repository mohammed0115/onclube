import { Routes, Route, Navigate } from "react-router";

// Public
import { LandingPage } from "@/pages/public/LandingPage";
import { RegisterPage } from "@/pages/public/RegisterPage";
import { LoginPage } from "@/pages/public/LoginPage";

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
import { QuestionsPreviewPage } from "@/pages/student/QuestionsPreviewPage";
import { LiveSessionPage } from "@/pages/student/LiveSessionPage";
import { AIReportPage } from "@/pages/student/AIReportPage";

// Instructor
import { InstructorDashboardPage } from "@/pages/instructor/InstructorDashboardPage";
import { AvailabilityPage } from "@/pages/instructor/AvailabilityPage";
import { TopicQuestionBuilderPage } from "@/pages/instructor/TopicQuestionBuilderPage";

// Admin
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { PaymentApprovalPage } from "@/pages/admin/PaymentApprovalPage";

export function AppRoutes() {
  return (
    <Routes>
      {/* 01–03 Public */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* 04–06 Onboarding */}
      <Route path="/onboarding/goal" element={<GoalSelectionPage />} />
      <Route path="/onboarding/placement-test" element={<PlacementTestPage />} />
      <Route path="/onboarding/placement-result" element={<PlacementResultPage />} />

      {/* 07–10 Billing */}
      <Route path="/billing/pricing" element={<PricingPage />} />
      <Route path="/billing/bank-transfer" element={<BankTransferPage />} />
      <Route path="/billing/payment-proof" element={<PaymentProofPage />} />
      <Route path="/billing/under-review" element={<PaymentUnderReviewPage />} />

      {/* 11–15 Student */}
      <Route path="/student" element={<StudentDashboardPage />} />
      <Route path="/student/book" element={<BookSessionPage />} />
      <Route path="/student/questions/:id" element={<QuestionsPreviewPage />} />
      <Route path="/student/session/:id" element={<LiveSessionPage />} />
      <Route path="/student/report/:id" element={<AIReportPage />} />

      {/* 16–18 Instructor */}
      <Route path="/instructor" element={<InstructorDashboardPage />} />
      <Route path="/instructor/availability" element={<AvailabilityPage />} />
      <Route path="/instructor/topics" element={<TopicQuestionBuilderPage />} />

      {/* 19–20 Admin */}
      <Route path="/admin" element={<AdminDashboardPage />} />
      <Route path="/admin/payments" element={<PaymentApprovalPage />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
