# Software Requirements Specification (SRS)
## OneClup — Online English Club Platform

**Version:** 1.0  ·  **Status:** Baseline  ·  **Document owner:** OneClup team
**Standard:** Adapted from IEEE Std 830

> **ملخّص بالعربية:** OneClup منصّة لممارسة **التحدّث بالإنجليزية مع مدرّس حقيقي**. الطالب
> يحدّد أوقاته المتاحة فقط، والنظام يُسنِد أقرب أستاذ متاح، والإدارة تراجع وتعتمد، ثم يحضّر
> الأستاذ درس كل جلسة (عنوان + أسئلة) ويظهر للطالب قبل الجلسة بساعة. الدفع بتحويل بنكي محلي،
> والواجهة ثنائية اللغة (عربي/إنجليزي)، والذكاء الاصطناعي مساعد لا يحلّ محلّ المدرّس.

---

## 1. Introduction

### 1.1 Purpose
This document specifies the functional and non-functional requirements of **OneClup**, an
online platform for practising spoken English with human instructors, supported by AI. It is
intended for the product team, developers, testers, and stakeholders as the baseline against
which the system is built and verified.

### 1.2 Scope
OneClup enables learners to reserve recurring weekly **availability**, have an instructor
**assigned by the system and confirmed by an admin**, attend **live one-to-one (or small
group) conversation sessions**, receive a per-session **instructor-authored lesson** shortly
before each session, and obtain an **AI session report** afterward. Payment is by **local bank
transfer** with admin approval. The product covers three roles — **Student, Instructor,
Admin** — and is fully **bilingual (English / Arabic, RTL)**.

Out of scope: card/gateway payments, native mobile apps, and any AI capability that would
replace the human instructor during a session.

### 1.3 Definitions, acronyms, abbreviations
- **Availability pick / slot:** a weekday + time the student is free to attend.
- **Recurring availability (instructor):** the weekly windows an instructor can teach.
- **Assignment:** binding a student's pick to an instructor (auto, admin-confirmable).
- **Review gate:** admin approval required before any session is created.
- **Session credit:** one prepaid unit consumed by one booked session.
- **Lesson:** the title + discussion questions an instructor authors for one session.
- **Reveal window:** the period (1 hour) before a session when its lesson becomes visible.
- **Prep window:** the period (3 days) before a session during which the instructor may author
  its lesson.
- **AI Tutor:** an optional, separate subscription for short solo spoken-practice drills.
- **SRS/FR/NFR:** Software Requirements Specification / Functional / Non-functional Requirement.

### 1.4 References
- Project `README.md` (system overview & vision).
- `deploy/DEPLOYMENT.md` (deployment & configuration).
- IEEE Std 830 (SRS structure).

### 1.5 Overview
Section 2 gives the overall description and user classes. Section 3 lists functional
requirements grouped by feature. Section 4 covers external interfaces. Section 5 covers
non-functional requirements. Section 6 holds the data model and use-case appendices.

---

## 2. Overall description

### 2.1 Product perspective
OneClup is a web application: a **Django REST** backend, a **React** single-page frontend, a
**PostgreSQL** database, **Redis**, and a background **scheduler**. It integrates optional
external providers — **Agora** (live video) and **OpenAI** (AI features) — each with a safe
deterministic fallback so the system remains operational when a provider is unconfigured.

### 2.2 Product functions (high level)
- Registration, authentication (JWT), role-based access.
- AI placement test (written + spoken) with a level result.
- Duration-based subscriptions paid by bank transfer, approved by an admin.
- **Availability-first scheduling** with **system auto-assignment** of instructors.
- **Admin review gate**: confirm/replace instructor, approve or reject each pick.
- Automatic + rolling **booking generation** consuming session credits.
- **Instructor per-session lesson authoring** (with AI question suggestions), time-boxed to a
  prep window and revealed to the student on a reveal window.
- **Live sessions** (video, whiteboard, chat, screen-share, files, recording).
- **AI session reports** and **progress tracking** by skill over time.
- Optional **AI Tutor** solo practice.
- **Notifications** (in-app; email when configured).
- Admin operations: members, instructors, plans, bookings, business metrics, audit log.
- Full **bilingual** UI (EN/AR, RTL).

### 2.3 User classes and characteristics
- **Student:** an adult learner with basic reading/writing English seeking speaking practice.
- **Instructor:** a vetted teacher who sets availability, is assigned students, prepares
  lessons, teaches, and reviews reports. May also hold a public profile/CV.
- **Admin:** operates payments, the scheduling review queue, catalogue/plan/member management,
  metrics, and audit.

### 2.4 Operating environment
Modern web browsers (desktop and mobile web). Server: Linux containers via Docker Compose
(web, Postgres, Redis, scheduler) behind Nginx.

### 2.5 Design & implementation constraints
- Domain-driven layering: `apps` (models/services) → `application` (use cases/queries) →
  `api` (DRF). The frontend consumes a typed API client via React Query.
- Payments are **manual bank transfer + admin approval** only.
- AI must **assist**, never conduct the live lesson.
- All user-facing text must be translatable (EN source + AR dictionary).

### 2.6 Assumptions & dependencies
- The student has an active, approved subscription with remaining credits to be scheduled.
- Instructors keep their recurring availability up to date.
- External provider keys (Agora/OpenAI/SMTP) are optional; absence degrades gracefully.

---

## 3. Functional requirements

> Priority: **M** = must, **S** = should, **C** = could.

### 3.1 Accounts & authentication
- **FR-A1 (M):** A visitor can register as a student with name, email, password.
- **FR-A2 (M):** Users authenticate via JWT; refresh tokens rotate and can be blacklisted.
- **FR-A3 (M):** Logout invalidates the session server-side (token blacklist).
- **FR-A4 (M):** Access is role-gated (student/instructor/admin) at both API and UI layers.
- **FR-A5 (M):** Password reset via emailed link; instructor invitation via emailed link.

### 3.2 Placement
- **FR-P1 (M):** A new student takes an AI placement test (written multiple-choice + spoken).
- **FR-P2 (M):** The spoken interview follows a fixed, deterministic, versioned script.
- **FR-P3 (M):** The system computes and stores a CEFR-style level from the results.

### 3.3 Billing & subscriptions
- **FR-B1 (M):** The system offers duration-based plans (e.g., session/week/month/…).
- **FR-B2 (M):** A student submits a **bank-transfer payment proof** (with receipt/reference).
- **FR-B3 (M):** Proofs enter a **pending** admin queue — never auto-approved.
- **FR-B4 (M):** On approval, a subscription activates with an expiry and **session credits**;
  the student mirror (credits) updates.
- **FR-B5 (M):** Admin can reject or request more info, with a note shown to the student.
- **FR-B6 (S):** Admin can **top up** credits or **extend** a subscription.
- **FR-B7 (M):** Approving a payment or topping up **re-runs booking generation** so an
  approved schedule that lacked credits is materialised immediately.
- **FR-B8 (M):** A student **cannot** be scheduled without an active, approved subscription.

### 3.4 Student availability (availability-first)
- **FR-S1 (M):** A student sets a recurring weekly **availability** as weekday+time picks.
  **No topic is chosen.**
- **FR-S2 (M):** On save, each new pick is **auto-assigned the nearest available instructor**
  (an instructor whose recurring availability covers that time, load-balanced), or left
  **unassigned** if none is available.
- **FR-S3 (M):** New or edited picks enter **pending** review; removed picks are deactivated
  while already-generated bookings are preserved.
- **FR-S4 (M):** The student sees each pick's **review status** (pending/approved/rejected,
  with the admin's note if rejected) and the assigned instructor.

### 3.5 Instructor availability
- **FR-I1 (M):** An instructor defines recurring weekly availability windows (weekday, start,
  end). An instructor with no windows is treated as available all week.

### 3.6 Admin scheduling review gate
- **FR-R1 (M):** The admin sees pending picks grouped by student, each with the auto-assigned
  instructor and the list of **all instructors free at that time**.
- **FR-R2 (M):** The admin can **assign/replace** the instructor on a pending pick (validated
  against that instructor's availability).
- **FR-R3 (M):** The admin can **approve** all or specific picks; approval **generates
  bookings** and notifies student and instructor.
- **FR-R4 (M):** The admin can **reject** a pick with a note; rejected picks never generate.
- **FR-R5 (M):** Approving a pick with no assigned instructor generates nothing (it waits).

### 3.7 Booking generation
- **FR-G1 (M):** On approval, the system materialises concrete sessions for a rolling horizon,
  consuming **one credit** per session; generation stops when credits run out.
- **FR-G2 (M):** Generation is **idempotent** (never double-books an occurrence).
- **FR-G3 (M):** A **cancelled** occurrence is **not** silently recreated/re-charged.
- **FR-G4 (M):** A **scheduler** re-runs generation periodically to keep future weeks booked.

### 3.8 Instructor lesson authoring
- **FR-L1 (M):** For each upcoming assigned session the instructor authors a **lesson title +
  discussion questions** (free-form).
- **FR-L2 (S):** An **"AI suggest"** action proposes questions from the title; the instructor
  edits/keeps them (stub fallback when no AI key).
- **FR-L3 (M):** Authoring/editing is allowed **only within the prep window (3 days before)**;
  earlier attempts are locked (UI) and rejected (API).
- **FR-L4 (M):** The lesson is stored on the individual session (not a shared catalogue).

### 3.9 Lesson reveal to student
- **FR-D1 (M):** A prepared lesson (title + questions) becomes visible to the student **only
  within the reveal window (1 hour before)** the session.
- **FR-D2 (S):** Before the reveal window, the student sees a neutral status (e.g., "your
  instructor will share the lesson before the session" / "unlocks 1 hour before").

### 3.10 Live sessions
- **FR-V1 (M):** A booking has exactly one live-session room, joinable within a join window.
- **FR-V2 (M):** The room provides video, **whiteboard** (with close/clear), **chat**,
  **screen-share**, **file share**, raise-hand/reactions, and **recording controls** (start/
  stop for the instructor; a recording indicator for everyone).
- **FR-V3 (M):** Video/token provisioning uses Agora when configured, else a safe stub.
- **FR-V4 (M):** Attendance/presence is tracked; a completed session locks further changes.

### 3.11 AI reports & progress
- **FR-RP1 (M):** After a completed session, an AI report is prepared (pending → ready) with
  scores (grammar, vocabulary, fluency, pronunciation, confidence), strengths, mistakes,
  recommendations, and homework.
- **FR-RP2 (M):** The instructor can review/accept the report; every report carries a human
  instructor note (AI assists, not replaces).
- **FR-RP3 (M):** The student's **progress dashboard** shows per-skill scores and deltas over
  sessions.

### 3.12 AI Tutor (optional)
- **FR-T1 (C):** A student with the AI-Tutor subscription can run short (≤5 min) solo spoken
  drills in the dashboard.
- **FR-T2 (C):** Voice and pitch/tone are adjustable; the session ends at the time cap.

### 3.13 Notifications
- **FR-N1 (M):** In-app notifications for: payment decisions, schedule submitted/approved/
  rejected, new booking/assignment, session reminders (24h/1h/10min), report ready.
- **FR-N2 (S):** The same notifications are emailed when SMTP + the email flag are configured.

### 3.14 Admin operations
- **FR-O1 (M):** Manage members (status), instructors (approve/feature/visibility/founding/
  order), and plans (create/update).
- **FR-O2 (M):** View/cancel bookings platform-wide; view business metrics and an **audit log**
  of consequential admin actions.

### 3.15 Instructor profiles & public directory
- **FR-PR1 (S):** Instructors maintain a public CV (education, experience, certifications,
  languages, social links, photo).
- **FR-PR2 (S):** Approved/featured instructors surface on the public landing page and a
  per-instructor public page.

### 3.16 Localization
- **FR-LOC1 (M):** All user-facing text is available in **English and Arabic**; the UI supports
  **RTL**; dates localise to the active language.

---

## 4. External interface requirements

### 4.1 User interfaces
Role-based dashboards (student/instructor/admin) plus public pages (landing, auth, pricing,
instructor profiles). A language toggle is always accessible. Shared components translate text
internally; the layout flips for RTL.

### 4.2 Software interfaces
- **REST API** (`/api/v1/...`) consumed by the SPA via a typed client + React Query.
- **Agora** SDK/token service for live video (optional).
- **OpenAI** for AI generation/analysis (optional).
- **SMTP** for outbound email (optional).

### 4.3 Communications
HTTPS for all traffic; JWT bearer auth; WebSocket/real-time channels for live-session features.

---

## 5. Non-functional requirements

- **NFR-SEC1 (M):** Role enforced at API and UI; server-side logout/token blacklist;
  least-privilege endpoints (`/admin/*` require admin).
- **NFR-SEC2 (M):** Payments require explicit admin approval; no auto-activation.
- **NFR-REL1 (M):** External-provider failures degrade to deterministic stubs, never crash a
  session or a request; email/generation side-effects are best-effort and never block the
  primary action.
- **NFR-CON1 (M):** Booking generation is idempotent and credit-safe under repeated runs.
- **NFR-PERF1 (S):** Scheduling review lists cache instructor candidates per (weekday,time).
- **NFR-USE1 (M):** The scheduling flow requires no topic knowledge from the student (times
  only); the admin queue surfaces all needed decisions on one screen.
- **NFR-LOC1 (M):** 100% of user-facing strings and navigation labels resolve in EN and AR.
- **NFR-MNT1 (S):** Domain-driven layering keeps rules framework-free and testable; the suite
  covers backend (pytest) and frontend (vitest).
- **NFR-OPS1 (M):** Time-based jobs (reminders, rolling generation) run via a dedicated
  scheduler service; migrations/static run on container start.
- **NFR-PRIV1 (M):** A student's lesson content is hidden until the reveal window; instructors
  can only act on their own assigned sessions.

---

## 6. Appendices

### 6.1 Core domain entities (simplified)
- **User** (role, status) → **StudentProfile** / **InstructorProfile**.
- **InstructorProfile** → recurring availability windows, public CV, accept-students flag.
- **StudentScheduleSlot:** student, weekday, start_time, duration, **instructor (nullable,
  assigned)**, **review_status** (pending/approved/rejected), reviewer/notes. *(No topic.)*
- **Booking:** student, instructor, slot, subscription, scheduled_at, status; **lesson_title,
  lesson_questions, lesson_prepared_at**; link back to the originating schedule slot.
- **Subscription / Plan / PaymentProof:** credits, dates, status, admin decision.
- **Session** (live room) · **AIReport** · **AITutorSubscription/Session** · **Notification**
  · **AdminAction** (audit).

### 6.2 Primary use cases (happy paths)
1. **Onboard & pay:** register → placement → choose plan → submit proof → admin approves →
   credits active.
2. **Schedule:** student sets availability → auto-assign → admin confirms/approves → sessions
   booked.
3. **Teach:** instructor prepares lesson (within 3 days) → student sees it (1 hour before) →
   live session → AI report → progress updated.
4. **Operate:** admin reviews queues (payments, scheduling), manages catalogue, monitors
   metrics and audit.

### 6.3 Configurable parameters (defaults)
- Booking horizon (rolling): 2 weeks.
- Lesson **prep window**: 72 hours (3 days) before the session.
- Lesson **reveal window**: 60 minutes before the session.
- Session reminders: 24h / 1h / 10min.
- AI Tutor session cap: 5 minutes.

### 6.4 Traceability note
Each FR above maps to implemented services/use cases/endpoints and is covered by automated
tests (backend pytest + frontend vitest). External-provider-dependent behaviour (Agora/OpenAI/
SMTP) is validated against the deterministic fallbacks.
