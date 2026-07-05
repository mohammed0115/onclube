import type {
  Goal,
  Plan,
  PaymentProof,
  Topic,
  Instructor,
  Student,
  AvailabilityDay,
  Booking,
  SessionReport,
} from "@/types";

// ── Goals ───────────────────────────────────────────────────────────────────

export const goals: Goal[] = [
  { id: "work", label: "Work & Career", description: "Meetings, calls, presentations", icon: "Briefcase", accent: "from-indigo-500 to-indigo-600" },
  { id: "interview", label: "Job Interviews", description: "Answer with confidence", icon: "Target", accent: "from-orange-500 to-orange-600" },
  { id: "ielts", label: "IELTS Speaking", description: "Parts 1, 2 and 3 practice", icon: "GraduationCap", accent: "from-purple-500 to-purple-600" },
  { id: "travel", label: "Travel", description: "Airports, hotels, directions", icon: "Plane", accent: "from-sky-500 to-sky-600" },
  { id: "daily", label: "Daily Conversation", description: "Small talk and opinions", icon: "MessageCircle", accent: "from-emerald-500 to-emerald-600" },
  { id: "abroad", label: "Study Abroad", description: "Campus and academic life", icon: "Globe", accent: "from-rose-500 to-rose-600" },
];

// Placement questions + results are NOT mocked — the placement flow is wired to
// the live backend (GET /placement/test/, /placement/result/, …). See Phase 8F.

// ── Plans ─────────────────────────────────────────────────────────────────

export const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    emoji: "\uD83C\uDF31",
    price: 120,
    currency: "SDG",
    cadence: "/ month",
    description: "Try the format with a few sessions.",
    sessionsPerMonth: 4,
    features: ["4 live conversation sessions", "Discussion questions before each session", "AI session report after each session", "Email support"],
  },
  {
    id: "regular",
    name: "Regular",
    emoji: "\u2B50",
    price: 220,
    currency: "SDG",
    cadence: "/ month",
    description: "The sweet spot for steady progress.",
    sessionsPerMonth: 8,
    features: ["8 live conversation sessions", "Discussion questions before each session", "AI session report after each session", "Priority booking", "Progress overview"],
    recommended: true,
  },
  {
    id: "intensive",
    name: "Intensive",
    emoji: "\uD83D\uDE80",
    price: 380,
    currency: "SDG",
    cadence: "/ month",
    description: "For learners who want to move fast.",
    sessionsPerMonth: 16,
    features: ["16 live conversation sessions", "Discussion questions before each session", "AI session report after each session", "Priority booking", "Choose your instructor"],
  },
];

// Bank-transfer details are NOT mocked — the Bank Transfer page reads them from
// configurable backend settings (GET /billing/payment-instructions/). No bank
// name is hardcoded anywhere in the frontend.

// ── Payment proofs (admin queue) ─────────────────────────────────────────────

export const paymentProofs: PaymentProof[] = [
  { id: "pp1", studentId: "s2", studentName: "Layla Hassan", planId: "regular", planName: "Regular", amount: 220, currency: "SDG", reference: "TRX-48201", transferDate: "Jun 23, 2026", receiptName: "receipt-layla.jpg", status: "pending", submittedAt: "2 hours ago" },
  { id: "pp2", studentId: "s3", studentName: "Omar Faruk", planId: "starter", planName: "Starter", amount: 120, currency: "SDG", reference: "TRX-48198", transferDate: "Jun 23, 2026", receiptName: "transfer.pdf", status: "pending", submittedAt: "5 hours ago" },
  { id: "pp3", studentId: "s4", studentName: "Mariam Adel", planId: "intensive", planName: "Intensive", amount: 380, currency: "SDG", reference: "TRX-48177", transferDate: "Jun 22, 2026", receiptName: "screenshot.png", status: "approved", submittedAt: "Yesterday" },
  { id: "pp4", studentId: "s5", studentName: "Yousef Bilal", planId: "regular", planName: "Regular", amount: 220, currency: "SDG", reference: "TRX-48150", transferDate: "Jun 21, 2026", receiptName: "receipt-yousef.jpg", status: "rejected", submittedAt: "2 days ago" },
];

// ── Instructors ──────────────────────────────────────────────────────────────

export const instructors: Instructor[] = [
  { id: "i1", name: "Sarah Mitchell", initials: "SM", flag: "\uD83C\uDDFA\uD83C\uDDF8", country: "United States", headline: "Conversation & interview coach", rating: 4.9, sessionsHosted: 312, accent: "from-amber-400 to-orange-500" },
  { id: "i2", name: "James Okoro", initials: "JO", flag: "\uD83C\uDDEC\uD83C\uDDE7", country: "United Kingdom", headline: "Business English specialist", rating: 4.8, sessionsHosted: 248, accent: "from-cyan-400 to-blue-500" },
  { id: "i3", name: "Emma Clarke", initials: "EC", flag: "\uD83C\uDDE8\uD83C\uDDE6", country: "Canada", headline: "IELTS speaking examiner", rating: 5.0, sessionsHosted: 401, accent: "from-purple-400 to-purple-600" },
];

// ── Current demo student ─────────────────────────────────────────────────────

export const currentStudent: Student = {
  id: "s1",
  name: "Mohammed Kamal",
  initials: "MK",
  flag: "\uD83C\uDDF8\uD83C\uDDE6",
  level: "B1",
  goalId: "interview",
  paymentStatus: "approved",
  sessionsRemaining: 6,
  planName: "Regular",
};

// ── Topics (owned by instructors; AI assists) ─────────────────────────────────

export const topics: Topic[] = [
  {
    id: "t1",
    title: "Job Interview Practice",
    category: "Career",
    icon: "Target",
    accent: "from-orange-500 to-orange-600",
    description: "Rehearse common interview questions and tell your story clearly.",
    level: "B1",
    instructorId: "i1",
    published: true,
    subtopics: [
      { id: "st1", title: "Introducing yourself", aiGenerated: true },
      { id: "st2", title: "Talking about strengths and weaknesses", aiGenerated: true },
      { id: "st3", title: "Handling behavioural questions" },
    ],
    questions: [
      { id: "dq1", text: "Tell me a little about yourself and your background.", aiAssisted: true },
      { id: "dq2", text: "What are you most proud of in your career so far?", aiAssisted: true },
      { id: "dq3", text: "Describe a challenge you faced and how you solved it." },
      { id: "dq4", text: "Why do you want to work with our team?", aiAssisted: true },
      { id: "dq5", text: "Where do you see yourself in three years?" },
    ],
    vocabulary: ["motivated", "collaborate", "initiative", "stakeholder", "deadline", "leadership"],
  },
  {
    id: "t2",
    title: "Everyday Small Talk",
    category: "Daily",
    icon: "MessageCircle",
    accent: "from-emerald-500 to-emerald-600",
    description: "Build fluency with casual, natural conversation.",
    level: "A2",
    instructorId: "i2",
    published: true,
    subtopics: [
      { id: "st4", title: "Weekend plans", aiGenerated: true },
      { id: "st5", title: "Talking about the weather and seasons" },
    ],
    questions: [
      { id: "dq6", text: "What did you do last weekend?", aiAssisted: true },
      { id: "dq7", text: "What kind of weather do you enjoy most, and why?" },
      { id: "dq8", text: "Tell me about a hobby you'd like to start.", aiAssisted: true },
    ],
    vocabulary: ["actually", "by the way", "I reckon", "to be honest", "looking forward to"],
  },
  {
    id: "t3",
    title: "Business Meetings",
    category: "Career",
    icon: "Briefcase",
    accent: "from-indigo-500 to-indigo-600",
    description: "Express opinions, agree, disagree and summarise in meetings.",
    level: "B2",
    instructorId: "i2",
    published: true,
    subtopics: [
      { id: "st6", title: "Giving your opinion politely" },
      { id: "st7", title: "Disagreeing without conflict", aiGenerated: true },
    ],
    questions: [
      { id: "dq9", text: "How would you open a meeting you are leading?" },
      { id: "dq10", text: "Describe a time you disagreed with a colleague.", aiAssisted: true },
      { id: "dq11", text: "How do you summarise action items at the end of a call?" },
    ],
    vocabulary: ["agenda", "action item", "follow up", "to align", "deliverable"],
  },
  {
    id: "t4",
    title: "IELTS Speaking Part 2",
    category: "Exam",
    icon: "GraduationCap",
    accent: "from-purple-500 to-purple-600",
    description: "Practise the long-turn cue card with timing and structure.",
    level: "B2",
    instructorId: "i3",
    published: true,
    subtopics: [
      { id: "st8", title: "Structuring a 2-minute answer", aiGenerated: true },
      { id: "st9", title: "Describing a person you admire" },
    ],
    questions: [
      { id: "dq12", text: "Describe a place you would like to visit. (Cue card)", aiAssisted: true },
      { id: "dq13", text: "Talk about a skill you learned recently." },
      { id: "dq14", text: "Describe a memorable journey you took.", aiAssisted: true },
    ],
    vocabulary: ["memorable", "breathtaking", "in retrospect", "as far as I'm concerned"],
  },
  {
    id: "t5",
    title: "Travel & Getting Around",
    category: "Travel",
    icon: "Plane",
    accent: "from-sky-500 to-sky-600",
    description: "Navigate airports, hotels and asking for directions.",
    level: "A2",
    instructorId: "i1",
    published: true,
    subtopics: [
      { id: "st10", title: "At the airport check-in", aiGenerated: true },
      { id: "st11", title: "Asking for directions" },
    ],
    questions: [
      { id: "dq15", text: "How would you ask for help finding your gate?", aiAssisted: true },
      { id: "dq16", text: "Describe your ideal holiday destination." },
    ],
    vocabulary: ["boarding pass", "aisle seat", "departure", "itinerary", "check-in"],
  },
  {
    id: "t6",
    title: "Telling a Story",
    category: "Daily",
    icon: "BookOpen",
    accent: "from-rose-500 to-rose-600",
    description: "Use past tenses and connectors to narrate events naturally.",
    level: "B1",
    instructorId: "i3",
    published: false,
    subtopics: [{ id: "st12", title: "Using time connectors", aiGenerated: true }],
    questions: [{ id: "dq17", text: "Tell me about an event that changed your routine.", aiAssisted: true }],
    vocabulary: ["meanwhile", "eventually", "all of a sudden", "in the end"],
  },
];

// ── Availability (instructor calendar) ────────────────────────────────────────

const buildSlots = (available: string[]) =>
  ["08:00", "09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"].map(
    (time) => ({ time, available: available.includes(time) })
  );

export const availability: AvailabilityDay[] = [
  { day: 24, slots: buildSlots(["10:00", "14:00", "16:00", "18:00"]) },
  { day: 25, slots: buildSlots(["08:00", "09:00", "17:00", "20:00"]) },
  { day: 26, slots: buildSlots(["14:00", "15:00", "16:00"]) },
  { day: 27, slots: buildSlots(["18:00", "19:00", "20:00", "21:00"]) },
  { day: 30, slots: buildSlots(["09:00", "10:00", "11:00"]) },
];

/** Days in the month that have at least one open slot. */
export const availableDays = new Set(availability.map((d) => d.day));

// ── Bookings (student) ─────────────────────────────────────────────────────────

export const bookings: Booking[] = [
  { id: "b1", topicId: "t1", topicTitle: "Job Interview Practice", instructorId: "i1", instructorName: "Sarah Mitchell", date: "Tomorrow, Jun 25", time: "18:00", durationMinutes: 45, status: "upcoming" },
  { id: "b2", topicId: "t2", topicTitle: "Everyday Small Talk", instructorId: "i2", instructorName: "James Okoro", date: "Jun 20, 2026", time: "16:00", durationMinutes: 45, status: "completed", reportId: "r1" },
  { id: "b3", topicId: "t3", topicTitle: "Business Meetings", instructorId: "i2", instructorName: "James Okoro", date: "Jun 16, 2026", time: "19:00", durationMinutes: 45, status: "completed", reportId: "r1" },
];

// ── AI session report ───────────────────────────────────────────────────────────

export const sessionReport: SessionReport = {
  id: "r1",
  bookingId: "b2",
  topicTitle: "Job Interview Practice",
  instructorName: "Sarah Mitchell",
  date: "Jun 20, 2026",
  durationMinutes: 45,
  overallScore: 82,
  skills: [
    { label: "Pronunciation", value: 78, color: "#3B82F6" },
    { label: "Grammar", value: 85, color: "#6366F1" },
    { label: "Vocabulary", value: 83, color: "#06B6D4" },
    { label: "Fluency", value: 80, color: "#22C55E" },
  ],
  mistakes: [
    { label: "Past tense form", example: "\u201CI goed\u201D \u2192 \u201CI went\u201D" },
    { label: "Article omission", example: "\u201CI am engineer\u201D \u2192 \u201CI am an engineer\u201D" },
    { label: "Preposition choice", example: "\u201Cinterested on\u201D \u2192 \u201Cinterested in\u201D" },
  ],
  recommendations: [
    "Review irregular past-tense verbs before your next session",
    "Practise 3 interview answers aloud, 10 minutes a day",
    "Add 5 of this session's vocabulary words to your active use",
    "Book a follow-up on \u201CBusiness Meetings\u201D to stretch to B2",
  ],
  instructorNote:
    "Mohammed spoke with real confidence and stayed on topic. Focus on article usage and past tense and you'll be comfortably at B2 soon. Great session!",
};

// ── Charts ─────────────────────────────────────────────────────────────────

export const progressTrend = [
  { label: "S1", score: 64 },
  { label: "S2", score: 68 },
  { label: "S3", score: 71 },
  { label: "S4", score: 76 },
  { label: "S5", score: 80 },
  { label: "S6", score: 82 },
];
