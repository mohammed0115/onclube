// React Query hooks — the only data-access surface pages use.
// Queries cache + retry per queryClient policy; mutations invalidate precisely.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/query/queryClient";
import {
  authApi,
  billingApi,
  bookingApi,
  notificationsApi,
  placementApi,
  reportsApi,
  sessionsApi,
  topicsApi,
} from "@/api";
import type { SubmitPaymentProofInput } from "@/api/billing";
import type {
  InterviewAnswerInput,
  PlacementSpokenTranscriptInput,
  PlacementWrittenAnswerInput,
} from "@/api/types";

// ── auth / profile ────────────────────────────────────────────────────────────
export const useMe = () => useQuery({ queryKey: qk.me, queryFn: authApi.me });

export function useSetGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (goalId: string) => authApi.setGoal(goalId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

// ── onboarding ──────────────────────────────────────────────────────────────
export const useGoals = () => useQuery({ queryKey: qk.goals, queryFn: topicsApi.goals });

// ── placement (Phase 8F) ──────────────────────────────────────────────────────
export const usePlacementTest = () =>
  useQuery({ queryKey: qk.placementTest, queryFn: placementApi.test });

export const useSpeakingInterview = () =>
  useQuery({ queryKey: qk.placementInterview, queryFn: placementApi.interview });

export const useInterviewSession = (enabled = true) =>
  useQuery({ queryKey: qk.placementInterviewSession, queryFn: placementApi.interviewSession, enabled });

export function useSaveInterviewAnswer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InterviewAnswerInput) => placementApi.saveInterviewAnswer(input),
    onSuccess: (session) => qc.setQueryData(qk.placementInterviewSession, session),
  });
}

export function useFinalizeInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => placementApi.finalizeInterview(),
    onSuccess: (session) => {
      qc.setQueryData(qk.placementInterviewSession, session);
      qc.invalidateQueries({ queryKey: qk.placementStatus });
    },
  });
}

export const usePlacementStatus = () =>
  useQuery({ queryKey: qk.placementStatus, queryFn: placementApi.status });

export const usePlacementResult = (enabled = true) =>
  useQuery({ queryKey: qk.placementResult, queryFn: placementApi.result, enabled });

export function useStartPlacementAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => placementApi.start(),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.placementStatus }),
  });
}

export function useSaveWrittenAnswers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ attemptId, answers }: { attemptId: string; answers: PlacementWrittenAnswerInput[] }) =>
      placementApi.saveWritten(attemptId, answers),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.placementStatus }),
  });
}

export function useSaveSpokenTranscripts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      attemptId,
      transcripts,
    }: {
      attemptId: string;
      transcripts: PlacementSpokenTranscriptInput[];
    }) => placementApi.saveSpoken(attemptId, transcripts),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.placementStatus }),
  });
}

export function useSubmitPlacement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => placementApi.submit(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.placementStatus });
      qc.invalidateQueries({ queryKey: qk.placementResult });
      qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

// ── billing ───────────────────────────────────────────────────────────────────
export const usePlans = () => useQuery({ queryKey: qk.plans, queryFn: billingApi.plans });

export const useBankAccount = () =>
  useQuery({ queryKey: qk.bankAccount, queryFn: billingApi.bankAccount });

export const usePaymentProviders = () =>
  useQuery({ queryKey: qk.paymentProviders, queryFn: billingApi.providers });

export const useSubscription = () =>
  useQuery({ queryKey: qk.subscription, queryFn: billingApi.currentSubscription });

export const useBillingHistory = () =>
  useQuery({ queryKey: qk.billingHistory, queryFn: billingApi.billingHistory });

export function useSubmitPaymentProof() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitPaymentProofInput) => billingApi.submitPaymentProof(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.subscription });
      qc.invalidateQueries({ queryKey: qk.billingHistory });
      qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

// ── student scheduling ──────────────────────────────────────────────────────
export const useStudentDashboard = () =>
  useQuery({ queryKey: qk.studentDashboard, queryFn: bookingApi.studentDashboard });

export const useStudentTopics = (category?: string) =>
  useQuery({ queryKey: qk.studentTopics(category), queryFn: () => topicsApi.studentTopics(category) });

export const useStudentTopic = (id: string) =>
  useQuery({ queryKey: qk.studentTopic(id), queryFn: () => topicsApi.studentTopic(id), enabled: !!id });

export const useTopicQuestions = (id: string, enabled = true) =>
  useQuery({
    queryKey: qk.topicQuestions(id),
    queryFn: () => topicsApi.studentTopicQuestions(id),
    enabled: !!id && enabled,
  });

export const useMyBookings = () =>
  useQuery({ queryKey: qk.bookings, queryFn: bookingApi.myBookings });

export const useBooking = (id: string) =>
  useQuery({ queryKey: qk.booking(id), queryFn: () => bookingApi.booking(id), enabled: !!id });

export const useOpenSlots = (instructorId: string) =>
  useQuery({
    queryKey: qk.openSlots(instructorId),
    queryFn: () => bookingApi.openSlots(instructorId),
    enabled: !!instructorId,
  });

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { topicId: string; slotId: string }) => bookingApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.studentDashboard });
      qc.invalidateQueries({ queryKey: qk.bookings });
      qc.invalidateQueries({ queryKey: qk.subscription });
    },
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => bookingApi.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.studentDashboard });
      qc.invalidateQueries({ queryKey: qk.bookings });
    },
  });
}

// ── instructor ────────────────────────────────────────────────────────────────
export const useInstructorDashboard = () =>
  useQuery({ queryKey: qk.instructorDashboard, queryFn: topicsApi.instructorDashboard });

export const useInstructorTopics = () =>
  useQuery({ queryKey: qk.instructorTopics, queryFn: topicsApi.instructorTopics });

export const useInstructorAvailability = () =>
  useQuery({ queryKey: qk.instructorAvailability, queryFn: topicsApi.instructorAvailability });

// ── admin ─────────────────────────────────────────────────────────────────────
export const useAdminDashboard = () =>
  useQuery({ queryKey: qk.adminDashboard, queryFn: topicsApi.adminDashboard });

export const useAdminProofs = () =>
  useQuery({ queryKey: qk.adminProofs, queryFn: topicsApi.adminPaymentProofs });

export function useApprovePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (proofId: string) => topicsApi.approvePayment(proofId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.adminProofs });
      qc.invalidateQueries({ queryKey: qk.adminDashboard });
    },
  });
}

export function useRejectPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ proofId, note }: { proofId: string; note?: string }) =>
      topicsApi.rejectPayment(proofId, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.adminProofs });
      qc.invalidateQueries({ queryKey: qk.adminDashboard });
    },
  });
}

// ── sessions ──────────────────────────────────────────────────────────────────
export const useSession = (id: string) =>
  useQuery({ queryKey: qk.session(id), queryFn: () => sessionsApi.detail(id), enabled: !!id });

export function useJoinSession() {
  return useMutation({ mutationFn: (id: string) => sessionsApi.join(id) });
}

export function useEndSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sessionsApi.end(id),
    onSuccess: (_d, id) => qc.invalidateQueries({ queryKey: qk.session(id) }),
  });
}

// ── reports ───────────────────────────────────────────────────────────────────
export const useReport = (reportId: string) =>
  useQuery({ queryKey: qk.reportById(reportId), queryFn: () => reportsApi.byId(reportId), enabled: !!reportId });

// ── notifications ─────────────────────────────────────────────────────────────
export const useNotifications = () =>
  useQuery({ queryKey: qk.notifications, queryFn: notificationsApi.list });

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
}
