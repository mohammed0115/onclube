// MSW server + handlers modelling the Django REST API for integration tests.
// State is in-memory and reset between tests via resetState().
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

const B = "*/api/v1";

interface FlowState {
  approved: boolean;
}
export const state: FlowState = { approved: false };
export function resetState() {
  state.approved = false;
}

const userProfile = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "u1",
  fullName: "Test Student",
  email: "student@example.com",
  role: "student",
  status: "active",
  level: null,
  goalId: null,
  paymentStatus: "none",
  sessionsRemaining: 0,
  rating: null,
  headline: null,
  ...over,
});

function requireBearer(request: Request) {
  return request.headers.get("Authorization")?.startsWith("Bearer ");
}

// Deterministic placement assessment (no pronunciation field — by design).
const placementAssessment = (over: Partial<Record<string, unknown>> = {}) => ({
  cefrLevel: "B1",
  overallConversationScore: 64,
  grammarScore: 70,
  vocabularyScore: 66,
  fluencyScore: 61,
  confidenceScore: 58,
  writtenScore: 68,
  spokenScore: 62,
  spokenCapped: false,
  spokenCeiling: "C1",
  strengths: ["grammar"],
  weaknesses: ["confidence"],
  recommendedFocus: ["Practise speaking aloud every day"],
  recommendedConversationTopics: ["everyday_essentials", "job_interviews"],
  recommendedInstructorDifficulty: "balanced",
  fallbackUsed: true,
  providerName: "heuristic",
  ...over,
});

export const handlers = [
  // ── auth ──
  http.post(`${B}/auth/register/`, async ({ request }) => {
    const body = (await request.json()) as { email: string; fullName: string };
    return HttpResponse.json(userProfile({ email: body.email, fullName: body.fullName }), { status: 201 });
  }),

  http.post(`${B}/auth/token/`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (body.password === "wrong") {
      return HttpResponse.json({ code: "not_authenticated", detail: "No active account" }, { status: 401 });
    }
    return HttpResponse.json({ access: "access-1", refresh: "refresh-1" });
  }),

  http.post(`${B}/auth/token/refresh/`, async ({ request }) => {
    const body = (await request.json()) as { refresh: string };
    if (body.refresh !== "refresh-1") {
      return HttpResponse.json({ code: "token_not_valid", detail: "bad refresh" }, { status: 401 });
    }
    return HttpResponse.json({ access: "access-2" });
  }),

  http.get(`${B}/me/`, ({ request }) => {
    if (!requireBearer(request)) {
      return HttpResponse.json({ code: "not_authenticated", detail: "auth required" }, { status: 401 });
    }
    return HttpResponse.json(userProfile({ paymentStatus: state.approved ? "approved" : "none" }));
  }),

  http.put(`${B}/me/goal/`, async ({ request }) => {
    const body = (await request.json()) as { goalId: string };
    return HttpResponse.json(userProfile({ goalId: body.goalId }));
  }),

  // ── onboarding / billing ──
  http.get(`${B}/onboarding/goals/`, () =>
    HttpResponse.json([{ id: "g1", code: "interview", label: "Job Interviews", description: "Answer with confidence", icon: "Target", accent: "from-orange-500 to-orange-600" }])
  ),

  http.get(`${B}/billing/bank-account/`, () =>
    HttpResponse.json({
      providerKey: "bank_of_khartoum",
      providerName: "Bank of Khartoum",
      transferMethod: "Bankak",
      bankName: "Bank of Khartoum",
      accountName: "OneClub Education",
      accountNumber: "1234567890",
      iban: null,
      instructions: "Open Bankak and transfer the exact amount, using your full name as reference.",
      currency: "SDG",
      isActive: true,
      displayOrder: 1,
    })
  ),

  http.get(`${B}/billing/providers/`, () =>
    HttpResponse.json([
      {
        providerKey: "bank_of_khartoum",
        providerName: "Bank of Khartoum",
        transferMethod: "Bankak",
        bankName: "Bank of Khartoum",
        accountName: "OneClub Education",
        accountNumber: "1234567890",
        iban: null,
        instructions: "Open Bankak and transfer.",
        currency: "SDG",
        isActive: true,
        displayOrder: 1,
      },
    ])
  ),

  // Backward-compatible alias (subset shape).
  http.get(`${B}/billing/payment-instructions/`, () =>
    HttpResponse.json({
      bankName: "Bank of Khartoum",
      accountName: "OneClub Education",
      accountNumber: "1234567890",
      iban: null,
      transferMethod: "Bankak",
      instructions: "Open Bankak and transfer the exact amount, using your full name as reference.",
    })
  ),

  http.get(`${B}/billing/plans/`, () =>
    HttpResponse.json([
      { id: "p1", code: "regular", name: "Regular", emoji: "⭐", price: 220, currency: "SAR", cadence: "/ month", description: "Steady progress", sessionsPerMonth: 8, features: ["8 sessions"], recommended: true },
    ])
  ),

  http.post(`${B}/billing/payment-proof/`, async ({ request }) => {
    // Multipart — assert the transaction number came through.
    const form = await request.formData();
    const txn = form.get("transactionNumber");
    return HttpResponse.json(
      {
        id: "pp1",
        planName: "Regular",
        amount: 220,
        currency: "SAR",
        transactionNumber: txn,
        transferDatetime: "2026-06-25T10:00:00Z",
        receiptName: "receipt.jpg",
        status: "pending_review",
        submittedAt: "2026-06-25T10:01:00Z",
        retainUntil: "2031-06-25T10:01:00Z",
        senderName: null,
        receiverName: null,
        reviewedAt: null,
        reviewNote: null,
        receiptUrl: "https://files.local/receipts/pp1.jpg",
      },
      { status: 201 }
    );
  }),

  http.get(`${B}/student/subscription/`, () => {
    if (!state.approved) {
      return HttpResponse.json({ code: "not_found", detail: "No active subscription." }, { status: 404 });
    }
    return HttpResponse.json({
      id: "sub1",
      planId: "p1",
      planName: "Regular",
      status: "active",
      startedAt: "2026-06-25T11:00:00Z",
      expiresAt: "2026-07-25T11:00:00Z",
      sessionsRemaining: 8,
    });
  }),

  // ── placement (Phase 8F) ──
  http.get(`${B}/placement/test/`, () =>
    HttpResponse.json({
      written: [
        { id: "wq1", type: "written", prompt: "Describe your typical morning routine.", skill: "grammar", cefrBand: "B1", order: 1 },
      ],
      spoken: [
        { id: "sq1", type: "spoken", prompt: "Why are you learning English?", skill: "fluency", cefrBand: "B1", order: 1 },
      ],
    })
  ),

  http.post(`${B}/placement/start/`, () =>
    HttpResponse.json(
      { id: "att1", status: "in_progress", version: 1, goalId: null, startedAt: "2026-06-25T10:00:00Z", submittedAt: null, assessedAt: null, fallbackUsed: false, providerName: null },
      { status: 201 }
    )
  ),

  http.get(`${B}/placement/status/`, () =>
    HttpResponse.json({ status: "not_started", attemptId: null, writtenComplete: false, spokenComplete: false, assessed: false, canSubmit: false })
  ),

  http.post(`${B}/placement/written-answers/`, () =>
    HttpResponse.json({ id: "att1", status: "in_progress", version: 1, goalId: null, startedAt: "2026-06-25T10:00:00Z", submittedAt: null, assessedAt: null, fallbackUsed: false, providerName: null })
  ),

  http.post(`${B}/placement/spoken-transcripts/`, () =>
    HttpResponse.json({ id: "att1", status: "in_progress", version: 1, goalId: null, startedAt: "2026-06-25T10:00:00Z", submittedAt: null, assessedAt: null, fallbackUsed: false, providerName: null })
  ),

  http.post(`${B}/placement/submit/`, () => HttpResponse.json(placementAssessment())),

  http.get(`${B}/placement/result/`, () => HttpResponse.json(placementAssessment())),

  // ── admin ──
  http.get(`${B}/admin/payment-proofs/`, () =>
    HttpResponse.json([
      { id: "pp1", studentName: "Test Student", planName: "Regular", amount: 220, currency: "SAR", status: "pending_review", submittedAt: "2026-06-25T10:01:00Z" },
    ])
  ),

  http.post(`${B}/admin/payment-proofs/:id/approve/`, ({ params }) => {
    state.approved = true;
    return HttpResponse.json({
      proofId: params.id,
      subscriptionId: "sub1",
      subscriptionStatus: "active",
      sessionsRemaining: 8,
      startedAt: "2026-06-25T11:00:00Z",
      expiresAt: "2026-07-25T11:00:00Z",
    });
  }),

  // ── student scheduling ──
  http.get(`${B}/student/dashboard/`, () =>
    HttpResponse.json({
      sessionsRemaining: state.approved ? 8 : 0,
      sessionsCompleted: 0,
      paymentStatus: state.approved ? "approved" : "none",
      level: "B1",
      latestScore: null,
      nextSession: null,
      recentSessions: [],
      progressTrend: [],
    })
  ),

  http.get(`${B}/student/topics/`, () =>
    HttpResponse.json([
      { id: "t1", title: "Job Interview Practice", category: "Career", level: "B1", description: "Rehearse interview questions", instructorId: "i1", instructorName: "Sarah Mitchell", instructorHeadline: "Coach", samplePrompts: [{ text: "Tell me about yourself." }], subtopics: [], mode: "preview" },
    ])
  ),

  http.get(`${B}/instructors/:id/availability/`, () =>
    HttpResponse.json([{ id: "slot1", instructorId: "i1", startAt: "2026-06-30T18:00:00Z", durationMinutes: 45, status: "open" }])
  ),

  http.post(`${B}/student/bookings/`, async ({ request }) => {
    const body = (await request.json()) as { topicId: string; slotId: string };
    return HttpResponse.json(
      { bookingId: "b1", slotId: body.slotId, topicId: body.topicId, scheduledAt: "2026-06-30T18:00:00Z", status: "upcoming", sessionsRemaining: 7 },
      { status: 201 }
    );
  }),

  // ── sessions / reports ──
  http.post(`${B}/sessions/:id/join/`, ({ params }) =>
    HttpResponse.json({ sessionId: params.id, provider: "stub", agoraAppId: "stub-app-id", channel: `session-${params.id}`, agoraToken: "stub-token", uid: "u1", expiresAt: "2026-06-30T19:00:00Z" })
  ),

  http.get(`${B}/student/topics/:id/`, ({ params }) =>
    HttpResponse.json({
      id: params.id, title: "Job Interview Practice", category: "Career", level: "B1",
      description: "Rehearse interview questions", instructorId: "i1", instructorName: "Sarah Mitchell",
      instructorHeadline: "Coach", samplePrompts: [{ text: "Tell me about yourself." }],
      subtopics: [{ id: "st1", title: "Introducing yourself", ai_generated: true }],
      mode: "full", vocabulary: ["motivated", "collaborate"],
      questions: [{ id: "q1", text: "What are you most proud of?", aiAssisted: true, approved: true }],
    })
  ),

  http.get(`${B}/sessions/:id/`, ({ params }) =>
    HttpResponse.json({
      id: params.id, bookingId: "b1", topicTitle: "Job Interview Practice", status: "scheduled",
      scheduledAt: "2026-06-30T18:00:00Z", startedAt: null, endedAt: null,
      questions: [{ id: "q1", text: "Tell me about yourself.", aiAssisted: false, approved: true }],
      vocabulary: ["motivated"], studentNotes: null,
    })
  ),

  http.post(`${B}/sessions/:id/end/`, ({ params }) =>
    HttpResponse.json({ sessionId: params.id, status: "completed", startedAt: null, endedAt: "x", reportPending: true })
  ),

  http.get(`${B}/instructor/dashboard/`, () =>
    HttpResponse.json({
      upcomingSessions: 2, activeStudents: 5, topicsOwned: 1, averageRating: 4.9,
      todaySessions: [{ id: "b1", topicTitle: "Job Interview Practice", instructorName: "Sarah", scheduledAt: "2026-06-30T18:00:00Z", durationMinutes: 45, status: "upcoming", reportId: null }],
      topics: [{ id: "t1", title: "Job Interview Practice", published: true, level: "B1" }],
      weekly: { sessions_hosted: 14 },
    })
  ),

  http.get(`${B}/admin/dashboard/`, () =>
    HttpResponse.json({
      pendingPayments: 1, activeMembers: 12, instructors: 3, revenue: 1840, currency: "SAR",
      pendingProofs: [{ id: "pp1", studentName: "Test Student", planName: "Regular", amount: 220, currency: "SAR", status: "pending_review", submittedAt: "2026-06-25T10:01:00Z" }],
      recentActivity: [{ actor: "Test Student", action: "submitted payment TRX-1", when: "2026-06-25T10:01:00Z" }],
    })
  ),

  http.post(`${B}/admin/payment-proofs/:id/reject/`, ({ params }) =>
    HttpResponse.json({ proofId: params.id, status: "rejected", reviewedById: "admin1" })
  ),

  http.get(`${B}/notifications/`, () =>
    HttpResponse.json([{ id: "n1", type: "booking_confirmed", title: "Booking confirmed", read: false, createdAt: "2026-06-25T10:00:00Z", body: "See you soon", data: null }])
  ),

  http.get(`${B}/reports/:id/`, ({ params }) =>
    HttpResponse.json({
      id: params.id,
      sessionId: "s1",
      bookingId: "b1",
      topicTitle: "Job Interview Practice",
      instructorName: "Sarah Mitchell",
      sessionDate: "2026-06-30T18:00:00Z",
      durationMinutes: 45,
      status: "ready",
      overallScore: 82,
      skills: [{ label: "Fluency", value: 80, color: "#10B981" }],
      mistakes: [{ label: "Past tense", example: "I goed → I went" }],
      recommendations: ["Review irregular verbs"],
      vocabulary: ["motivated"],
      instructorNote: "Great session!",
    })
  ),
];

export const server = setupServer(...handlers);
