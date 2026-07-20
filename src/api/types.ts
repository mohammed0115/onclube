// API response contracts — mirror the Django DRF serializers (camelCase).
// These describe what the backend returns; the UI keeps using its own view
// models where convenient and adapts at the page boundary.

export type ApiRole = "student" | "instructor" | "admin";
export type CEFR = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface TokenPair {
  access: string;
  refresh: string;
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  role: ApiRole;
  status: string;
  level: CEFR | null;
  goalId: string | null;
  paymentStatus: string | null;
  sessionsRemaining: number | null;
  rating: number | null;
  headline: string | null;
}

export interface GoalOption {
  id: string;
  code: string;
  label: string;
  description: string | null;
  icon: string | null;
  accent: string | null;
}

// ── placement (Phase 8F) ──────────────────────────────────────────────────────
// Mirrors the DRF serializers. `options` are the visible multiple-choice answers;
// the answer key (`correctAnswer`/`correctIndex`) and any pronunciation field are
// NEVER sent to the client.
export type PlacementQuestionType = "written" | "spoken";
export type PlacementStatusValue =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "assessed"
  | "reset";

export interface PlacementQuestionItem {
  id: string;
  type: PlacementQuestionType;
  prompt: string;
  skill: string;
  cefrBand: CEFR;
  order: number;
  /** Visible multiple-choice answers (written questions); empty for open prompts. */
  options: string[];
}

export interface PlacementTest {
  written: PlacementQuestionItem[];
  spoken: PlacementQuestionItem[];
}

// ── speaking interview (Sprint 2) ─────────────────────────────────────────────
// Presentational interviewer script only — no model prompt, key, or score.
export interface InterviewStep {
  questionId: string;
  order: number;
  prompt: string; // the fixed spoken question, verbatim
  preamble: string; // interviewer lead-in
  clarification: string; // meaning-preserving rephrase
}

export interface SpeakingInterview {
  greeting: string;
  instructions: string;
  encouragement: string;
  closing: string;
  steps: InterviewStep[];
  // Deterministic OneClub script metadata (Sprint 2.0.1A).
  scriptId: string;
  scriptVersion: string;
  language: string;
  /** Fixed "Welcome back" lines, one per progress point (k answers saved). */
  resumeMessages: string[];
}

// Interview SESSION (Sprint 2.5) — lifecycle + transcript only, NO assessment.
export type AnswerSource = "voice" | "manual";
export type InterviewSessionStatus = "created" | "running" | "completed" | "finalized";

export interface InterviewAnswer {
  questionId: string;
  order: number;
  transcriptText: string;
  source: AnswerSource;
}

export interface InterviewSession {
  interviewId: string;
  attemptId: string;
  status: InterviewSessionStatus;
  currentQuestionIndex: number;
  startedAt: string | null;
  finishedAt: string | null;
  answers: InterviewAnswer[];
}

export interface InterviewAnswerInput {
  questionId: string;
  transcriptText: string;
  source: AnswerSource;
}

export interface WrittenReviewItem {
  questionId: string;
  order: number;
  prompt: string;
  skill: string;
  options: string[];
  yourAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
}

export interface SpokenReviewItem {
  questionId: string;
  order: number;
  prompt: string;
  skill: string;
  yourAnswer: string;
}

export interface PlacementReview {
  level: string;
  levelLabel: string;
  scores: {
    overall: number;
    grammar: number;
    vocabulary: number;
    fluency: number;
    confidence: number;
    written: number;
    spoken: number;
  };
  writtenCorrect: number;
  writtenTotal: number;
  written: WrittenReviewItem[];
  spoken: SpokenReviewItem[];
  evaluatedBy: string;
  aiUsed: boolean;
}

export interface PlacementAttempt {
  id: string;
  status: PlacementStatusValue;
  version: number;
  goalId: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  assessedAt: string | null;
  fallbackUsed: boolean;
  providerName: string | null;
}

export interface PlacementAttemptStatus {
  status: PlacementStatusValue;
  attemptId: string | null;
  writtenComplete: boolean;
  spokenComplete: boolean;
  assessed: boolean;
  canSubmit: boolean;
}

export interface PlacementAssessment {
  cefrLevel: CEFR;
  overallConversationScore: number;
  grammarScore: number;
  vocabularyScore: number;
  fluencyScore: number;
  confidenceScore: number;
  writtenScore: number;
  spokenScore: number;
  spokenCapped: boolean;
  spokenCeiling: CEFR;
  strengths: string[];
  weaknesses: string[];
  recommendedFocus: string[];
  recommendedConversationTopics: string[];
  recommendedInstructorDifficulty: string;
  fallbackUsed: boolean;
  providerName: string;
  // NOTE: no pronunciation field — pronunciation is out of MVP scope.
}

export interface PlacementWrittenAnswerInput {
  questionId: string;
  answerText: string;
}

export interface PlacementSpokenTranscriptInput {
  questionId: string;
  transcriptText: string;
}

export interface PlacementResetAudit {
  auditId: string;
  attemptId: string;
  studentId: string;
  resetById: string | null;
  reason: string;
}

// Configurable bank-transfer provider/account (Phase 9A.1). No bank value is ever
// hardcoded in the frontend — it all comes from /billing/bank-account/ or /providers/.
export interface PaymentProvider {
  providerKey: string;
  providerName: string;
  transferMethod: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  iban: string | null;
  instructions: string;
  currency: string;
  isActive: boolean;
  displayOrder: number;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  emoji: string | null;
  price: number;
  currency: string;
  cadence: string;
  description: string | null;
  sessionsPerMonth: number;
  features: string[];
  recommended: boolean;
  active?: boolean;
}

export interface CreatePlanInput {
  code: string;
  name: string;
  price: number | string;
  currency?: string;
  cadence?: string;
  billing_period_days?: number;
  description?: string;
  emoji?: string;
  sessions_per_month: number;
  features?: string[];
  recommended?: boolean;
  active?: boolean;
}

export interface SubscriptionDetail {
  id: string;
  planId: string;
  planName: string;
  status: string;
  startedAt: string | null;
  expiresAt: string | null;
  sessionsRemaining: number;
}

export interface BillingHistoryItem {
  id: string;
  planName: string;
  amount: number;
  currency: string;
  status: string;
  submittedAt: string;
  receiptUrl: string | null;
}

export interface PaymentProofDetail {
  id: string;
  planName: string;
  amount: number;
  currency: string;
  transactionNumber: string;
  transferDatetime: string;
  receiptName: string;
  status: string;
  submittedAt: string;
  retainUntil: string | null;
  senderName: string | null;
  receiverName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  receiptUrl: string | null;
  // Admin-review context (null for the student's own view).
  studentId: string | null;
  studentName: string | null;
}

export interface BookingListItem {
  id: string;
  topicTitle: string;
  instructorName: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  reportId: string | null;
}

export interface BookingDetail extends BookingListItem {
  topicId: string;
  instructorId: string;
  creditRefunded: boolean;
  cancelledAt: string | null;
  sessionId: string | null;
}

export interface BookingResult {
  bookingId: string;
  slotId: string;
  topicId: string;
  scheduledAt: string;
  status: string;
  sessionsRemaining: number;
}

export interface Cancellation {
  bookingId: string;
  status: string;
  creditRefunded: boolean;
  sessionsRemaining: number;
}

export interface StudentDashboard {
  sessionsRemaining: number;
  sessionsCompleted: number;
  paymentStatus: string;
  level: CEFR | null;
  latestScore: number | null;
  nextSession: BookingListItem | null;
  recentSessions: BookingListItem[];
  progressTrend: { label: string; score: number }[];
  gamification: Gamification;
}

export interface Milestone {
  key: string;
  label: string;
  description: string;
  icon: string;
  earned: boolean;
}

export interface Gamification {
  points: number;
  streakWeeks: number;
  sessionsCompleted: number;
  milestonesEarned: number;
  milestonesTotal: number;
  milestones: Milestone[];
}

export interface GroupSession {
  id: string;
  title: string;
  description: string;
  instructorName: string;
  level: string;
  startAt: string;
  durationMinutes: number;
  capacity: number;
  seatsTaken: number;
  seatsLeft: number;
  joined: boolean;
  attendees: string[];
  status: string;
}

export interface SubtopicJSON {
  id: string;
  title: string;
  ai_generated: boolean;
}

export interface QuestionFull {
  id: string;
  text: string;
  aiAssisted: boolean;
  approved: boolean;
}

export interface TopicPreview {
  id: string;
  title: string;
  category: string;
  level: CEFR;
  description: string | null;
  instructorId: string;
  instructorName: string;
  instructorHeadline: string | null;
  samplePrompts: { text: string }[];
  subtopics: SubtopicJSON[];
  mode: "preview" | "full";
}

export interface TopicFull extends TopicPreview {
  questions: QuestionFull[];
  vocabulary: string[];
}

export interface AvailabilitySlot {
  id: string;
  instructorId: string;
  startAt: string;
  durationMinutes: number;
  status: string;
}

// ── weekly calendar (Sprint 7) ────────────────────────────────────────────────
export type CalendarSlotStatus = "available" | "booked" | "blocked" | "completed";

export interface CalendarSlot {
  id: string;
  startAt: string;
  durationMinutes: number;
  status: CalendarSlotStatus;
}

export interface CalendarDay {
  date: string; // ISO date (YYYY-MM-DD)
  weekday: string; // monday..sunday
  slots: CalendarSlot[];
}

export interface WeeklyCalendar {
  topicId: string;
  instructorId: string;
  instructorName: string;
  weekStart: string;
  weekEnd: string;
  days: CalendarDay[];
}

// ── recurring weekly schedule (student-driven) ──────────────────────────────────
export interface SchedulePick {
  id: string;
  weekday: number; // 0=Mon … 6=Sun
  startTime: string; // "HH:MM"
  durationMinutes: number;
  topicId: string;
  topicTitle: string;
  instructorId: string;
  instructorName: string;
}

export interface GeneratedBooking {
  bookingId: string;
  topicTitle: string;
  scheduledAt: string;
  status: string;
}

export interface ScheduleGenerationSummary {
  created: number;
  skipped: number;
  outOfCredits: boolean;
  bookings: GeneratedBooking[];
}

export interface ScheduleUpcomingItem {
  bookingId: string;
  topicTitle: string;
  instructorName: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
}

export interface StudentSchedule {
  schedule: SchedulePick[];
  upcoming: ScheduleUpcomingItem[];
}

export interface SetScheduleResult {
  schedule: SchedulePick[];
  generated: ScheduleGenerationSummary;
}

export interface SchedulePickInput {
  weekday: number;
  startTime: string; // "HH:MM"
  topicId: string;
  durationMinutes?: number;
}

export interface AvailabilityWindow {
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface InstructorWindows {
  instructorId: string | null;
  instructorName: string | null;
  windows: AvailabilityWindow[];
}

// ── progress dashboard ──────────────────────────────────────────────────────────
export interface ProgressOverallPoint {
  label: string;
  score: number;
  date: string | null;
  topic: string | null;
}

export interface ProgressOverall {
  current: number | null;
  previous: number | null;
  delta: number | null;
  series: ProgressOverallPoint[];
}

export interface SkillSeriesPoint {
  label: string;
  value: number | null;
}

export interface SkillProgress {
  label: string;
  color: string | null;
  current: number | null;
  previous: number | null;
  delta: number | null;
  series: SkillSeriesPoint[];
}

export interface StudentProgress {
  sessionsCount: number;
  overall: ProgressOverall;
  skills: SkillProgress[];
  message: string;
}

export interface AdminBookingItem {
  id: string;
  studentId: string;
  studentName: string;
  topicTitle: string;
  instructorName: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  creditRefunded: boolean;
}

export interface InstructorDashboard {
  upcomingSessions: number;
  activeStudents: number;
  topicsOwned: number;
  averageRating: number;
  todaySessions: BookingListItem[];
  topics: { id: string; title: string; published: boolean; level: CEFR }[];
  weekly: Record<string, number>;
  completedSessions: number;
  teachingHours: number;
  cancellationRate: number;
}

export type AvailabilityExceptionKind = "vacation" | "holiday" | "block";

export interface AvailabilityException {
  id: string;
  kind: AvailabilityExceptionKind;
  startAt: string;
  endAt: string;
  note: string;
}

export interface InstructorStudentSummary {
  id: string;
  fullName: string;
  level: string | null;
  sessions: number;
  completed: number;
  lastScore: number | null;
}

export interface InstructorStudentDetail {
  id: string;
  fullName: string;
  level: string | null;
  goalTitle: string | null;
  sessionsRemaining: number;
  paymentStatus: string;
  sessions: { id: string; topicTitle: string; scheduledAt: string; status: string; reportId: string | null; score: number | null }[];
}

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  role: "student" | "instructor" | "admin";
  status: "active" | "suspended";
}

export interface BusinessOverview {
  totalRevenue: number;
  currency: string;
  activeSubscriptions: number;
  completedSessions: number;
  teacherHours: number;
  plans: { name: string; revenue: number }[];
  trend: { month: string; revenue: number }[];
}

export interface PlatformStatus {
  providers: { name: string; status: string }[];
  aiQueue: { pending: number; ready: number; failed: number };
}

export interface AdminSession {
  id: string;
  topicTitle: string;
  instructorName: string;
  studentName: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
}

export interface AuditEntry {
  id: string;
  admin: string;
  action: string;
  targetTable: string;
  targetId: string;
  reason: string;
  when: string;
}

export interface InstructorProfile {
  id: string;
  fullName: string;
  email: string;
  headline: string;
  bio: string;
  country: string;
  specialty: string;
  languages: string[];
  interests: string[];
  yearsExperience: number;
  avatarUrl: string;
  introVideoUrl: string;
  rating: number;
  sessionsHosted: number;
}

export interface PaymentApprovalItem {
  id: string;
  studentName: string;
  planName: string;
  amount: number;
  currency: string;
  status: string;
  submittedAt: string;
}

export interface AdminDashboard {
  pendingPayments: number;
  activeMembers: number;
  instructors: number;
  revenue: number;
  currency: string;
  pendingProofs: PaymentApprovalItem[];
  recentActivity: { actor: string; action: string; when: string }[];
  totalStudents: number;
  sessionsToday: number;
  reportsWaiting: number;
  systemStatus: string;
  alerts: { severity: "info" | "warning" | "error"; message: string; to: string | null }[];
}

export interface PaymentApprovalResult {
  proofId: string;
  subscriptionId: string;
  subscriptionStatus: string;
  sessionsRemaining: number;
  startedAt: string | null;
  expiresAt: string | null;
}

export interface PaymentDecision {
  proofId: string;
  status: string;
  reviewedById: string | null;
}

export interface SessionDetail {
  id: string;
  bookingId: string;
  topicTitle: string;
  status: string;
  scheduledAt: string;
  startedAt: string | null;
  endedAt: string | null;
  questions: QuestionFull[];
  vocabulary: string[];
  studentNotes: string | null;
}

export interface SessionResult {
  sessionId: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  reportPending: boolean;
}

// ── waiting room (Sprint 8.0) ─────────────────────────────────────────────────
// Pre-join view: session info + join window + the viewer's eligibility. Mirrors
// the WaitingRoomSerializer. No ORM/video fields ever leak here.
export type SessionPhase = "waiting" | "live" | "completed" | "cancelled" | "expired";
export type WaitingRoomViewerRole = "student" | "instructor" | "admin";

export interface WaitingRoom {
  sessionId: string;
  bookingId: string;
  topicTitle: string;
  instructorName: string;
  scheduledAt: string;
  durationMinutes: number;
  phase: SessionPhase;
  canJoin: boolean;
  joinOpensAt: string;
  joinClosesAt: string;
  viewerRole: WaitingRoomViewerRole;
  questions?: string[];
}

export interface VideoJoin {
  sessionId: string;
  provider: string;
  agoraAppId: string | null;
  channel: string;
  agoraToken: string;
  uid: string;
  expiresAt: string | null;
}

// ── AI session report (Sprint 9) ──────────────────────────────────────────────
// The validated report content — EXACTLY these fields. No prompt, provider, raw
// output, CEFR level, grade, or attendance score is ever present here.
export interface SessionReportContent {
  overallSummary: string;
  grammarFeedback: string;
  vocabularyFeedback: string;
  fluencyFeedback: string;
  pronunciationFeedback: string;
  strengths: string[];
  weaknesses: string[];
  recommendedTopics: string[];
  homework: string[];
  nextLessonFocus: string;
  confidenceScore: number; // 0-100
}

export interface AIReportDetail {
  id: string;
  sessionId: string;
  bookingId: string;
  topicTitle: string;
  instructorName: string;
  sessionDate: string;
  durationMinutes: number;
  status: string;
  overallScore: number | null;
  skills: { label: string; value: number; color: string }[];
  mistakes: { label: string; example: string }[];
  recommendations: string[];
  vocabulary: string[];
  instructorNote: string | null;
  // Sprint 9 — the validated AI session report, or null while pending.
  content: SessionReportContent | null;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  read: boolean;
  createdAt: string;
  body: string | null;
  data: Record<string, unknown> | null;
}

// Standard API error body: { code, detail }.
export interface ApiErrorBody {
  code: string;
  detail: unknown;
}
