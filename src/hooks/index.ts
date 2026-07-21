// React Query hooks — the only data-access surface pages use.
// Queries cache + retry per queryClient policy; mutations invalidate precisely.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/query/queryClient";
import {
  authApi,
  billingApi,
  bookingApi,
  instructorsApi,
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

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fullName: string) => authApi.updateProfile(fullName),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(input.currentPassword, input.newPassword),
  });
}

export function useRequestPasswordReset() {
  return useMutation({ mutationFn: (email: string) => authApi.requestPasswordReset(email) });
}

export function useConfirmPasswordReset() {
  return useMutation({
    mutationFn: (input: { uid: string; token: string; newPassword: string }) =>
      authApi.confirmPasswordReset(input.uid, input.token, input.newPassword),
  });
}

// ── instructor profile ──────────────────────────────────────────────────────
export const useInstructorProfile = () =>
  useQuery({ queryKey: qk.instructorProfile, queryFn: topicsApi.instructorProfile });

export function useUpdateInstructorProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<import("@/api/types").InstructorProfile>) =>
      topicsApi.updateInstructorProfile(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.instructorProfile });
      qc.invalidateQueries({ queryKey: qk.me });
    },
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

export const usePlacementReview = (enabled = true) =>
  useQuery({ queryKey: qk.placementReview, queryFn: placementApi.resultReview, enabled });

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

/** The student's latest payment proof status (pending / approved / rejected / needs-info). */
export const useLatestPaymentProof = (options?: { refetchInterval?: number }) =>
  useQuery({
    queryKey: qk.latestPaymentProof,
    queryFn: billingApi.latestPaymentProof,
    refetchInterval: options?.refetchInterval,
  });

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

export const usePractice = () =>
  useQuery({ queryKey: qk.practice, queryFn: topicsApi.practice });

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

export const useWeeklyCalendar = (topicId: string, weekStart?: string) =>
  useQuery({
    queryKey: qk.calendar(topicId, weekStart),
    queryFn: () => bookingApi.calendar(topicId, weekStart),
    enabled: !!topicId,
  });

// ── progress dashboard ──────────────────────────────────────────────────────────
export const useStudentProgress = () =>
  useQuery({ queryKey: qk.studentProgress, queryFn: bookingApi.progress });

export const useStudentPlan = () =>
  useQuery({ queryKey: qk.studentPlan, queryFn: bookingApi.plan });

// ── public instructors ──────────────────────────────────────────────────────────
export const usePublicInstructors = () =>
  useQuery({ queryKey: qk.publicInstructors, queryFn: instructorsApi.list });

export const usePublicInstructor = (slug: string) =>
  useQuery({
    queryKey: qk.publicInstructor(slug),
    queryFn: () => instructorsApi.bySlug(slug),
    enabled: !!slug,
  });

// ── teacher self-service (build CV) ──
export const useOwnPublicProfile = () =>
  useQuery({ queryKey: qk.ownPublicProfile, queryFn: instructorsApi.ownProfile });

function useOwnProfileMutation<T>(fn: (v: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.ownPublicProfile });
      qc.invalidateQueries({ queryKey: qk.publicInstructors });
    },
  });
}

export const useUpdatePublicProfile = () =>
  useOwnProfileMutation((data: Record<string, unknown>) => instructorsApi.updateProfile(data));
export const useUpdatePublicSettings = () =>
  useOwnProfileMutation((data: Record<string, boolean>) => instructorsApi.updateSettings(data));
export const useReplaceSocialLinks = () =>
  useOwnProfileMutation((links: import("@/api/types").InstructorSocialLinkInput[]) => instructorsApi.replaceSocial(links));
export const useReplaceEducation = () =>
  useOwnProfileMutation((items: import("@/api/types").InstructorEducationInput[]) => instructorsApi.replaceEducation(items));
export const useReplaceExperience = () =>
  useOwnProfileMutation((items: import("@/api/types").InstructorExperienceInput[]) => instructorsApi.replaceExperience(items));
export const useReplaceCertifications = () =>
  useOwnProfileMutation((items: import("@/api/types").InstructorCertificationInput[]) => instructorsApi.replaceCertifications(items));

// ── admin instructor controls ──
export const useAdminInstructors = () =>
  useQuery({ queryKey: qk.adminInstructors, queryFn: instructorsApi.adminList });

function useAdminInstructorMutation<A extends unknown[]>(fn: (...a: A) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: A) => fn(...args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.adminInstructors });
      qc.invalidateQueries({ queryKey: qk.publicInstructors });
    },
  });
}

export const useAdminApproveInstructor = () =>
  useAdminInstructorMutation((id: string, approved: boolean) => instructorsApi.adminApprove(id, approved));
export const useAdminFeatureInstructor = () =>
  useAdminInstructorMutation((id: string, featured: boolean) => instructorsApi.adminFeature(id, featured));
export const useAdminVisibilityInstructor = () =>
  useAdminInstructorMutation((id: string, show: boolean) => instructorsApi.adminVisibility(id, show));
export const useAdminFoundingInstructor = () =>
  useAdminInstructorMutation((id: string, founding: boolean) => instructorsApi.adminFounding(id, founding));
export const useAdminDisplayOrderInstructor = () =>
  useAdminInstructorMutation((id: string, order: number) => instructorsApi.adminDisplayOrder(id, order));

// ── AI tutor ──────────────────────────────────────────────────────────────────
export const useAITutorStatus = () =>
  useQuery({ queryKey: qk.aiTutorStatus, queryFn: bookingApi.aiTutorStatus });

export function useStartAITutor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (topic: string) => bookingApi.aiTutorStart(topic),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.aiTutorStatus }),
  });
}

export function useSendAITutorMessage() {
  return useMutation({
    mutationFn: (input: { sessionId: string; text: string }) =>
      bookingApi.aiTutorMessage(input.sessionId, input.text),
  });
}

export function useEndAITutor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => bookingApi.aiTutorEnd(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.aiTutorStatus }),
  });
}

// ── recurring weekly schedule (student-driven) ──────────────────────────────────
export const useStudentSchedule = () =>
  useQuery({ queryKey: qk.studentSchedule, queryFn: bookingApi.schedule });

export const useScheduleWindows = (topicId: string) =>
  useQuery({
    queryKey: qk.scheduleWindows(topicId || "none"),
    queryFn: () => bookingApi.scheduleWindows(topicId),
    enabled: !!topicId,
  });

export function useSetStudentSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (picks: import("@/api/types").SchedulePickInput[]) => bookingApi.setSchedule(picks),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.studentSchedule });
      qc.invalidateQueries({ queryKey: qk.bookings });
      qc.invalidateQueries({ queryKey: qk.studentDashboard });
      qc.invalidateQueries({ queryKey: qk.subscription });
    },
  });
}

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
      qc.invalidateQueries({ queryKey: qk.studentSchedule });
      qc.invalidateQueries({ queryKey: qk.subscription });
    },
  });
}

export function useRateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { bookingId: string; stars: number; comment: string }) =>
      bookingApi.rateSession(input.bookingId, input.stars, input.comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.bookings });
      qc.invalidateQueries({ queryKey: qk.studentDashboard });
    },
  });
}

// ── community / group sessions ─────────────────────────────────────────────────
export const useCommunitySessions = () =>
  useQuery({ queryKey: qk.community, queryFn: bookingApi.communitySessions });

export function useJoinGroupSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; join: boolean }) =>
      input.join ? bookingApi.joinGroupSession(input.id) : bookingApi.leaveGroupSession(input.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.community }),
  });
}

// ── instructor ────────────────────────────────────────────────────────────────
export const useInstructorDashboard = () =>
  useQuery({ queryKey: qk.instructorDashboard, queryFn: topicsApi.instructorDashboard });

export const useInstructorTopics = () =>
  useQuery({ queryKey: qk.instructorTopics, queryFn: topicsApi.instructorTopics });

export const useInstructorAvailability = () =>
  useQuery({ queryKey: qk.instructorAvailability, queryFn: topicsApi.instructorAvailability });

export function useSetAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slots: { startAt: string; durationMinutes?: number }[]) => topicsApi.setAvailability(slots),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.instructorAvailability }),
  });
}

export const useRecurringAvailability = () =>
  useQuery({ queryKey: qk.recurringAvailability, queryFn: topicsApi.recurringAvailability });

export function useSetRecurringAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (windows: import("@/api/types").AvailabilityWindow[]) =>
      topicsApi.setRecurringAvailability(windows),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.recurringAvailability }),
  });
}

export const useInstructorBookings = () =>
  useQuery({ queryKey: qk.instructorBookings, queryFn: topicsApi.instructorBookings });

export const useInstructorStudents = () =>
  useQuery({ queryKey: qk.instructorStudents, queryFn: topicsApi.instructorStudents });

export const useInstructorStudent = (id: string) =>
  useQuery({ queryKey: qk.instructorStudent(id), queryFn: () => topicsApi.instructorStudent(id), enabled: !!id });

export function useCancelInstructorBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => topicsApi.cancelInstructorBooking(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.instructorBookings });
      qc.invalidateQueries({ queryKey: qk.instructorDashboard });
      qc.invalidateQueries({ queryKey: qk.instructorAvailability });
    },
  });
}

export function useRescheduleInstructorBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; newSlotId: string }) =>
      topicsApi.rescheduleInstructorBooking(input.id, input.newSlotId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.instructorBookings });
      qc.invalidateQueries({ queryKey: qk.instructorAvailability });
    },
  });
}

export const useAvailabilityExceptions = () =>
  useQuery({ queryKey: qk.availabilityExceptions, queryFn: topicsApi.availabilityExceptions });

export function useAddAvailabilityException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { kind: string; startAt: string; endAt: string; note?: string }) =>
      topicsApi.addAvailabilityException(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.availabilityExceptions });
      qc.invalidateQueries({ queryKey: qk.instructorAvailability });
    },
  });
}

export function useRemoveAvailabilityException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => topicsApi.removeAvailabilityException(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.availabilityExceptions });
      qc.invalidateQueries({ queryKey: qk.instructorAvailability });
    },
  });
}

// ── admin ─────────────────────────────────────────────────────────────────────
export const useAdminDashboard = () =>
  useQuery({ queryKey: qk.adminDashboard, queryFn: topicsApi.adminDashboard });

export const useAdminUsers = (role?: string) =>
  useQuery({ queryKey: qk.adminUsers(role), queryFn: () => topicsApi.adminUsers(role) });

export function useSetUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; status: "active" | "suspended" }) => topicsApi.setUserStatus(input.id, input.status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "users"] }); qc.invalidateQueries({ queryKey: qk.auditLog }); },
  });
}

export function useChangeUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; role: string }) => topicsApi.changeUserRole(input.id, input.role),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "users"] }); qc.invalidateQueries({ queryKey: qk.auditLog }); },
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { fullName: string; email: string; role: "instructor" | "admin" | "student" }) =>
      topicsApi.inviteUser(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "instructors"] });
      qc.invalidateQueries({ queryKey: qk.auditLog });
    },
  });
}

export function useTopUpSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { subscriptionId: string; sessions: number; reason?: string }) =>
      topicsApi.topUpSubscription(input.subscriptionId, input.sessions, input.reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: qk.auditLog });
    },
  });
}

export function useExtendSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { subscriptionId: string; newExpiresAt: string; reason?: string }) =>
      topicsApi.extendSubscription(input.subscriptionId, input.newExpiresAt, input.reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: qk.auditLog });
    },
  });
}

export const useAuditLog = () =>
  useQuery({ queryKey: qk.auditLog, queryFn: topicsApi.auditLog });

export const useAdminSessions = () =>
  useQuery({ queryKey: qk.adminSessions, queryFn: topicsApi.adminSessions });

export const useAdminBookings = () =>
  useQuery({ queryKey: qk.adminBookings, queryFn: topicsApi.adminBookings });

// ── admin: student recurring-schedule review gate ───────────────────────────
export const useAdminScheduleRequests = () =>
  useQuery({ queryKey: qk.adminScheduleRequests, queryFn: topicsApi.adminScheduleRequests });

export const useGroupCapacity = () =>
  useQuery({ queryKey: qk.adminGroupCapacity, queryFn: topicsApi.adminGroupCapacity });

export function useSetGroupCapacity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupCapacity: number) => topicsApi.adminSetGroupCapacity(groupCapacity),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.adminGroupCapacity }),
  });
}

export function useApproveSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { studentId: string; slotIds?: string[] }) =>
      topicsApi.adminApproveSchedule(input.studentId, input.slotIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.adminScheduleRequests });
      qc.invalidateQueries({ queryKey: qk.adminBookings });
    },
  });
}

export function useRejectSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { slotId: string; note: string }) =>
      topicsApi.adminRejectSchedule(input.slotId, input.note),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.adminScheduleRequests }),
  });
}

export function useAssignScheduleInstructor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { slotId: string; instructorId: string }) =>
      topicsApi.adminAssignSchedule(input.slotId, input.instructorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.adminScheduleRequests }),
  });
}

// ── instructor: per-session lesson authoring ────────────────────────────────
export const useInstructorLessons = () =>
  useQuery({ queryKey: qk.instructorLessons, queryFn: topicsApi.instructorLessons });

export function usePrepareLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { bookingId: string; title: string; questions: string[] }) =>
      topicsApi.prepareLesson(input.bookingId, input.title, input.questions),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.instructorLessons }),
  });
}

export function useSuggestLessonQuestions() {
  return useMutation({ mutationFn: (title: string) => topicsApi.suggestLessonQuestions(title) });
}

// ── instructor: topic builder (real AI suggestions) ─────────────────────────
export function useCreateTopic() {
  return useMutation({
    mutationFn: (input: { title: string; category: string; level: string; description?: string }) =>
      topicsApi.createTopic(input),
  });
}
export function useUpdateTopic() {
  return useMutation({
    mutationFn: (input: { topicId: string; patch: { title?: string; category?: string; level?: string; description?: string } }) =>
      topicsApi.updateTopic(input.topicId, input.patch),
  });
}
export function useSuggestSubtopics() {
  return useMutation({ mutationFn: (topicId: string) => topicsApi.suggestSubtopics(topicId) });
}
export function useSuggestQuestions() {
  return useMutation({ mutationFn: (topicId: string) => topicsApi.suggestQuestions(topicId) });
}
export function useAddTopicQuestion() {
  return useMutation({
    mutationFn: (input: { topicId: string; text: string }) => topicsApi.addTopicQuestion(input.topicId, input.text),
  });
}
export function useApproveTopicQuestion() {
  return useMutation({
    mutationFn: (input: { topicId: string; questionId: string }) =>
      topicsApi.approveTopicQuestion(input.topicId, input.questionId),
  });
}
export function usePublishTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (topicId: string) => topicsApi.publishTopic(topicId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.instructorTopics }),
  });
}

export function useAdminCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; forceCredit?: boolean }) =>
      topicsApi.adminUpdateBooking(input.id, { status: "cancelled", forceCredit: input.forceCredit }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.adminBookings });
      qc.invalidateQueries({ queryKey: qk.adminSessions });
      qc.invalidateQueries({ queryKey: qk.auditLog });
    },
  });
}

// ── admin: plans (Phase 9) ──────────────────────────────────────────────────
export const useAdminPlans = () =>
  useQuery({ queryKey: qk.adminPlans, queryFn: topicsApi.adminPlans });

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: import("@/api/types").CreatePlanInput) => topicsApi.adminCreatePlan(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.adminPlans });
      qc.invalidateQueries({ queryKey: qk.plans });
      qc.invalidateQueries({ queryKey: qk.auditLog });
    },
  });
}

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; patch: Partial<import("@/api/types").CreatePlanInput> }) =>
      topicsApi.adminUpdatePlan(input.id, input.patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.adminPlans });
      qc.invalidateQueries({ queryKey: qk.plans });
      qc.invalidateQueries({ queryKey: qk.auditLog });
    },
  });
}

export const useAdminBusiness = () =>
  useQuery({ queryKey: qk.adminBusiness, queryFn: topicsApi.adminBusiness });

export const useAdminPlatform = () =>
  useQuery({ queryKey: qk.adminPlatform, queryFn: topicsApi.adminPlatform });

export const useAdminProofs = () =>
  useQuery({ queryKey: qk.adminProofs, queryFn: topicsApi.adminPaymentProofs });

export const useAdminProofDetail = (proofId: string | null) =>
  useQuery({
    queryKey: proofId ? qk.adminProofDetail(proofId) : ["admin", "proofs", "none"],
    queryFn: () => topicsApi.adminPaymentProofDetail(proofId as string),
    enabled: !!proofId,
  });

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

export function useRequestPaymentInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ proofId, note }: { proofId: string; note: string }) =>
      topicsApi.requestPaymentInfo(proofId, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.adminProofs });
      qc.invalidateQueries({ queryKey: qk.adminDashboard });
    },
  });
}

// ── sessions ──────────────────────────────────────────────────────────────────
export const useSession = (id: string) =>
  useQuery({ queryKey: qk.session(id), queryFn: () => sessionsApi.detail(id), enabled: !!id });

// Waiting room. Poll so the join window (canJoin/phase) re-opens on its own as
// the scheduled time approaches, without the user reloading.
export const useWaitingRoom = (id: string) =>
  useQuery({
    queryKey: qk.waitingRoom(id),
    queryFn: () => sessionsApi.waitingRoom(id),
    enabled: !!id,
    refetchInterval: 20_000,
  });

export function useJoinSession() {
  return useMutation({ mutationFn: (id: string) => sessionsApi.join(id) });
}

export function useLeaveSession() {
  return useMutation({ mutationFn: (id: string) => sessionsApi.leave(id) });
}

export function useStartSession() {
  return useMutation({ mutationFn: (id: string) => sessionsApi.start(id) });
}

export { useVideoRoom } from "./useVideoRoom";
export type { VideoRoomController } from "./useVideoRoom";
export { useSessionChat } from "./useSessionChat";
export type { SessionChatController } from "./useSessionChat";
export { useWhiteboard } from "./useWhiteboard";
export type { WhiteboardController } from "./useWhiteboard";
export { useSessionFiles } from "./useSessionFiles";
export type { SessionFilesController } from "./useSessionFiles";
export { useParticipantSignals } from "./useParticipantSignals";
export type { ParticipantSignalsController } from "./useParticipantSignals";
export { useSessionRecording } from "./useSessionRecording";
export type { SessionRecordingController } from "./useSessionRecording";
export { useSessionPresence } from "./useSessionPresence";
export type { SessionPresenceController } from "./useSessionPresence";
export { useSessionTranscript } from "./useSessionTranscript";
export type { SessionTranscriptController } from "./useSessionTranscript";
export { useSessionSpeechCapture } from "./useSessionSpeechCapture";

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

export function useSaveSessionNotes(reportId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { sessionId: string; notes: import("@/api/reports").SessionNotes }) =>
      reportsApi.saveNotes(input.sessionId, input.notes),
    onSuccess: () => { if (reportId) qc.invalidateQueries({ queryKey: qk.reportById(reportId) }); },
  });
}

export function useAcceptReport(reportId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { sessionId: string; note?: string }) => reportsApi.acceptReport(input.sessionId, input.note),
    onSuccess: () => { if (reportId) qc.invalidateQueries({ queryKey: qk.reportById(reportId) }); },
  });
}

export function useReportRegen(reportId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => reportsApi.regenerateReport(sessionId),
    onSuccess: () => { if (reportId) qc.invalidateQueries({ queryKey: qk.reportById(reportId) }); },
  });
}

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
