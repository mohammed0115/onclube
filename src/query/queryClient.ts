import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api";

/**
 * Shared query client. Auth (401) is handled by the API client's transparent
 * refresh, so we don't retry 4xx here — only genuine network/5xx blips.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

// Centralized query keys (stable cache identity + targeted invalidation).
export const qk = {
  me: ["me"] as const,
  goals: ["goals"] as const,
  plans: ["plans"] as const,
  bankAccount: ["billing", "bank-account"] as const,
  paymentProviders: ["billing", "providers"] as const,
  placementTest: ["placement", "test"] as const,
  placementInterview: ["placement", "interview"] as const,
  placementInterviewSession: ["placement", "interview", "session"] as const,
  placementStatus: ["placement", "status"] as const,
  placementResult: ["placement", "result"] as const,
  placementReview: ["placement", "result", "review"] as const,
  subscription: ["billing", "subscription"] as const,
  billingHistory: ["billing", "history"] as const,
  latestPaymentProof: ["billing", "latest-proof"] as const,
  studentDashboard: ["student", "dashboard"] as const,
  practice: ["student", "practice"] as const,
  community: ["student", "community"] as const,
  studentTopics: (category?: string) => ["student", "topics", category ?? "all"] as const,
  studentTopic: (id: string) => ["student", "topic", id] as const,
  topicQuestions: (id: string) => ["student", "topic", id, "questions"] as const,
  bookings: ["student", "bookings"] as const,
  booking: (id: string) => ["student", "booking", id] as const,
  openSlots: (instructorId: string) => ["instructor", instructorId, "slots"] as const,
  calendar: (topicId: string, weekStart?: string) => ["student", "calendar", topicId, weekStart ?? "current"] as const,
  studentSchedule: ["student", "schedule"] as const,
  scheduleWindows: (key: string) => ["student", "schedule", "windows", key] as const,
  studentProgress: ["student", "progress"] as const,
  studentPlan: ["student", "plan"] as const,
  aiTutorStatus: ["student", "ai-tutor", "status"] as const,
  publicInstructors: ["instructors", "public"] as const,
  publicInstructor: (slug: string) => ["instructors", "public", slug] as const,
  ownPublicProfile: ["instructor", "public-profile"] as const,
  adminBookings: ["admin", "bookings"] as const,
  adminPlans: ["admin", "plans"] as const,
  instructorDashboard: ["instructor", "dashboard"] as const,
  instructorProfile: ["instructor", "profile"] as const,
  instructorTopics: ["instructor", "topics"] as const,
  instructorAvailability: ["instructor", "availability"] as const,
  instructorBookings: ["instructor", "bookings"] as const,
  instructorStudents: ["instructor", "students"] as const,
  instructorStudent: (id: string) => ["instructor", "student", id] as const,
  availabilityExceptions: ["instructor", "availability", "exceptions"] as const,
  adminDashboard: ["admin", "dashboard"] as const,
  adminUsers: (role?: string) => ["admin", "users", role ?? "all"] as const,
  auditLog: ["admin", "audit"] as const,
  adminSessions: ["admin", "sessions"] as const,
  adminBusiness: ["admin", "business"] as const,
  adminPlatform: ["admin", "platform"] as const,
  adminProofs: ["admin", "proofs"] as const,
  adminProofDetail: (id: string) => ["admin", "proofs", id] as const,
  session: (id: string) => ["session", id] as const,
  waitingRoom: (id: string) => ["session", id, "waiting-room"] as const,
  reportById: (id: string) => ["report", id] as const,
  sessionReport: (id: string) => ["session", id, "report"] as const,
  notifications: ["notifications"] as const,
};
