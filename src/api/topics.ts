import { api } from "./client";
import type {
  AdminBookingItem,
  AdminDashboard,
  AdminSession,
  AdminUser,
  AuditEntry,
  BusinessOverview,
  PlatformStatus,
  AvailabilityException,
  AvailabilitySlot,
  BookingListItem,
  Cancellation,
  GoalOption,
  InstructorDashboard,
  InstructorProfile,
  InstructorStudentDetail,
  InstructorStudentSummary,
  PaymentApprovalItem,
  PaymentApprovalResult,
  PaymentDecision,
  PaymentProofDetail,
  Plan,
  CreatePlanInput,
  QuestionFull,
  TopicFull,
  TopicPreview,
} from "./types";

// Topics, goals, instructor authoring, and admin operations.
export const topicsApi = {
  goals(): Promise<GoalOption[]> {
    return api.get<GoalOption[]>("/onboarding/goals/", { auth: false });
  },

  // Student-facing topic browse.
  studentTopics(category?: string): Promise<TopicPreview[]> {
    const q = category ? `?category=${encodeURIComponent(category)}` : "";
    return api.get<TopicPreview[]>(`/student/topics/${q}`);
  },

  practice(): Promise<{ vocabulary: string[]; phrases: string[] }> {
    return api.get("/student/practice/");
  },

  /** Preview before a confirmed booking; full (with questions) after. */
  studentTopic(id: string): Promise<TopicPreview | TopicFull> {
    return api.get<TopicPreview | TopicFull>(`/student/topics/${id}/`);
  },

  studentTopicQuestions(id: string): Promise<QuestionFull[]> {
    return api.get<QuestionFull[]>(`/student/topics/${id}/questions/`);
  },

  // Instructor.
  instructorDashboard(): Promise<InstructorDashboard> {
    return api.get<InstructorDashboard>("/instructor/dashboard/");
  },
  instructorProfile(): Promise<InstructorProfile> {
    return api.get<InstructorProfile>("/instructor/profile/");
  },
  updateInstructorProfile(patch: Partial<InstructorProfile>): Promise<InstructorProfile> {
    return api.patch<InstructorProfile>("/instructor/profile/", patch);
  },
  instructorTopics(): Promise<TopicFull[]> {
    return api.get<TopicFull[]>("/instructor/topics/");
  },
  createTopic(input: { title: string; category: string; level: string; description?: string }): Promise<TopicFull> {
    return api.post<TopicFull>("/instructor/topics/create/", input);
  },
  updateTopic(topicId: string, patch: { title?: string; category?: string; level?: string; description?: string }): Promise<TopicFull> {
    return api.patch<TopicFull>(`/instructor/topics/${topicId}/`, patch);
  },
  suggestSubtopics(topicId: string): Promise<{ topicId: string; items: string[]; createdIds: string[] }> {
    return api.post(`/instructor/topics/${topicId}/suggest-subtopics/`, {});
  },
  suggestQuestions(topicId: string): Promise<{ topicId: string; items: string[]; createdIds: string[] }> {
    return api.post(`/instructor/topics/${topicId}/suggest-questions/`, {});
  },
  addTopicQuestion(topicId: string, text: string): Promise<QuestionFull> {
    return api.post<QuestionFull>(`/instructor/topics/${topicId}/questions/`, { text });
  },
  approveTopicQuestion(topicId: string, questionId: string): Promise<QuestionFull> {
    return api.post<QuestionFull>(`/instructor/topics/${topicId}/questions/${questionId}/approve/`, {});
  },
  publishTopic(topicId: string): Promise<TopicFull> {
    return api.post<TopicFull>(`/instructor/topics/${topicId}/publish/`, {});
  },
  instructorAvailability(): Promise<AvailabilitySlot[]> {
    return api.get<AvailabilitySlot[]>("/instructor/availability/");
  },
  setAvailability(slots: { startAt: string; durationMinutes?: number }[]): Promise<AvailabilitySlot[]> {
    return api.put<AvailabilitySlot[]>("/instructor/availability/set/", { slots });
  },
  instructorBookings(): Promise<BookingListItem[]> {
    return api.get<BookingListItem[]>("/instructor/bookings/");
  },
  instructorStudents(): Promise<InstructorStudentSummary[]> {
    return api.get<InstructorStudentSummary[]>("/instructor/students/");
  },
  instructorStudent(id: string): Promise<InstructorStudentDetail> {
    return api.get<InstructorStudentDetail>(`/instructor/students/${id}/`);
  },
  cancelInstructorBooking(id: string): Promise<{ bookingId: string; status: string }> {
    return api.post(`/instructor/bookings/${id}/cancel/`, {});
  },
  rescheduleInstructorBooking(id: string, newSlotId: string): Promise<{ bookingId: string; scheduledAt: string }> {
    return api.post(`/instructor/bookings/${id}/reschedule/`, { newSlotId });
  },
  availabilityExceptions(): Promise<AvailabilityException[]> {
    return api.get<AvailabilityException[]>("/instructor/availability/exceptions/");
  },
  addAvailabilityException(input: { kind: string; startAt: string; endAt: string; note?: string }): Promise<AvailabilityException> {
    return api.post<AvailabilityException>("/instructor/availability/exceptions/", input);
  },
  removeAvailabilityException(id: string): Promise<{ removed: string }> {
    return api.del(`/instructor/availability/exceptions/${id}/`);
  },

  // Admin.
  adminDashboard(): Promise<AdminDashboard> {
    return api.get<AdminDashboard>("/admin/dashboard/");
  },
  adminUsers(role?: string): Promise<AdminUser[]> {
    return api.get<AdminUser[]>(`/admin/users/${role ? `?role=${role}` : ""}`);
  },
  setUserStatus(id: string, status: "active" | "suspended"): Promise<{ userId: string; status: string }> {
    return api.post(`/admin/users/${id}/status/`, { status });
  },
  changeUserRole(id: string, role: string): Promise<{ userId: string; role: string }> {
    return api.post(`/admin/users/${id}/role/`, { role });
  },
  auditLog(): Promise<AuditEntry[]> {
    return api.get<AuditEntry[]>("/admin/audit/");
  },
  adminSessions(): Promise<AdminSession[]> {
    return api.get<AdminSession[]>("/admin/sessions/");
  },
  adminBusiness(): Promise<BusinessOverview> {
    return api.get<BusinessOverview>("/admin/business/");
  },
  adminPlatform(): Promise<PlatformStatus> {
    return api.get<PlatformStatus>("/admin/platform/");
  },
  adminPaymentProofs(): Promise<PaymentApprovalItem[]> {
    return api.get<PaymentApprovalItem[]>("/admin/payment-proofs/");
  },
  adminPaymentProofDetail(proofId: string): Promise<PaymentProofDetail> {
    return api.get<PaymentProofDetail>(`/admin/payment-proofs/${proofId}/`);
  },
  approvePayment(proofId: string): Promise<PaymentApprovalResult> {
    return api.post<PaymentApprovalResult>(`/admin/payment-proofs/${proofId}/approve/`);
  },
  rejectPayment(proofId: string, note?: string): Promise<PaymentDecision> {
    return api.post<PaymentDecision>(`/admin/payment-proofs/${proofId}/reject/`, { note });
  },
  requestPaymentInfo(proofId: string, note: string): Promise<PaymentDecision> {
    return api.post<PaymentDecision>(`/admin/payment-proofs/${proofId}/request-info/`, { note });
  },
  reopenPayment(proofId: string): Promise<PaymentDecision> {
    return api.post<PaymentDecision>(`/admin/payment-proofs/${proofId}/reopen/`);
  },
  adminBookings(): Promise<AdminBookingItem[]> {
    return api.get<AdminBookingItem[]>("/admin/bookings/");
  },
  adminPlans(): Promise<Plan[]> {
    return api.get<Plan[]>("/admin/plans/");
  },
  adminCreatePlan(input: CreatePlanInput): Promise<Plan> {
    return api.post<Plan>("/admin/plans/", input);
  },
  adminUpdatePlan(planId: string, patch: Partial<CreatePlanInput>): Promise<Plan> {
    return api.patch<Plan>(`/admin/plans/${planId}/`, patch);
  },
  adminUpdateBooking(bookingId: string, body: { status: "cancelled"; forceCredit?: boolean }): Promise<Cancellation> {
    return api.patch<Cancellation>(`/admin/bookings/${bookingId}/`, body);
  },
};
