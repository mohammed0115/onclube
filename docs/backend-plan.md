# OneClub — Backend Planning Document

**Status:** Planning only. No backend code is written here. This document is derived from the
approved frontend MVP (20 screens, `src/types/index.ts`, `src/data/mockData.ts`).

**Scope guardrails (per request):**
- No backend implementation in this document.
- No frontend UI changes.
- No new product features — the backend exists only to serve the existing 20 screens.

**Conventions used below:**
- All endpoints are REST, JSON over HTTPS, prefixed `/api/v1`.
- Auth via bearer token (JWT access + refresh). Role is carried in the token claims.
- `404` = not found / not visible to caller, `401` = unauthenticated, `403` = authenticated but
  not permitted, `409` = business-rule conflict (e.g. double booking), `422` = validation error.
- IDs are server-generated strings (matching the frontend's string-id assumption).
- Timestamps are ISO-8601 UTC; the frontend renders human-readable strings client-side.

---

## 1. Screen-to-API Mapping

> Legend — every screen lists: **APIs**, **Request**, **Response**, **Loading**, **Empty**, **Error**.
> Pure-navigation / static-marketing screens are noted as needing no API.

### Public

#### 01 — Landing (`/`)
- **APIs:** `GET /public/instructors?featured=true` (the avatars + ratings strip). Static marketing
  copy needs no API.
- **Request:** none (optional `?featured=true&limit=3`).
- **Response:** `[{ id, name, initials, flag, country, headline, rating, sessionsHosted, accent }]`.
- **Loading:** skeleton on the instructor strip only; page shell renders immediately.
- **Empty:** hide the instructor strip if list is empty (do not block the page).
- **Error:** silently fall back to no strip; the marketing page must still render.

#### 02 — Login (`/login`)
- **APIs:** `POST /auth/login`.
- **Request:** `{ email, password }` (the role selector is a demo affordance; real role comes from the
  server's user record, not the client).
- **Response:** `{ accessToken, refreshToken, user: { id, name, role, ... }, onboarding: { goalSet, placementDone, paymentStatus } }` — `onboarding` lets the client route to the right next screen.
- **Loading:** disable submit + spinner on button.
- **Empty:** n/a.
- **Error:** `401` invalid credentials → inline form error; `429` rate limited → "try again shortly".

#### 03 — Register (`/register`)
- **APIs:** `POST /auth/register`.
- **Request:** `{ fullName, email, password }`.
- **Response:** `{ accessToken, refreshToken, user }` (role defaults to `student`).
- **Loading:** disable submit + spinner.
- **Empty:** n/a.
- **Error:** `409` email already registered; `422` weak password / invalid email → field errors.

### Onboarding

#### 04 — Goal Selection (`/onboarding/goal`)
- **APIs:** `GET /onboarding/goals`, `PUT /me/goal`.
- **Request:** GET none; PUT `{ goalId }`.
- **Response:** GET `Goal[]` (`id, label, description, icon, accent`); PUT `{ goalId }` (echo) + updated profile.
- **Loading:** grid skeleton while goals load; "Continue" disabled until a goal is selected and saved.
- **Empty:** goals are server-seeded reference data → realistically never empty; show retry if it is.
- **Error:** GET failure → retry banner; PUT failure → toast, keep selection.

#### 05 — AI Placement Test (`/onboarding/placement-test`)
- **APIs:** `GET /placement/test` (questions, **without** the `correct` field), `POST /placement/test/submit`.
- **Request:** GET none; POST `{ answers: [{ questionId, selectedIndex }] }`.
- **Response:** GET `[{ id, prompt, options[], skill }]`; POST `{ resultId }` (then redirect to result).
- **Loading:** question card skeleton; "Next/Submit" disabled until current answer chosen.
- **Empty:** if no question bank configured → block with "test unavailable" message.
- **Error:** submit failure → keep answers in client state, allow retry without re-answering.

> Security note: the `correct` index must **never** be sent to the client. Scoring happens server-side.

#### 06 — Placement Result (`/onboarding/placement-result`)
- **APIs:** `GET /placement/result/latest` (or `GET /placement/result/:id`).
- **Request:** none.
- **Response:** `{ level, levelLabel, summary, skills: [{ label, value, color }] }`.
- **Loading:** skeleton on score ring + skill bars.
- **Empty:** if student hasn't taken the test → redirect to `/onboarding/placement-test`.
- **Error:** retry banner. "Retake" calls the test endpoints again.

### Billing

#### 07 — Pricing (`/billing/pricing`)
- **APIs:** `GET /billing/plans`, `POST /billing/checkout/select` (records chosen plan, creates a draft order).
- **Request:** GET none; POST `{ planId }`.
- **Response:** GET `Plan[]`; POST `{ orderId, planId }`.
- **Loading:** plan-card skeletons; "Continue" disabled until a plan is selected.
- **Empty:** plans are reference data; show retry if unexpectedly empty.
- **Error:** POST failure → toast, stay on page.

#### 08 — Bank Transfer (`/billing/bank-transfer`)
- **APIs:** `GET /billing/bank-account`, `GET /billing/order/:orderId` (order summary).
- **Request:** none.
- **Response:** bank-account `{ bankName, accountName, accountNumber, iban, branch }`; order `{ planName, sessionsPerMonth, amount, currency }`.
- **Loading:** skeleton on bank details + order summary.
- **Empty:** if no draft order exists → redirect back to pricing.
- **Error:** retry banner.

#### 09 — Payment Proof (`/billing/payment-proof`)
- **APIs:** `GET /billing/order/:orderId` (prefill plan + amount), `POST /billing/upload-url` (presigned receipt upload), `POST /billing/payment-proof`.
- **Request:** upload-url `{ filename, contentType }`; proof `{ orderId, planId, amount, reference, transferDate, receiptFileId }`.
- **Response:** upload-url `{ uploadUrl, receiptFileId }`; proof `{ id, status: "pending", submittedAt }`.
- **Loading:** upload progress on file; "Submit" disabled until file uploaded + required fields valid.
- **Empty:** n/a.
- **Error:** `422` bad file type/size → field error; upload failure → allow re-pick; duplicate submission `409`.

#### 10 — Payment Under Review (`/billing/under-review`)
- **APIs:** `GET /billing/payment-proof/latest` (poll or refresh for status).
- **Request:** none.
- **Response:** `{ id, status, planName, submittedAt }`.
- **Loading:** status-badge skeleton.
- **Empty:** if no proof submitted → redirect to pricing.
- **Error:** retry banner; on `status === approved` client routes to `/student`.

> The "Simulate admin approval" button is a demo-only shim and has **no** production endpoint.

### Student

#### 11 — Student Dashboard (`/student`)
- **APIs:** `GET /student/dashboard` (aggregate) — backed by stats + `GET /student/bookings`, `GET /student/progress`, `GET /me`.
- **Request:** none.
- **Response:** `{ stats: { sessionsRemaining, sessionsCompleted, latestScore, level }, nextSession: Booking|null, recentSessions: Booking[], progressTrend: [{ label, score }], paymentStatus }`.
- **Loading:** stat-card + chart skeletons.
- **Empty:** no bookings → "no sessions yet, browse topics"; no `nextSession` → hide that card; no reports → latestScore shows "—".
- **Error:** retry banner. **Gating:** if `paymentStatus !== approved`, render the lock alert and the
  "Locked until approval" CTA (no booking calls allowed).

#### 12 — Book a Session (`/student/book`)
- **APIs:** `GET /student/topics` (published topics, grouped by category).
- **Request:** optional `?category=`.
- **Response:** `Topic[]` (list view fields: `id, title, category, icon, accent, description, level`).
- **Loading:** topic-card skeletons.
- **Empty:** no published topics → "no topics available yet".
- **Error:** retry banner. **Gating:** if not `approved`, return/render the lock screen; server must also
  reject any downstream booking attempt (defense in depth — see Business Rules).

#### 13 — Questions Preview (`/student/questions/:id`)
- **APIs:** `GET /student/topics/:id` (questions + vocab + subtopics + instructor), `GET /instructor/:id/availability` (open slots), `POST /student/bookings` (book the chosen slot).
- **Request:** GET none; POST `{ topicId, instructorId, slotId }` (slot identifies day+time).
- **Response (pre-booking, `mode:"preview"`):** `{ title, level, description, samplePrompts[], subtopics[], instructor }` — **no** full `questions[]`/`vocabulary[]`. **Response (post-booking, `mode:"full"`):** adds `questions[]` (approved only) + `vocabulary[]`. availability `AvailabilityDay[]`; booking `{ id, status: "upcoming", date, time, durationMinutes }`.
- **Loading:** detail skeleton; "Book {time}" disabled until a slot is selected.
- **Empty:** no open slots → "no times available, check back later".
- **Error:** `409` slot already taken (double-booking) → refresh slots + toast; `403` if not approved.

> Visibility rule (decision 3): pre-booking the student sees only `description` + `samplePrompts`.
> The full AI-generated `questions[]` (approved) and `vocabulary[]` are returned only after a
> confirmed booking. Gating is server-side (see Business Rule 4).

#### 14 — Live Session Room (`/student/session/:id`)
- **APIs:** `GET /sessions/:id` (room context), `POST /sessions/:id/join` (server-minted Agora token), `POST /sessions/:id/notes` (autosave personal notes), `POST /sessions/:id/end`.
- **Request:** notes `{ text }`; join none; end none.
- **Response:** session `{ bookingId, topicTitle, questions[], vocabulary[], status, startsAt }`; join `{ agoraAppId, channel, agoraToken, uid, expiresAt }`; end `{ status: "completed", reportPending: true }`.
- **Loading:** room shell + media-connect spinner; tab content skeletons.
- **Empty:** notes start empty (placeholder text).
- **Error:** join failure → "reconnect" CTA; `403` if caller isn't the booked student/instructor;
  `409` if session not yet startable / already ended.

> Video (decision 4): the Agora RTC token is minted **server-side** at join and scoped to this
> channel + participant. The frontend never generates tokens; it passes `agoraToken`/`channel`/`uid`
> straight to the Agora SDK. Tokens are short-lived (`expiresAt`); rejoin re-mints.

#### 15 — AI Report (`/student/report/:id`)
- **APIs:** `GET /student/reports/:id` (or `GET /sessions/:id/report`).
- **Request:** none.
- **Response:** `{ id, bookingId, topicTitle, instructorName, date, durationMinutes, overallScore, skills[], mistakes[], recommendations[], instructorNote }`.
- **Loading:** banner + chart skeletons. If report still generating → "report in progress" poll state.
- **Empty:** report not ready (`202`/pending) → show generating state, poll.
- **Error:** `404` if no report for a non-completed session; retry banner.

### Instructor

#### 16 — Instructor Dashboard (`/instructor`)
- **APIs:** `GET /instructor/dashboard` — backed by `GET /instructor/sessions?date=today`, `GET /instructor/topics`, instructor stats.
- **Request:** none.
- **Response:** `{ stats: { upcomingSessions, activeStudents, topicsOwned, averageRating }, todaySessions: Booking[], topics: Topic[], weekly: { sessionsHosted, hoursTaught, newReviews } }`.
- **Loading:** stat + list skeletons.
- **Empty:** "No sessions scheduled" when `todaySessions` empty; "no topics yet" prompt.
- **Error:** retry banner.

#### 17 — Topic & AI Question Builder (`/instructor/topics`)
- **APIs:** `POST /instructor/topics` (create draft), `PUT /instructor/topics/:id`, `POST /ai/topics/:id/suggest` (generate subtopics + questions), `POST /instructor/topics/:id/publish`.
- **Request:** create/update `{ title, category, level, description, subtopics[], questions[], vocabulary[] }`; suggest `{ context }` → returns suggestions; publish none.
- **Response:** topic object; suggest `{ subtopics: [{ id, title, aiGenerated:true }], questions: [{ id, text, aiAssisted:true }] }`; publish `{ published: true }`.
- **Loading:** "Generate suggestions" → button spinner + suggestion-area skeleton; "Publish" spinner.
- **Empty:** subtopics/questions empty → dashed "Nothing yet" placeholders; suggestions hidden until generated.
- **Error:** AI generate failure → "couldn't generate, try again" (instructor can still add manually);
  publish blocked (`422`) if required fields missing.

> Rule: AI suggestions are **proposals**. They only persist on the topic when the instructor explicitly
> accepts them (instructor must approve AI-generated questions — see Business Rules).

#### 18 — Availability (`/instructor/availability`)
- **APIs:** `GET /instructor/availability`, `PUT /instructor/availability`.
- **Request:** PUT `{ days: [{ day, slots: [{ time, available }] }] }`.
- **Response:** `AvailabilityDay[]`.
- **Loading:** calendar skeleton; "Save changes" spinner; disable save while in-flight.
- **Empty:** a month with no open slots renders all-gray (valid state, not an error).
- **Error:** save failure → toast, keep local edits; `409` if a slot now has a booking and can't be freed.

### Admin

#### 19 — Admin Dashboard (`/admin`)
- **APIs:** `GET /admin/dashboard` — backed by `GET /admin/payment-proofs?status=pending`, platform stats.
- **Request:** none.
- **Response:** `{ stats: { pendingPayments, activeMembers, instructors, revenue }, pendingProofs: PaymentProof[], recentActivity: [{ actor, action, when, tone }] }`.
- **Loading:** stat + list skeletons.
- **Empty:** "Queue is clear 🎉" when no pending proofs.
- **Error:** retry banner.

#### 20 — Payment Approval (`/admin/payments`)
- **APIs:** `GET /admin/payment-proofs` (queue), `GET /admin/payment-proofs/:id` (detail + receipt URL), `POST /admin/payment-proofs/:id/approve`, `POST /admin/payment-proofs/:id/reject`, `POST /admin/payment-proofs/:id/reopen`.
- **Request:** approve/reject `{ note? }`; reopen none.
- **Response:** proof list/detail with `status`, `receiptUrl` (signed, time-limited); decision endpoints return updated proof + side effect (`approve` activates the student's subscription).
- **Loading:** queue + detail skeletons; decision buttons spinner; optimistic status badge.
- **Empty:** queue empty → "queue is clear".
- **Error:** `409` if proof already decided by another admin (stale state) → refresh; `403` if not admin.

---

## 2. Data Models

> Field types: `string` IDs, `enum` where listed, `decimal` for money, `datetime` ISO-8601, `bool`.
> Relationships noted as FKs. These extend the frontend types in `src/types/index.ts` with the
> persistence/audit fields a real backend needs.

### User
Base identity + auth for all roles.
```
id            string PK
fullName      string
email         string  unique
passwordHash  string
role          enum(student|instructor|admin)
status        enum(active|suspended)        default active
createdAt     datetime
updatedAt     datetime
lastLoginAt   datetime nullable
```
- One-to-one with StudentProfile **or** InstructorProfile depending on role.

### StudentProfile
```
id                 string PK
userId             FK User  unique
level              enum CEFR(A1..C2) nullable   // set after placement
goalId             FK Goal  nullable
placementResultId  FK PlacementResult nullable
activeSubscriptionId FK SubscriptionPlan(instance) nullable
paymentStatus      enum(none|pending|approved|rejected) default none
sessionsRemaining  int default 0
createdAt/updatedAt datetime
```

### InstructorProfile
```
id              string PK
userId          FK User  unique
initials        string
flag            string
country         string
headline        string
rating          decimal  default 0     // derived/aggregate
sessionsHosted  int      default 0     // derived/aggregate
accent          string                 // UI gradient class
bio             text nullable
createdAt/updatedAt datetime
```

### PlacementTest
Two concerns: the **question bank** and the **attempt/result**.
```
PlacementTestQuestion
  id          string PK
  prompt      string
  options     string[]          // ordered
  correct     int               // SERVER-ONLY, never serialized to students
  skill       enum(grammar|vocabulary|comprehension|usage)
  active      bool

PlacementAttempt
  id          string PK
  studentId   FK StudentProfile
  answers     json [{ questionId, selectedIndex }]
  submittedAt datetime

PlacementResult              // == frontend PlacementResult
  id          string PK
  attemptId   FK PlacementAttempt
  studentId   FK StudentProfile
  level       enum CEFR
  levelLabel  string
  summary     text
  skills      json [{ label, value, color }]
  createdAt   datetime
```

### SubscriptionPlan
Catalog definition **and** a per-student subscription instance.
```
Plan (catalog / reference)
  id              string PK     // starter|regular|intensive
  name            string
  emoji           string
  price           decimal
  currency        string
  cadence         string        // "/ month"
  description      string
  sessionsPerMonth int
  features        string[]
  recommended     bool
  active          bool

Subscription (per student instance)
  id              string PK
  studentId       FK StudentProfile
  planId          FK Plan
  status          enum(pending|active|expired|cancelled)
  startedAt       datetime nullable   // set on admin approval
  expiresAt       datetime nullable   // startedAt + cadence; admin-extendable
  sessionsRemaining int                // NO rollover — forfeited on expiry (decision 1)
  extendedBy      FK User(admin) nullable   // last admin to manually extend
  extendedAt      datetime nullable
  createdAt/updatedAt datetime
```
- **No rollover (decision 1):** when `status → expired`, `sessionsRemaining` is forfeited; it is not
  carried forward. Only `PATCH /admin/subscriptions/:id` can extend `expiresAt` / top up sessions.

### PaymentProof
```
id           string PK
studentId    FK StudentProfile
subscriptionId FK Subscription nullable   // draft order link
planId       FK Plan
planName     string               // denormalized snapshot
amount       decimal
currency     string
reference    string               // bank TRX ref
transferDate date
receiptFileId FK File (object storage)
receiptName  string
status       enum(pending|approved|rejected)  default pending
reviewedBy   FK User(admin) nullable
reviewNote   text nullable
submittedAt  datetime
reviewedAt   datetime nullable
retainUntil  datetime              // submittedAt + 5 years (decision 5)
```
- **Retention (decision 5):** proofs and their receipt files are kept until `retainUntil`
  (`submittedAt` + 5 years). Admins view/download via signed URL; students read their own history via
  `GET /student/billing/history`. Purge job only removes records past `retainUntil`.

### AvailabilitySlot
Normalized one-row-per-slot (the frontend's `AvailabilityDay.slots[]` flattened).
```
id            string PK
instructorId  FK InstructorProfile
startAt       datetime          // absolute date+time (replaces day+"08:00")
durationMinutes int default 45
status        enum(open|booked|blocked)  default open
bookingId     FK Booking nullable
createdAt/updatedAt datetime
unique(instructorId, startAt)   // prevents duplicate slots
```

### Topic
Owned by instructor; AI assists.
```
id           string PK
title        string
category     string
icon         string
accent       string
description  text
level        enum CEFR
instructorId FK InstructorProfile
vocabulary   string[]
samplePrompts string[]            // shown pre-booking; full questions stay gated (decision 3)
published    bool default false
createdAt/updatedAt datetime
```

### Subtopic
```
id          string PK
topicId     FK Topic
title       string
aiGenerated bool default false   // true once instructor accepted an AI suggestion
order       int
```

### Question  (DiscussionQuestion)
```
id          string PK
topicId     FK Topic
text        string
aiAssisted  bool default false
approved    bool default false   // instructor must approve before student-visible
order       int
createdAt   datetime
```
- AI-suggested questions are created with `approved=false` and only become visible after the
  instructor approves (Business Rule). A pending-suggestion staging area may live as
  `status=suggested` rows or a separate `QuestionSuggestion` table — implementation choice.

### Booking
```
id              string PK
studentId       FK StudentProfile
topicId         FK Topic
topicTitle      string            // snapshot
instructorId    FK InstructorProfile
instructorName  string            // snapshot
slotId          FK AvailabilitySlot
scheduledAt     datetime
durationMinutes int default 45
status          enum(upcoming|completed|cancelled)
reportId        FK AIReport nullable
cancelledAt     datetime nullable
creditRefunded  bool default false    // true if cancelled >24h out (decision 2)
createdAt/updatedAt datetime
unique(slotId)                    // hard guard against double booking
```
- **Cancellation (decision 2):** on cancel, the slot is released and `creditRefunded` is set by the
  server based on whether `cancelledAt` is more than 24h before `scheduledAt`. No monetary refund is
  modeled here — money refunds are manual admin actions, tracked out-of-band.

### Session
The live-room runtime record for a booking.
```
id            string PK
bookingId     FK Booking unique
status        enum(scheduled|live|completed|cancelled)
startedAt     datetime nullable
endedAt       datetime nullable
roomId        string nullable      // Agora channel name (decision 4)
studentNotes  text nullable
createdAt/updatedAt datetime
```
- **Video (decision 4):** rooms run on **Agora**. `roomId` is the Agora channel name. RTC tokens are
  minted **server-side** per participant at join time and are never generated by the frontend.

### SessionTranscript
Input to AI report generation.
```
id          string PK
sessionId   FK Session unique
content     text/json            // turns: [{ speaker, text, ts }]
source      enum(asr|manual)
createdAt   datetime
```

### AIReport  (SessionReport)
```
id              string PK
sessionId       FK Session
bookingId       FK Booking
studentId       FK StudentProfile
topicTitle      string
instructorName  string
date            datetime
durationMinutes int
overallScore    int
skills          json [{ label, value, color }]
mistakes        json [{ label, example }]
recommendations string[]
instructorNote  text             // human, kept distinct from AI output
status          enum(pending|ready|failed) default pending
generatedAt     datetime nullable
```

### Notification
(Implied by "we'll notify you" on Under-Review + activity feeds.)
```
id          string PK
userId      FK User
type        enum(payment_approved|payment_rejected|booking_confirmed|session_reminder|report_ready)
title       string
body        string
read        bool default false
data        json nullable        // deep-link ids
createdAt   datetime
```

---

## 3. Roles & Permissions

| Capability | Student | Instructor | Admin |
|---|---|---|---|
| Register / login / manage own account | ✅ | ✅ | ✅ |
| Take placement test, view own result | ✅ | ❌ | ❌ |
| Set goal / view own profile | ✅ | own profile | own profile |
| View plans & bank account | ✅ | — | ✅ |
| Submit payment proof | ✅ | ❌ | ❌ |
| View own payment status | ✅ | ❌ | view all |
| View own payment/billing history + receipts | ✅ (own) | ❌ | view all |
| Cancel own booking (24h credit window) | ✅ (own) | ❌ | ❌ |
| Extend / top up a subscription | ❌ | ❌ | ✅ |
| Record a manual money refund | ❌ | ❌ | ✅ |
| Browse published topics | ✅ (if approved) | own + published | all |
| View topic questions/vocab | ✅ after booking | own topics | all |
| Book a session | ✅ (if approved + slots) | ❌ | ❌ |
| Join live session | ✅ (own booking) | ✅ (assigned) | ❌ (audit only) |
| Save personal session notes | ✅ (own) | ✅ (own) | ❌ |
| End session | ✅/✅ (participant) | ✅ | ❌ |
| View AI report | ✅ (own) | ✅ (sessions they hosted) | all |
| Create/edit/publish topics | ❌ | ✅ (own) | ✅ |
| Request AI suggestions | ❌ | ✅ | ✅ |
| Approve AI-generated questions | ❌ | ✅ (own topics) | ✅ |
| Manage availability | ❌ | ✅ (own) | ✅ |
| Approve / reject / reopen payment proofs | ❌ | ❌ | ✅ |
| Activate subscriptions | ❌ | ❌ | ✅ (via approval) |
| View platform stats / revenue | ❌ | own stats | ✅ |
| Manage users (suspend, role change) | ❌ | ❌ | ✅ |

**Ownership rules (enforced server-side, not just by role):**
- A student may only read/write their own profile, bookings, reports, notes.
- An instructor may only mutate topics, availability, and sessions they own/are assigned to.
- Admin endpoints require the `admin` claim **and** server-side role check on every request.

---

## 4. Business Rules

These are invariants enforced in the backend, independent of UI gating (the UI gating is convenience;
the server is the source of truth).

1. **Student cannot book before payment approval.**
   `POST /student/bookings` → reject with `403`/`409` unless the student has an `active` subscription
   (`Subscription.status == active` and not expired). UI lock is mirror-only.

2. **Payment proof must be manually reviewed.**
   `PaymentProof.status` may transition `pending → approved|rejected` **only** via an admin action
   (`reviewedBy` is required). No auto-approval path exists in production. Approval is the single
   place that flips a `Subscription` to `active`, sets `startedAt`/`expiresAt`, and seeds
   `sessionsRemaining = plan.sessionsPerMonth`.

3. **Instructor must approve AI-generated questions.**
   AI suggestions are persisted as `approved=false` (or staged). A question is student-visible only
   when `approved=true`, set exclusively by the owning instructor (or admin). AI output never
   auto-publishes.

4. **Questions visible to student only after booking confirmation.** *(decision 3)*
   Pre-booking, `GET /student/topics/:id` returns only the topic **description** and a small set of
   **sample prompts** (`samplePrompts[]`). The full AI-generated discussion question set
   (`questions[]`, `approved=true` only) and `vocabulary[]` are returned **only** when the requesting
   student has a confirmed (`upcoming`/`completed`) booking for that topic. Enforced server-side; the
   response shape changes based on booking status (`preview` vs `full`).

5. **AI report generated only after session completion.**
   `AIReport` creation is triggered only on `Session.status → completed`. Requesting a report before
   completion returns `404`/`202 (pending)`. Generation pipeline: `SessionTranscript` → AI →
   `AIReport(status=pending → ready)`. `Booking.reportId` is set when `ready`.

6. **Session booking must prevent double booking.**
   Enforced at two layers: DB `unique(slotId)` on `Booking` + `AvailabilitySlot.status` transition
   `open → booked` inside a single transaction (or `SELECT ... FOR UPDATE`). Concurrent attempts on
   the same slot → one succeeds, the other gets `409 slot_unavailable`. Same guard prevents an
   instructor being booked twice at the same `startAt`.

7. **Expired subscription blocks new bookings; no rollover.** *(decision 1)*
   Booking requires `Subscription.status == active`, `expiresAt > now`, and `sessionsRemaining > 0`.
   Each confirmed booking decrements `sessionsRemaining`; reaching 0 or passing `expiresAt` blocks
   new bookings (`409 subscription_expired` / `no_sessions_remaining`). A scheduled job flips
   `active → expired` at `expiresAt`. **No rollover in MVP:** on expiry, `sessionsRemaining` is
   forfeited (not carried into any future cycle). An **admin may manually extend** a subscription —
   bump `expiresAt` (status back to `active` if needed) and optionally top up `sessionsRemaining` —
   via `PATCH /admin/subscriptions/:id`. This is the only path to "more time/sessions" without a new
   payment.

8. **Booking cancellation — 24-hour credit window; refunds are manual.** *(decision 2)*
   `DELETE /student/bookings/:id` always releases the slot (`booked → open`) and sets
   `Booking.status = cancelled`. Credit handling is time-based, computed server-side against
   `scheduledAt`:
   - Cancelled **> 24h** before `scheduledAt` → refund the session credit (`sessionsRemaining += 1`),
     `creditRefunded = true`.
   - Cancelled **≤ 24h** before `scheduledAt` → no credit returned, `creditRefunded = false`.
   There are **no automatic monetary refunds**. Any money refund is a manual admin action recorded
   out-of-band (and, if it affects the subscription, applied via `PATCH /admin/subscriptions/:id`).

**Additional invariants implied by the flows:**
- A `Booking` can only be created against an `open` slot belonging to the topic's instructor.
- `Session.end` is idempotent; ending an already-completed session is a no-op.
- The 24h cancellation cutoff is evaluated on the server clock, not the client.

---

## 5. API Contract Draft

> Draft only — paths, verbs, and the gist of payloads. Auth required unless marked **public**.

### Auth
```
POST   /auth/register            {fullName,email,password} -> {tokens,user}        (public)
POST   /auth/login               {email,password}          -> {tokens,user,onboarding} (public)
POST   /auth/refresh             {refreshToken}            -> {accessToken}         (public)
POST   /auth/logout              -> 204
GET    /me                       -> {user, profile, onboarding}
PATCH  /me                       {fullName?, ...}          -> {user}
```

### Onboarding
```
GET    /onboarding/goals         -> Goal[]                                          (public)
PUT    /me/goal                  {goalId}                  -> {profile}
GET    /placement/test           -> Question[] (no `correct`)
POST   /placement/test/submit    {answers[]}              -> {resultId}
GET    /placement/result/latest  -> PlacementResult
GET    /placement/result/:id     -> PlacementResult
```

### Billing
```
GET    /billing/plans            -> Plan[]                                          (public)
POST   /billing/checkout/select  {planId}                 -> {orderId}
GET    /billing/order/:id        -> {planName,sessionsPerMonth,amount,currency}
GET    /billing/bank-account     -> BankAccount
POST   /billing/upload-url       {filename,contentType}   -> {uploadUrl,receiptFileId}
POST   /billing/payment-proof    {orderId,planId,amount,reference,transferDate,receiptFileId} -> PaymentProof
GET    /billing/payment-proof/latest -> PaymentProof
```

### Student (billing history)
```
GET    /student/billing/history  -> PaymentProof[] (own; with signed receiptUrl)   (decision 5)
GET    /student/subscription     -> Subscription (own; status,expiresAt,sessionsRemaining)
```

### Student
```
GET    /student/dashboard        -> {stats,nextSession,recentSessions,progressTrend,paymentStatus}
GET    /student/topics           ?category= -> Topic[] (published)
GET    /student/topics/:id       -> Topic detail: preview (description+samplePrompts) OR full
                                    (questions+vocabulary) depending on confirmed booking [rule 4, decision 3]
GET    /student/bookings         -> Booking[]
POST   /student/bookings         {topicId,instructorId,slotId} -> Booking   [rules 1,4,6,7]
DELETE /student/bookings/:id     -> {status:"cancelled",creditRefunded}   // >24h refunds credit [rule 8, decision 2]
GET    /student/progress         -> [{label,score}]
GET    /student/reports/:id      -> AIReport
GET    /instructor/:id/availability -> AvailabilitySlot[] (open)   // student-facing read
```

### Instructor
```
GET    /instructor/dashboard     -> {stats,todaySessions,topics,weekly}
GET    /instructor/topics        -> Topic[] (own)
POST   /instructor/topics        {title,category,level,description,...} -> Topic (draft)
PUT    /instructor/topics/:id    {...}                    -> Topic
POST   /instructor/topics/:id/publish -> {published:true}            [requires required fields]
POST   /instructor/topics/:id/questions        {text}    -> Question (manual)
POST   /instructor/topics/:id/questions/:qid/approve -> {approved:true}   [rule 3]
DELETE /instructor/topics/:id/questions/:qid -> 204
GET    /instructor/availability  -> AvailabilitySlot[]
PUT    /instructor/availability  {days[]}                 -> AvailabilitySlot[]
GET    /instructor/sessions      ?date= -> Booking[]
```

### Admin
```
GET    /admin/dashboard          -> {stats,pendingProofs,recentActivity}
GET    /admin/payment-proofs     ?status= -> PaymentProof[]
GET    /admin/payment-proofs/:id -> PaymentProof + signed receiptUrl
POST   /admin/payment-proofs/:id/approve  {note?} -> PaymentProof (+ activates subscription) [rule 2]
POST   /admin/payment-proofs/:id/reject   {note?} -> PaymentProof                            [rule 2]
POST   /admin/payment-proofs/:id/reopen   -> PaymentProof
GET    /admin/payment-proofs/:id/receipt  -> 302/redirect to signed download URL (decision 5)
GET    /admin/subscriptions      ?status= -> Subscription[]
PATCH  /admin/subscriptions/:id  {expiresAt?,sessionsRemaining?,note?} -> Subscription  // manual extend/top-up [rule 7, decision 1]
POST   /admin/subscriptions/:id/refund-note {amount,reason} -> {recorded:true}  // manual money refund record [decision 2]
GET    /admin/users              ?role= -> User[]
PATCH  /admin/users/:id          {status?,role?} -> User
```

### AI
```
POST   /ai/placement/score       {answers[]} -> {level,skills,...}   // internal; called by submit
POST   /ai/topics/:id/suggest    {context?} -> {subtopics[],questions[]}   (proposals only) [rule 3]
POST   /ai/sessions/:id/report   -> {reportId,status:"pending"}  // triggered post-completion [rule 5]
```

### Sessions
```
GET    /sessions/:id             -> {bookingId,topicTitle,questions[],vocabulary[],status,startsAt}
POST   /sessions/:id/join        -> {agoraAppId,channel,agoraToken,uid,expiresAt}  // server-minted Agora RTC token [decision 4]
POST   /sessions/:id/notes       {text} -> 204   (autosave)
POST   /sessions/:id/end         -> {status:"completed",reportPending:true}   [triggers rule 5]
GET    /sessions/:id/report      -> AIReport (202 if pending)
```

### Notifications (cross-cutting)
```
GET    /notifications            -> Notification[]
POST   /notifications/:id/read   -> 204
```

---

## Resolved Product Decisions

These were open questions in the first draft; product has now decided them. The decisions are
reflected throughout the document above (Business Rules, Data Models, API Contract).

1. **Subscription rollover — none in MVP.** Unused `sessionsRemaining` expire when the subscription
   expires; sessions do **not** carry over to a new cycle. An admin may **manually extend** a
   subscription's `expiresAt` (and optionally top up sessions). See Business Rule 7.

2. **Cancellation — 24-hour window.** Cancelling **more than 24h** before `scheduledAt` returns the
   session credit (`sessionsRemaining += 1`) and releases the slot. Cancelling **within 24h** releases
   the slot but **does not** refund the credit. There are **no automatic monetary refunds** in MVP;
   any money refund is a manual admin action. See Business Rule 8.

3. **Question preview — gated.** Before a confirmed booking, students see only the topic
   **description** and a small set of **sample prompts**. The full AI-generated discussion question set
   and vocabulary become visible **only after a confirmed booking**. See Business Rule 4.

4. **Video provider — Agora.** The backend mints Agora RTC tokens server-side; the **frontend never
   generates video tokens**. `Session.roomId` holds the Agora channel name. See `/sessions/:id/join`
   and the `Session` model.

5. **Receipt retention — 5 years.** `PaymentProof` records and their receipt files are retained for
   **5 years** from `submittedAt`. Admins can view/download proofs; students can view their own
   **payment history**. See the `PaymentProof` model and the new student billing-history endpoint.
