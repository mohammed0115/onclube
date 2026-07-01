# OneClub — MVP Database Design (PostgreSQL / Django-ready)

**Status:** Schema design only. **No Django code. No migrations.** This document specifies the
PostgreSQL schema that backs the approved [backend plan](backend-plan.md) — same 20-screen MVP, same
business rules, same product scope. Nothing new is added.

**Conventions**
- Engine: **PostgreSQL 15+**. Targets Django ORM mapping but is expressed as plain SQL-level design.
- Primary keys: `uuid` (`gen_random_uuid()` via `pgcrypto`), surfaced to the API as strings.
- All money: `numeric(10,2)` + a separate `currency char(3)`. Never floats.
- Timestamps: `timestamptz` (UTC). Dates without time: `date`.
- Enums: implemented as **Postgres native `ENUM` types** (listed in §3). Django maps these to
  `TextChoices`; the DB enforces the domain regardless.
- Naming: `snake_case` tables (plural), `snake_case` columns. FK columns end in `_id`.
- Every business table carries the audit block from §5 unless noted (reference/catalog tables carry a
  reduced set).

---

## 1. Tables / Models

### 1.1 `users`
Base identity for all roles.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| full_name | varchar(150) | NO | — | |
| email | citext | NO | — | login id |
| password_hash | varchar(255) | NO | — | Django PBKDF2/argon2 |
| role | user_role (enum) | NO | 'student' | student\|instructor\|admin |
| status | user_status (enum) | NO | 'active' | active\|suspended |
| last_login_at | timestamptz | YES | NULL | |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |
| created_by | uuid | YES | NULL | FK users.id (self-ref; null for self-signup) |
| updated_by | uuid | YES | NULL | FK users.id |

**Indexes / constraints**
| Type | Definition |
|---|---|
| UNIQUE | (email) — `citext` makes it case-insensitive |
| INDEX | (role) |
| INDEX | (status) WHERE status = 'suspended' (partial) |

---

### 1.2 `student_profiles`
1:1 with a `users` row where `role='student'`.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | — | FK users.id, UNIQUE |
| level | cefr_level (enum) | YES | NULL | set after placement |
| goal_id | uuid | YES | NULL | FK goals.id ON DELETE SET NULL |
| placement_result_id | uuid | YES | NULL | FK placement_results.id |
| active_subscription_id | uuid | YES | NULL | FK subscriptions.id (deferrable) |
| payment_status | payment_status (enum) | NO | 'none' | none\|pending\|approved\|rejected (denormalized convenience mirror) |
| sessions_remaining | integer | NO | 0 | CHECK ≥ 0 |
| created_at / updated_at / created_by / updated_by | — | | | audit block |

**Indexes / constraints**
| Type | Definition |
|---|---|
| UNIQUE | (user_id) |
| INDEX | (active_subscription_id) |
| CHECK | sessions_remaining >= 0 (`chk_student_sessions_nonneg`) |

> `payment_status`/`sessions_remaining` on the profile are a denormalized read-cache for the student
> dashboard. The **source of truth** is `subscriptions` + `payment_proofs`; both are updated in the
> same transaction as the canonical rows.

---

### 1.3 `instructor_profiles`
1:1 with a `users` row where `role='instructor'`.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | — | FK users.id, UNIQUE |
| initials | varchar(4) | NO | — | |
| flag | varchar(8) | YES | NULL | emoji |
| country | varchar(80) | YES | NULL | |
| headline | varchar(160) | YES | NULL | |
| bio | text | YES | NULL | |
| rating | numeric(2,1) | NO | 0.0 | aggregate, CHECK 0–5 |
| sessions_hosted | integer | NO | 0 | aggregate, CHECK ≥ 0 |
| accent | varchar(60) | YES | NULL | UI gradient |
| created_at / updated_at / created_by / updated_by | — | | | audit block |

**Indexes / constraints**
| Type | Definition |
|---|---|
| UNIQUE | (user_id) |
| INDEX | (rating DESC) — for "featured instructors" |
| CHECK | rating BETWEEN 0 AND 5; sessions_hosted >= 0 |

---

### 1.4 `goals` (reference)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| code | varchar(40) | NO | — | e.g. "interview" |
| label | varchar(80) | NO | — | |
| description | varchar(160) | YES | NULL | |
| icon | varchar(40) | YES | NULL | lucide name |
| accent | varchar(60) | YES | NULL | |
| active | boolean | NO | true | |
| created_at / updated_at | — | | | (reference: no created_by/updated_by needed) |

| Type | Definition |
|---|---|
| UNIQUE | (code) |

---

### 1.5 `placement_questions` (reference / question bank)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| prompt | text | NO | — | |
| options | jsonb | NO | — | ordered string array |
| correct_index | smallint | NO | — | **server-only, never serialized to students** |
| skill | placement_skill (enum) | NO | — | grammar\|vocabulary\|comprehension\|usage |
| active | boolean | NO | true | |
| created_at / updated_at / created_by / updated_by | — | | | audit block |

| Type | Definition |
|---|---|
| INDEX | (active) WHERE active = true |
| CHECK | jsonb_array_length(options) BETWEEN 2 AND 6; correct_index >= 0 |

---

### 1.6 `placement_attempts`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| student_id | uuid | NO | — | FK student_profiles.id ON DELETE CASCADE |
| answers | jsonb | NO | — | `[{questionId, selectedIndex}]` |
| submitted_at | timestamptz | NO | now() | |
| created_at / updated_at | — | | | |

| Type | Definition |
|---|---|
| INDEX | (student_id, submitted_at DESC) |

---

### 1.7 `placement_results`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| attempt_id | uuid | NO | — | FK placement_attempts.id, UNIQUE |
| student_id | uuid | NO | — | FK student_profiles.id ON DELETE CASCADE |
| level | cefr_level (enum) | NO | — | |
| level_label | varchar(40) | NO | — | |
| summary | text | YES | NULL | |
| skills | jsonb | NO | — | `[{label,value,color}]` |
| created_at / updated_at | — | | | |

| Type | Definition |
|---|---|
| UNIQUE | (attempt_id) |
| INDEX | (student_id, created_at DESC) |

---

### 1.8 `plans` (reference / catalog)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| code | varchar(40) | NO | — | starter\|regular\|intensive |
| name | varchar(60) | NO | — | |
| emoji | varchar(8) | YES | NULL | |
| price | numeric(10,2) | NO | — | CHECK ≥ 0 |
| currency | char(3) | NO | 'SAR' | |
| cadence | varchar(20) | NO | '/ month' | display |
| billing_period_days | integer | NO | 30 | drives `expires_at` math |
| description | varchar(200) | YES | NULL | |
| sessions_per_month | integer | NO | — | CHECK ≥ 0 |
| features | jsonb | NO | '[]' | string array |
| recommended | boolean | NO | false | |
| active | boolean | NO | true | |
| created_at / updated_at / created_by / updated_by | — | | | audit block |

| Type | Definition |
|---|---|
| UNIQUE | (code) |
| INDEX | (active) WHERE active = true |

---

### 1.9 `subscriptions`
Per-student instance of a plan. Activated **only** by admin payment approval.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| student_id | uuid | NO | — | FK student_profiles.id ON DELETE CASCADE |
| plan_id | uuid | NO | — | FK plans.id ON DELETE RESTRICT |
| status | subscription_status (enum) | NO | 'pending' | pending\|active\|expired\|cancelled |
| started_at | timestamptz | YES | NULL | set on approval |
| expires_at | timestamptz | YES | NULL | started_at + plan.billing_period_days; admin-extendable |
| sessions_remaining | integer | NO | 0 | CHECK ≥ 0; **no rollover** |
| activated_by | uuid | YES | NULL | FK users.id (admin who approved) |
| extended_by | uuid | YES | NULL | FK users.id (last admin to extend) |
| extended_at | timestamptz | YES | NULL | |
| created_at / updated_at / created_by / updated_by | — | | | audit block |

**Indexes / constraints**
| Type | Definition |
|---|---|
| INDEX | (student_id, status) |
| PARTIAL UNIQUE | (student_id) WHERE status = 'active' — **at most one active subscription per student** |
| INDEX | (status, expires_at) — for the expiry sweep job |
| CHECK | sessions_remaining >= 0 (`chk_sub_sessions_nonneg`) |
| CHECK | status='active' ⇒ started_at IS NOT NULL AND expires_at IS NOT NULL (see §2.2) |

---

### 1.10 `payment_proofs`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| student_id | uuid | NO | — | FK student_profiles.id ON DELETE RESTRICT (retention) |
| subscription_id | uuid | YES | NULL | FK subscriptions.id (draft/order link) |
| plan_id | uuid | NO | — | FK plans.id ON DELETE RESTRICT |
| plan_name | varchar(60) | NO | — | snapshot |
| amount | numeric(10,2) | NO | — | CHECK ≥ 0 |
| currency | char(3) | NO | 'SAR' | |
| transaction_number | varchar(60) | NO | — | **UNIQUE** — bank txn number; prevents receipt reuse (6C) |
| transfer_datetime | timestamptz | NO | — | when the transfer was made (6C; was `transfer_date`) |
| sender_name | varchar(150) | YES | NULL | optional (6C) |
| receiver_name | varchar(150) | YES | NULL | optional (6C) |
| raw_ocr_data | jsonb | YES | NULL | optional OCR payload; informational only — never auto-approves (6C) |
| receipt_file_id | uuid | NO | — | FK files.id (stored receipt image) |
| receipt_name | varchar(255) | NO | — | snapshot |
| status | payment_proof_status (enum) | NO | 'pending_review' | pending_review\|approved\|rejected (6C) |
| reviewed_by | uuid | YES | NULL | FK users.id (admin); required when decided |
| review_note | text | YES | NULL | |
| submitted_at | timestamptz | NO | now() | |
| reviewed_at | timestamptz | YES | NULL | |
| retain_until | timestamptz | NO | submitted_at + interval '5 years' | retention floor (§2.7) |
| created_at / updated_at / created_by / updated_by | — | | | audit block |

**Indexes / constraints**
| Type | Definition |
|---|---|
| UNIQUE | (transaction_number) — a bank transaction number can back at most one proof (6C) |
| INDEX | (status, submitted_at) — admin queue ordering |
| INDEX | (student_id, submitted_at DESC) — student billing history |
| INDEX | (retain_until) — purge sweep |
| CHECK | status IN ('approved','rejected') ⇒ reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL (§2.2) |

> **Verification workflow (6C):** a submitted proof starts as `pending_review`.
> It is a manual bank-transfer verification, **not** an online payment — the receipt
> image is stored, the transaction number is unique, OCR is optional and never
> auto-approves. Admin approval (§2.2) remains the only path to `approved`.

---

### 1.11 `files`
Receipt + any uploaded artifact metadata; bytes live in object storage.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| storage_key | varchar(512) | NO | — | object-store path |
| filename | varchar(255) | NO | — | |
| content_type | varchar(100) | NO | — | |
| size_bytes | bigint | YES | NULL | |
| uploaded_by | uuid | YES | NULL | FK users.id |
| created_at | timestamptz | NO | now() | |

| Type | Definition |
|---|---|
| UNIQUE | (storage_key) |

---

### 1.12 `topics`
Owned by an instructor. AI assists.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| title | varchar(120) | NO | — | |
| category | varchar(60) | NO | — | |
| icon | varchar(40) | YES | NULL | |
| accent | varchar(60) | YES | NULL | |
| description | text | YES | NULL | shown pre-booking |
| level | cefr_level (enum) | NO | — | |
| instructor_id | uuid | NO | — | FK instructor_profiles.id ON DELETE RESTRICT |
| vocabulary | jsonb | NO | '[]' | string array (gated post-booking) |
| sample_prompts | jsonb | NO | '[]' | shown pre-booking (§2.5) |
| published | boolean | NO | false | |
| created_at / updated_at / created_by / updated_by | — | | | audit block |

| Type | Definition |
|---|---|
| INDEX | (instructor_id) |
| INDEX | (published, category) WHERE published = true — student browse |

---

### 1.13 `subtopics`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| topic_id | uuid | NO | — | FK topics.id ON DELETE CASCADE |
| title | varchar(160) | NO | — | |
| ai_generated | boolean | NO | false | true once instructor accepts AI suggestion |
| sort_order | integer | NO | 0 | |
| created_at / updated_at | — | | | |

| Type | Definition |
|---|---|
| INDEX | (topic_id, sort_order) |

---

### 1.14 `questions` (discussion questions)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| topic_id | uuid | NO | — | FK topics.id ON DELETE CASCADE |
| text | text | NO | — | |
| ai_assisted | boolean | NO | false | drafted with AI |
| approved | boolean | NO | false | **instructor must approve before student-visible** |
| approved_by | uuid | YES | NULL | FK users.id (instructor) |
| approved_at | timestamptz | YES | NULL | |
| sort_order | integer | NO | 0 | |
| created_at / updated_at / created_by / updated_by | — | | | audit block |

| Type | Definition |
|---|---|
| INDEX | (topic_id, sort_order) |
| INDEX | (topic_id) WHERE approved = true — fast "visible questions" read |
| CHECK | approved = true ⇒ approved_by IS NOT NULL AND approved_at IS NOT NULL |

---

### 1.15 `availability_slots`
Normalized one-row-per-slot.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| instructor_id | uuid | NO | — | FK instructor_profiles.id ON DELETE CASCADE |
| start_at | timestamptz | NO | — | absolute date+time |
| duration_minutes | integer | NO | 45 | |
| status | slot_status (enum) | NO | 'open' | open\|booked\|blocked |
| booking_id | uuid | YES | NULL | FK bookings.id (deferrable) |
| created_at / updated_at / created_by / updated_by | — | | | audit block |

**Indexes / constraints**
| Type | Definition |
|---|---|
| UNIQUE | (instructor_id, start_at) — **no duplicate slot per instructor/time** (§2.1) |
| INDEX | (instructor_id, status, start_at) WHERE status = 'open' — student slot picker |
| CHECK | status = 'booked' ⇒ booking_id IS NOT NULL |
| CHECK | duration_minutes > 0 |

---

### 1.16 `bookings`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| student_id | uuid | NO | — | FK student_profiles.id ON DELETE RESTRICT |
| topic_id | uuid | NO | — | FK topics.id ON DELETE RESTRICT |
| topic_title | varchar(120) | NO | — | snapshot |
| instructor_id | uuid | NO | — | FK instructor_profiles.id ON DELETE RESTRICT |
| instructor_name | varchar(150) | NO | — | snapshot |
| slot_id | uuid | NO | — | FK availability_slots.id ON DELETE RESTRICT |
| subscription_id | uuid | NO | — | FK subscriptions.id (which sub the credit came from) |
| scheduled_at | timestamptz | NO | — | snapshot of slot.start_at |
| duration_minutes | integer | NO | 45 | |
| status | booking_status (enum) | NO | 'upcoming' | upcoming\|completed\|cancelled |
| report_id | uuid | YES | NULL | FK ai_reports.id |
| cancelled_at | timestamptz | YES | NULL | |
| credit_refunded | boolean | NO | false | true if cancelled > 24h out (§2 / §6) |
| created_at / updated_at / created_by / updated_by | — | | | audit block |

**Indexes / constraints**
| Type | Definition |
|---|---|
| UNIQUE | (slot_id) — **hard double-booking guard** (§2.1) |
| INDEX | (student_id, scheduled_at DESC) |
| INDEX | (instructor_id, scheduled_at) |
| INDEX | (status) WHERE status = 'upcoming' |

---

### 1.17 `sessions`
Live-room runtime record for a booking (Agora).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| booking_id | uuid | NO | — | FK bookings.id ON DELETE CASCADE, UNIQUE |
| status | session_status (enum) | NO | 'scheduled' | scheduled\|live\|completed\|cancelled |
| started_at | timestamptz | YES | NULL | |
| ended_at | timestamptz | YES | NULL | |
| agora_channel | varchar(64) | YES | NULL | Agora channel name (§2.6) |
| student_notes | text | YES | NULL | |
| created_at / updated_at / created_by / updated_by | — | | | audit block |

| Type | Definition |
|---|---|
| UNIQUE | (booking_id) |
| UNIQUE | (agora_channel) — one channel ↔ one session (§2.6) |
| CHECK | status IN ('live','completed') ⇒ agora_channel IS NOT NULL |
| CHECK | ended_at IS NULL OR ended_at >= started_at |

> Agora RTC tokens are **minted server-side at join time and never stored** — they are short-lived and
> derived from `agora_channel` + the participant's uid. No token column exists.

---

### 1.18 `session_transcripts`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| session_id | uuid | NO | — | FK sessions.id ON DELETE CASCADE, UNIQUE |
| content | jsonb | NO | — | `[{speaker,text,ts}]` |
| source | transcript_source (enum) | NO | 'asr' | asr\|manual |
| created_at | timestamptz | NO | now() | |

| Type | Definition |
|---|---|
| UNIQUE | (session_id) |

---

### 1.19 `ai_reports`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| session_id | uuid | NO | — | FK sessions.id ON DELETE CASCADE, UNIQUE |
| booking_id | uuid | NO | — | FK bookings.id |
| student_id | uuid | NO | — | FK student_profiles.id |
| topic_title | varchar(120) | NO | — | snapshot |
| instructor_name | varchar(150) | NO | — | snapshot |
| session_date | timestamptz | NO | — | |
| duration_minutes | integer | NO | — | |
| overall_score | smallint | YES | NULL | 0–100 (null until ready) |
| skills | jsonb | NO | '[]' | `[{label,value,color}]` |
| mistakes | jsonb | NO | '[]' | `[{label,example}]` |
| recommendations | jsonb | NO | '[]' | string array |
| instructor_note | text | YES | NULL | human, kept distinct from AI output |
| status | ai_report_status (enum) | NO | 'pending' | pending\|ready\|failed |
| generated_at | timestamptz | YES | NULL | |
| created_at / updated_at | — | | | |

| Type | Definition |
|---|---|
| UNIQUE | (session_id) |
| INDEX | (student_id, session_date DESC) |
| CHECK | status = 'ready' ⇒ overall_score IS NOT NULL AND generated_at IS NOT NULL |

---

### 1.20 `notifications`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | — | FK users.id ON DELETE CASCADE |
| type | notification_type (enum) | NO | — | payment_approved\|payment_rejected\|booking_confirmed\|session_reminder\|report_ready |
| title | varchar(160) | NO | — | |
| body | text | YES | NULL | |
| read | boolean | NO | false | |
| data | jsonb | YES | NULL | deep-link ids |
| created_at | timestamptz | NO | now() | |

| Type | Definition |
|---|---|
| INDEX | (user_id, read, created_at DESC) |

---

### 1.21 `admin_actions` (audit log of manual admin decisions)
Backs §6. One immutable row per privileged manual action.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| admin_id | uuid | NO | — | FK users.id (role=admin) |
| action_type | admin_action_type (enum) | NO | — | payment_approve\|payment_reject\|payment_reopen\|subscription_extend\|subscription_topup\|refund_note\|booking_cancel_override |
| target_table | varchar(60) | NO | — | e.g. 'payment_proofs' |
| target_id | uuid | NO | — | affected row id |
| amount | numeric(10,2) | YES | NULL | for refund_note / top-up |
| currency | char(3) | YES | NULL | |
| reason | text | YES | NULL | |
| metadata | jsonb | YES | NULL | before/after snapshot |
| created_at | timestamptz | NO | now() | append-only (no updated_at) |

| Type | Definition |
|---|---|
| INDEX | (target_table, target_id) |
| INDEX | (admin_id, created_at DESC) |
| INDEX | (action_type, created_at DESC) |

> This table is **append-only** — never updated or deleted. It is the system of record for every
> manual admin action listed in §6.

---

## 2. Critical Constraints

Each rule is enforced at the **database** layer (constraint/index) where possible, with the
**application/transaction** layer noted where a DB constraint alone is insufficient.

### 2.1 No double booking on the same availability slot
| Layer | Mechanism |
|---|---|
| DB | `bookings` **UNIQUE (slot_id)** — a slot can back at most one booking row. |
| DB | `availability_slots` **UNIQUE (instructor_id, start_at)** — no duplicate slot at a time. |
| Txn | Booking creation runs in one transaction: `SELECT ... FOR UPDATE` the slot, assert `status='open'`, insert booking, flip slot `open → booked`. Concurrent losers hit the unique violation → app returns `409 slot_unavailable`. |

### 2.2 Payment approval required before active subscription
| Layer | Mechanism |
|---|---|
| DB | `subscriptions` CHECK: `status='active' ⇒ started_at IS NOT NULL AND expires_at IS NOT NULL`. |
| DB | `payment_proofs` CHECK: `status IN ('approved','rejected') ⇒ reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL` — no decision without a named admin. |
| Txn | The **only** path that sets `subscriptions.status='active'` is the admin approve action, which in one transaction: sets proof `approved` + `reviewed_by/at`, sets sub `started_at/expires_at/sessions_remaining`, flips sub `pending → active`, writes an `admin_actions` row. No auto-activation path exists. |

### 2.3 sessionsRemaining cannot go below zero
| Layer | Mechanism |
|---|---|
| DB | `subscriptions` CHECK `sessions_remaining >= 0`; `student_profiles` CHECK `sessions_remaining >= 0`. |
| Txn | Booking decrement is `UPDATE subscriptions SET sessions_remaining = sessions_remaining - 1 WHERE id = :id AND sessions_remaining > 0` — if 0 rows updated, abort booking (`409 no_sessions_remaining`). The CHECK is the backstop. |

### 2.4 Expired subscriptions cannot be used for booking
| Layer | Mechanism |
|---|---|
| Txn | Booking precondition (same transaction, `FOR UPDATE` on the subscription row): `status='active' AND expires_at > now() AND sessions_remaining > 0`. Fail → `409 subscription_expired`. |
| Job | Scheduled sweep flips `active → expired` where `expires_at <= now()` (index `(status, expires_at)`). The booking check does not rely on the sweep having run — it re-checks `expires_at` live. |

### 2.5 / 2.5b Full questions visible only after confirmed booking
| Layer | Mechanism |
|---|---|
| App | `GET /student/topics/:id` returns `mode='preview'` (`description` + `sample_prompts` only) unless an EXISTS check passes: a `bookings` row for `(student_id, topic_id)` with `status IN ('upcoming','completed')`. Only then is `mode='full'` (`questions` where `approved=true` + `vocabulary`) returned. |
| DB | Question visibility floor: index `questions(topic_id) WHERE approved=true`; `approved` cannot be true without `approved_by/at` (CHECK). Unapproved questions are never returned in either mode. |

> This is a row-visibility rule, not a single-column constraint — enforced in the query layer with the
> booking EXISTS predicate. The DB guarantees the *approved* floor; the app adds the *booking* gate.

### 2.6 Agora channel must belong to a valid session
| Layer | Mechanism |
|---|---|
| DB | `sessions` **UNIQUE (agora_channel)** — a channel maps to exactly one session. |
| DB | `sessions` CHECK `status IN ('live','completed') ⇒ agora_channel IS NOT NULL`. |
| App | Join endpoint mints a token only after loading a `sessions` row by id, asserting the caller is the booked student or assigned instructor, and that `status IN ('scheduled','live')`. Token is scoped to that row's `agora_channel`; no token is issued for an unknown/closed channel. Tokens are never persisted. |

### 2.7 Payment proof retention for 5 years
| Layer | Mechanism |
|---|---|
| DB | `payment_proofs.retain_until` NOT NULL default `submitted_at + interval '5 years'`. |
| DB | FK `payment_proofs.student_id → student_profiles` is **ON DELETE RESTRICT** (and `plan_id` RESTRICT) — a student/plan cannot be hard-deleted while proofs reference them. |
| Job | Purge job may delete a proof + its `files` row **only** where `retain_until < now()`. Before that date, hard delete is forbidden (see §4). |

---

## 3. State Machines

Each enum below is a Postgres native `ENUM` type. Allowed transitions are enforced in the service
layer; illegal transitions are rejected (`409`). Terminal states have no outgoing edges.

### 3.1 `payment_proof_status`
| From | To | Trigger |
|---|---|---|
| (insert) | pending | student submits proof |
| pending | approved | admin approve → activates subscription (§2.2) |
| pending | rejected | admin reject |
| approved | pending | admin reopen |
| rejected | pending | admin reopen |

```
pending ──approve──▶ approved ──reopen──▶ pending
   │                                         ▲
   └────reject──▶ rejected ──reopen──────────┘
```
No terminal state — admins can always reopen. Every transition writes `admin_actions`.

### 3.2 `subscription_status`
| From | To | Trigger |
|---|---|---|
| (insert) | pending | draft order created |
| pending | active | admin approves the linked payment proof |
| pending | cancelled | order abandoned / proof rejected (policy) |
| active | expired | sweep job: `expires_at <= now()` |
| active | cancelled | admin cancels |
| expired | active | admin manual extend (§6) — bumps `expires_at` |

```
pending ──approve──▶ active ──expire(time)──▶ expired
   │                  │  ▲                       │
   │                  │  └──admin extend─────────┘
   └──abandon──▶ cancelled ◀──admin cancel──┘
```
`cancelled` is terminal. `expired → active` only via an audited admin extend.

### 3.3 `booking_status`
| From | To | Trigger |
|---|---|---|
| (insert) | upcoming | student books a slot |
| upcoming | completed | session ends |
| upcoming | cancelled | student/admin cancels (slot released; credit per §6) |

```
upcoming ──session end──▶ completed   (terminal)
    └─────cancel────────▶ cancelled   (terminal)
```
`completed` and `cancelled` are terminal. A `cancelled` slot returns to `open`.

### 3.4 `session_status`
| From | To | Trigger |
|---|---|---|
| (insert) | scheduled | created with booking |
| scheduled | live | first participant joins (token minted) |
| scheduled | cancelled | booking cancelled before start |
| live | completed | `POST /sessions/:id/end` (idempotent) |
| live | cancelled | aborted (policy) |

```
scheduled ──join──▶ live ──end──▶ completed   (terminal)
    └──cancel──────────┴──cancel─▶ cancelled   (terminal)
```
Reaching `completed` triggers AI report generation (§3.5). `end` is idempotent — re-ending a
`completed` session is a no-op.

### 3.5 `ai_report_status`
| From | To | Trigger |
|---|---|---|
| (insert) | pending | session reaches `completed` |
| pending | ready | generation succeeds → `overall_score`, `generated_at` set; `booking.report_id` linked |
| pending | failed | generation error |
| failed | pending | manual/auto retry |

```
pending ──ok──▶ ready     (terminal)
   │  ▲
   └fail─┐
      failed ──retry──▶ pending
```
A report is **never** created before its session is `completed` (no insert path from a non-completed
session).

---

## 4. Deletion Policy

Default stance: **soft-delete user-facing and audit-relevant data; hard-delete only ephemeral or
expired-retention rows.** Soft delete = a nullable `deleted_at timestamptz` column (and the row is
excluded from all default queries via a Django default manager / partial indexes).

| Table | Policy | Rationale |
|---|---|---|
| users | **Soft** (`deleted_at`) + `status='suspended'` | identity must persist for FK integrity & audit |
| student_profiles / instructor_profiles | **Soft** | tied to user lifecycle |
| payment_proofs | **No delete until `retain_until`**, then **hard** | legal retention 5y (§2.7) |
| files (receipts) | **No delete until parent proof's `retain_until`**, then **hard** | follows proof |
| subscriptions | **Soft** | billing history / audit |
| bookings | **Soft** (status `cancelled`, not row delete) | reporting, credit audit |
| sessions / session_transcripts | **Soft** | report provenance |
| ai_reports | **Soft** | student progress history |
| topics / subtopics / questions | **Soft** | preserve references from past bookings/reports |
| availability_slots | **Hard** allowed only when `status='open'` and unreferenced; otherwise **soft/blocked** | a `booked` slot must never vanish from under a booking |
| placement_attempts / placement_results | **Soft** | student history |
| notifications | **Hard** (TTL purge, e.g. > 1 year & read) | ephemeral |
| admin_actions | **Never deleted** (append-only) | immutable audit trail |
| goals / plans / placement_questions | **Soft** via `active=false` (no row delete) | catalog integrity for historical references |

**Cascade summary**
- Hard-deleting a `topic` is disallowed while bookings reference it (FK RESTRICT); soft-delete instead.
- `ON DELETE CASCADE` is used only inside a single aggregate that is itself never hard-deleted in
  production (e.g. `subtopics`/`questions` under a topic, `session_transcripts` under a session) —
  cascade exists for correctness if an admin ever force-purges in a lower environment.
- `payment_proofs` and `bookings` use `ON DELETE RESTRICT` on their student/plan/topic FKs to block
  accidental loss of financially/legally relevant rows.

---

## 5. Audit Fields

Standard audit block applied to all **business** tables (everything except append-only `admin_actions`,
pure-`files` metadata, and lightweight join/transcript rows where noted):

| Field | Type | Null | Default | Set by |
|---|---|---|---|---|
| created_at | timestamptz | NO | now() | DB default on insert |
| updated_at | timestamptz | NO | now() | trigger/ORM on every update |
| created_by | uuid | YES | NULL | FK users.id — actor who created the row (null for system/self-signup) |
| updated_by | uuid | YES | NULL | FK users.id — actor who last modified |

**Where each applies**

| Scope | created_at | updated_at | created_by | updated_by |
|---|---|---|---|---|
| Core business tables (users, profiles, subscriptions, payment_proofs, topics, questions, availability_slots, bookings, sessions, ai_reports, plans, placement_questions) | ✅ | ✅ | ✅ | ✅ |
| Append-only logs (admin_actions) | ✅ | — | (admin_id serves as actor) | — |
| Reference catalog (goals) | ✅ | ✅ | — | — |
| Lightweight/derived (subtopics, placement_attempts/results, session_transcripts, notifications, files) | ✅ | ✅ where mutable | — | — |

- `created_by`/`updated_by` are nullable because some rows originate from the actor themselves
  (self-signup) or from system jobs (the expiry sweep sets `updated_by = NULL` / a system user).
- `updated_at` is maintained by a `BEFORE UPDATE` trigger so it is correct even for non-ORM writes.

---

## 6. Admin Manual Actions

All four manual actions are (a) executed in a transaction that mutates the target row **and** (b)
recorded as an immutable `admin_actions` row. The table-level shape is in §1.21; the mapping:

| Manual action | Target mutation | `admin_actions.action_type` | Extra fields captured |
|---|---|---|---|
| **Payment approval** | `payment_proofs`: status→approved, `reviewed_by`, `reviewed_at`; **and** linked `subscriptions`: pending→active, `started_at`, `expires_at`, `sessions_remaining`, `activated_by` | `payment_approve` | reason (optional), metadata (proof+sub before/after) |
| **Payment rejection** | `payment_proofs`: status→rejected, `reviewed_by`, `reviewed_at`, `review_note` | `payment_reject` | reason = review_note |
| **Payment reopen** | `payment_proofs`: status→pending | `payment_reopen` | metadata (prior status) |
| **Subscription extension** | `subscriptions`: bump `expires_at`, set `extended_by`, `extended_at`; status expired→active if needed | `subscription_extend` | reason, metadata (old/new expires_at) |
| **Subscription top-up** | `subscriptions`: `sessions_remaining += N` (no rollover beyond admin grant) | `subscription_topup` | amount = N sessions, reason |
| **Manual refund note** | *no balance mutation* — record only (money refunded out-of-band) | `refund_note` | amount, currency, reason |
| **Booking cancellation credit decision** | `bookings`: status→cancelled, `cancelled_at`, `credit_refunded`; slot released; if refunded, `subscriptions.sessions_remaining += 1` | `booking_cancel_override` (only when admin overrides the automatic 24h rule) | reason, metadata (auto vs override) |

**Credit decision detail (Business Rule 8)**
- The **automatic** path (student self-cancel) computes `credit_refunded = (now() < scheduled_at - interval '24 hours')` and, if true, increments `sessions_remaining` in the same transaction. This is *not* an admin action and writes no `admin_actions` row.
- An **admin override** (forcing a refund inside the 24h window, or denying one outside it) sets
  `credit_refunded` explicitly and **does** write a `booking_cancel_override` row with a reason.
- **No automatic monetary refunds** exist anywhere; money movement is only ever a `refund_note` record.

---

## Placement (Phase 8C) — `apps.placement`

A **separate app** for the Phase-8 AI-led placement interview (two sections: written +
spoken/AI-tutor). Additive; the legacy `onboarding` placement tables are untouched. UUID
PKs. Scoring lives only in `domain.placement`; these tables just persist. **No
pronunciation field anywhere.**

### `placement_question` (fixed, owned content — CTO-001)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| question_type | enum(written\|spoken) | indexed |
| prompt | text | |
| skill | enum(grammar\|vocabulary\|fluency\|comprehension\|conversation) | |
| cefr_band | enum(A1..C1) | five-level ladder (no A0/C2) |
| order | int | |
| is_active | bool | indexed |
| ai_alternatives | jsonb | oral guidance only — **never** used to grade |
| scoring_rubric / options / correct_answer / correct_index | jsonb / text / int | **server-only** — never in a public DTO |
| created_at / updated_at | timestamptz | |

Constraints: **UNIQUE(question_type, order)** (order unique per type); index `(question_type, is_active)`.

### `placement_attempt`
`student → StudentProfile`, `status` enum(in_progress\|submitted\|assessed\|reset),
`version`, `goal → onboarding.Goal (nullable)`, `started_at/submitted_at/assessed_at`,
`fallback_used`, `provider_name`, audit timestamps.
Constraint: **partial UNIQUE(student) WHERE status='in_progress'** — one active attempt per
student. Indexes `(student,-started_at)`, `(status)`.

### `placement_written_answer` / `placement_spoken_answer`
`attempt → PlacementAttempt (CASCADE)`, `question → PlacementQuestion (PROTECT)`,
answer/transcript text, optional `score`, `created_at`. Spoken adds `stt_provider`,
`stt_confidence`, `spoken_attempt_number` (STT output is text-only — no audio stored, no
pronunciation). Constraint: **UNIQUE(attempt, question)** on each.

### `placement_assessment_result`
**OneToOne(attempt)** → one result per attempt. Flat scores
(`overall_conversation/grammar/vocabulary/fluency/confidence/written/spoken`),
`cefr_level`, `spoken_capped/spoken_ceiling`, recommendation JSON
(`strengths/weaknesses/recommended_focus/recommended_conversation_topics/recommended_instructor_difficulty`),
`evaluator_version`, `provider_name`, `fallback_used`, `created_at`. **No pronunciation.**

### `placement_reset_audit`
Immutable record of an admin reopening a spoken attempt: `student`, `attempt (SET_NULL)`,
`reset_by → User (SET_NULL)`, `reason`, `reset_at`. Append-only (admin read-only).

> The one-shot spoken rule is enforced at the application/use-case layer (Phase 8E) using
> repository signals `has_used_spoken(student)` + `reset_after_use(student)`; the model layer
> records the audited reset.

---

## Cross-references
- API endpoints per table: see [backend-plan.md §5](backend-plan.md).
- Business rules these constraints enforce: see [backend-plan.md §4](backend-plan.md) and the
  Resolved Product Decisions section.
- This document changes **no product scope** and adds **no features** — it is the persistence design
  for the already-approved MVP.
