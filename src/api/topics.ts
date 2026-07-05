import { api } from "./client";
import type {
  AdminBookingItem,
  AdminDashboard,
  AvailabilitySlot,
  Cancellation,
  GoalOption,
  InstructorDashboard,
  PaymentApprovalItem,
  PaymentApprovalResult,
  PaymentDecision,
  PaymentProofDetail,
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
  instructorTopics(): Promise<TopicFull[]> {
    return api.get<TopicFull[]>("/instructor/topics/");
  },
  instructorAvailability(): Promise<AvailabilitySlot[]> {
    return api.get<AvailabilitySlot[]>("/instructor/availability/");
  },
  setAvailability(slots: { startAt: string; durationMinutes?: number }[]): Promise<AvailabilitySlot[]> {
    return api.put<AvailabilitySlot[]>("/instructor/availability/set/", { slots });
  },

  // Admin.
  adminDashboard(): Promise<AdminDashboard> {
    return api.get<AdminDashboard>("/admin/dashboard/");
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
  adminUpdateBooking(bookingId: string, body: { status: "cancelled"; forceCredit?: boolean }): Promise<Cancellation> {
    return api.patch<Cancellation>(`/admin/bookings/${bookingId}/`, body);
  },
};
