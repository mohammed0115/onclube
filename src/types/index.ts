// ─────────────────────────────────────────────────────────────────────────────
// English Club — domain types
//
// English Club is a structured English *conversation practice* platform.
// Students already know basic English. They register, pick a goal, take an AI
// placement test, pay by local bank transfer, wait for admin approval, then book
// live conversation sessions with a human instructor. The instructor owns the
// topics; AI only assists (subtopics, questions, post-session analysis). AI never
// replaces the instructor.
// ─────────────────────────────────────────────────────────────────────────────

export type Role = "student" | "instructor" | "admin";

export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

/** What the student wants to use English for. Drives topic recommendations. */
export interface Goal {
  id: string;
  label: string;
  description: string;
  icon: string; // lucide icon name
  accent: string; // tailwind gradient classes, e.g. "from-indigo-500 to-indigo-600"
}

export type GoalId = string;

// ── Placement ────────────────────────────────────────────────────────────────

export interface PlacementQuestion {
  id: string;
  prompt: string;
  options: string[];
  /** index of the correct option (used only for mock scoring) */
  correct: number;
  skill: "grammar" | "vocabulary" | "comprehension" | "usage";
}

export interface SkillScore {
  label: string;
  /** 0–100 */
  value: number;
  color: string; // hex
}

export interface PlacementResult {
  level: CEFRLevel;
  levelLabel: string;
  summary: string;
  skills: SkillScore[];
}

// ── Billing ──────────────────────────────────────────────────────────────────

export interface Plan {
  id: string;
  name: string;
  emoji: string;
  /** price in the local currency for one billing cycle */
  price: number;
  currency: string;
  cadence: string; // e.g. "/ month"
  description: string;
  sessionsPerMonth: number;
  features: string[];
  recommended?: boolean;
}

export interface BankAccount {
  bankName: string;
  accountName: string;
  accountNumber: string;
  iban: string;
  branch: string;
}

export type PaymentStatus = "none" | "pending" | "approved" | "rejected";

export interface PaymentProof {
  id: string;
  studentId: string;
  studentName: string;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  reference: string;
  transferDate: string;
  /** filename of the uploaded receipt (mock) */
  receiptName: string;
  status: PaymentStatus;
  submittedAt: string;
}

// ── Topics, subtopics & questions ──────────────────────────────────────────────

/** A discussion question shown to the student before a session. */
export interface DiscussionQuestion {
  id: string;
  text: string;
  /** true when this question was drafted with AI assistance */
  aiAssisted?: boolean;
}

export interface Subtopic {
  id: string;
  title: string;
  /** marks subtopics the instructor accepted from AI suggestions */
  aiGenerated?: boolean;
}

/** Topics are created and owned by the INSTRUCTOR. AI only suggests. */
export interface Topic {
  id: string;
  title: string;
  category: string;
  icon: string; // lucide icon name
  accent: string; // tailwind gradient classes
  description: string;
  level: CEFRLevel;
  instructorId: string;
  subtopics: Subtopic[];
  questions: DiscussionQuestion[];
  vocabulary: string[];
  published: boolean;
}

// ── People ─────────────────────────────────────────────────────────────────────

export interface Instructor {
  id: string;
  name: string;
  initials: string;
  flag: string;
  country: string;
  headline: string;
  rating: number;
  sessionsHosted: number;
  accent: string; // gradient classes for avatar
}

export interface Student {
  id: string;
  name: string;
  initials: string;
  flag: string;
  level: CEFRLevel;
  goalId: GoalId;
  paymentStatus: PaymentStatus;
  sessionsRemaining: number;
  planName: string;
}

// ── Booking & sessions ──────────────────────────────────────────────────────────

export type BookingStatus = "upcoming" | "completed" | "cancelled";

export interface TimeSlot {
  /** "08:00" */
  time: string;
  available: boolean;
}

export interface AvailabilityDay {
  /** day of month */
  day: number;
  slots: TimeSlot[];
}

export interface Booking {
  id: string;
  topicId: string;
  topicTitle: string;
  instructorId: string;
  instructorName: string;
  date: string; // human readable
  time: string;
  durationMinutes: number;
  status: BookingStatus;
  /** present once the AI report has been generated for a completed session */
  reportId?: string;
}

// ── AI session report ───────────────────────────────────────────────────────────

export interface ReportMistake {
  label: string;
  example: string;
}

export interface SessionReport {
  id: string;
  bookingId: string;
  topicTitle: string;
  instructorName: string;
  date: string;
  durationMinutes: number;
  overallScore: number;
  skills: SkillScore[];
  mistakes: ReportMistake[];
  /** AI-generated improvement recommendations */
  recommendations: string[];
  /** the human instructor's own note — kept distinct from AI output */
  instructorNote: string;
}
