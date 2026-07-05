# Phase 9A.0 — Billing & Payment Verification Architecture

**Status:** Design only. No production code, no DB migrations, no frontend changes,
no OCR, no new gateways, no card payments in this phase.

OneClub billing is a **manual bank-transfer verification workflow**, not an online
payment gateway. A student pays manually (default: **Bank of Khartoum** via **Bankak**),
uploads proof, and an **admin** approves or rejects. Subscription activates **only** on
admin approval. AI/OCR may later *assist* the admin but must **never auto-approve**.

This document is grounded in the current codebase (`apps/billing`, `application/billing`,
`apps/admin_ops`, `api/`, `src/pages/billing`, `src/pages/admin`).

> **Implemented — Sprint 6 (Journey 3 complete).** The gaps designed above are now
> live:
> - **G1 `needs_info` state** — `PaymentProofStatus.NEEDS_INFO` +
>   `PaymentStatus.NEEDS_INFO`; state machine `pending_review → approved | rejected |
>   needs_info`; `needs_info` reopens to `pending_review` (admin reopen) or the student
>   re-submits.
> - **G2 Request-more-information** — `apps.billing.services.request_payment_info` +
>   `RequestPaymentInformationUseCase` (admin-only, note required) +
>   `POST /admin/payment-proofs/{id}/request-info/`, audited as `PAYMENT_REQUEST_INFO`,
>   notifies the student. No subscription is activated.
> - **G3 Admin proof-detail** — `GET /admin/payment-proofs/{id}/`
>   (`GetAdminPaymentProofUseCase`) returns the full proof + `receiptUrl` + student
>   context so admins no longer approve blind.
> - **Student status** — `GET /billing/payment-proof/latest/`
>   (`GetMyLatestPaymentProofUseCase`) drives the under-review screen's
>   pending / approved / rejected / needs-info states + review note.
> - **One active subscription** — approving a second proof for an already-active student
>   now raises a clean `409 subscription_already_active` (was an unmapped 500).
> - **Currency is `SDG`** (Sudanese pound) everywhere — plans, proofs, factory, and
>   fixtures — matching the Bank of Khartoum default (was `SAR`).
> Activation, credit assignment, idempotency, duplicate-transaction rejection, and
> proof immutability are unchanged and covered by tests
> (`api/tests/test_billing_journey3_api.py`, `src/test/journey3.test.tsx`).

---

## 1. Current State Review (gap analysis)

### What exists today
| Area | Current implementation | File |
|---|---|---|
| Plans | `Plan` model (code, price, currency, sessions_per_month, active) | `apps/billing/models.py` |
| Subscriptions | `Subscription` (status pending/active/expired, sessions_remaining, dates, activated_by); partial-unique one ACTIVE per student; `sessions ≥ 0` check; active⇒dates check | `apps/billing/models.py` |
| Payment proof | `PaymentProof` (plan snapshot, amount, currency, **unique** `transaction_number`, transfer_datetime, sender/receiver, `raw_ocr_data` JSON, `receipt_file`, status, reviewed_by/at, review_note, `retain_until` = submitted+5y) | `apps/billing/models.py` |
| Receipt files | `File` (storage_key, filename, content_type, uploaded_by); bytes in object storage via `FileStorageGateway` (stub now) | `apps/billing/models.py` |
| Audit | `AdminAction` (append-only; admin, action_type, target, amount, reason, metadata) | `apps/admin_ops/models.py` |
| Provider config | `settings.PAYMENT_INSTRUCTIONS` (env-driven: bank_name, account_name, account_number, iban, transfer_method, instructions) → `GET /billing/payment-instructions/` | `config/settings.py`, Phase 8F |
| Transactional logic | `approve/reject/reopen/extend/topup/record_refund_note` in `transaction.atomic`, each logs `AdminAction` | `apps/billing/services.py` |
| Use cases | Submit, Approve, Reject, Reopen, Extend, TopUp, RecordRefundNote, GetCurrentSubscription, ListPlans, ListStudentBillingHistory, GetPaymentInstructions | `application/billing/{use_cases,queries}.py` |
| Student API | `GET /billing/plans/`, `GET /billing/payment-instructions/`, `POST /billing/payment-proof/` (multipart), `GET /student/subscription/`, `GET /student/billing/history/` | `api/urls.py` |
| Admin API | `GET /admin/payment-proofs/`, `…/{id}/approve/`, `…/{id}/reject/`, `…/{id}/reopen/`, subscription extend/topup/refund-note, `GET /admin/dashboard/` | `api/urls.py` |
| Frontend | Pricing, BankTransfer (reads `payment-instructions`), PaymentProof, PaymentUnderReview, AdminPaymentApproval all wired | `src/pages/billing`, `src/pages/admin` |

### Gaps & risks found
| # | Finding | Severity | Target phase |
|---|---|---|---|
| G1 | **No `needs_more_info` state** — proof status is only pending/approved/rejected; the required state machine needs a "request more info" branch | High | 9A.2 |
| G2 | **No `RequestInfo` use case / `…/{id}/request-info/` endpoint** | High | 9A.3 |
| G3 | **No `GET /admin/payment-proofs/{id}/` detail endpoint** — admin cannot fetch the full proof + receipt URL (documented gap in `frontend-integration.md`) | High | 9A.3 |
| G4 | **Provider is settings-only, single** — no DB-backed `BankTransferAccount`/`PaymentProvider`, no `GET /billing/providers/` list, no `display_order`/`is_active`/multi-provider | Medium | 9A.1 |
| G5 | **No amount-vs-plan validation** — `SubmitPaymentProof` accepts an arbitrary `amount`; neither submit nor approve compares it to `plan.price` | High (fraud) | 9A.2 |
| G6 | **No structured OCR result** — `raw_ocr_data` is an opaque JSON blob; no `ReceiptExtractionResult` with `confidence_score`/typed fields | Low (design seam) | 9A.5 |
| G7 | **Latent bug** — `PaymentProof.__str__` references `self.reference`, a field that does not exist → `AttributeError` when stringified (admin list/log) | Medium | 9A.2 |
| G8 | **Multiple open proofs** — nothing stops a student from submitting several `pending_review` proofs for the same plan simultaneously | Medium | 9A.2 |
| G9 | **Endpoint naming drift** vs target: current `…/payment-instructions/` & `/student/billing/history/` vs requested `/billing/bank-account/` & `/billing/history/` | Low | 9A.1 / 9A.4 |
| G10 | **No dedicated admin billing dashboard** endpoint — admin metrics live inside the generic `GET /admin/dashboard/` | Low | 9A.3 |
| G11 | **Frontend BankTransferPage still imports `plans` mock** for the order summary (plan data, not bank data) — should use `usePlans` | Low | 9A.6 |
| ✓ | **Al Rajhi removed** — no hardcoded bank name anywhere (Phase 8); bank name comes from config | Resolved | — |

---

## 2. Target Domain Model

Legend: **[exists]** unchanged · **[refactor]** modify existing · **[new]** add later (design only).

| Model | Status | Purpose / change |
|---|---|---|
| `PaymentProvider` | **[new]** | Logical provider (e.g. *Bank of Khartoum*). Groups one or more accounts. `provider_key`, `provider_name`, `transfer_method`, `currency`, `is_active`, `display_order`. |
| `BankTransferAccount` | **[new]** | The concrete account shown to students: `bank_name`, `account_name`, `account_number`, `iban?`, `instructions`, FK→`PaymentProvider`, `is_active`, `display_order`. Replaces the settings-only single account (settings becomes the **seed default**, not the source of truth). |
| `PaymentProof` | **[refactor]** | Add `needs_more_info` status support, link to the chosen `BankTransferAccount` (`account_id` snapshot), and an `amount_matches_plan` derived/validated flag. Keep unique `transaction_number`, retention, receipt FK. Fix the `__str__` bug (G7). |
| `PaymentReview` | **[new, optional]** | One row **per review event** (pending→needs_info→resubmit→approve), giving a multi-step review trail: `proof_id`, `reviewer_id`, `decision`, `note`, `created_at`. Today review state is flattened onto `PaymentProof` (single reviewer/note). Recommended for an auditable back-and-forth; if deferred, the `AdminAction` log + proof fields are the interim trail. |
| `Subscription` | **[exists]** | No structural change. Still activated only by approval; one ACTIVE per student; `sessions_remaining` credited from `plan.sessions_per_month`. |
| `BillingHistory` | **[exists, derived]** | Not a table — derived from the student's `PaymentProof` rows (+ signed receipt URLs). Keep as a query/projection. |
| `AdminAction` | **[exists]** | Append-only audit log. Add `PAYMENT_REQUEST_INFO` to `AdminActionType`. Continue logging every decision. |
| `ReceiptExtractionResult` | **[new, design-only]** | Structured, **advisory** OCR output linked 1:1 to a `PaymentProof`: typed fields + `confidence_score` + `raw_ocr_data`. Never gates approval. (9A.5 seam; not implemented now.) |

**Why a model instead of settings for the provider (G4):** the target requires
`is_active`, `display_order`, multiple selectable accounts, and admin-editability —
all of which need rows, not a static dict. Settings remain as the **idempotent seed**
of the default (Bank of Khartoum / Bankak) so existing deployments keep working.

---

## 3. Payment Provider Configuration

`BankTransferAccount` (joined to `PaymentProvider`) — the contract surfaced to the UI:

| Field | Type | Notes |
|---|---|---|
| `provider_key` | slug, unique | machine key, e.g. `bank_of_khartoum` |
| `provider_name` | str | **default: "Bank of Khartoum"** |
| `transfer_method` | str | **default: "Bankak"** |
| `bank_name` | str | the bank to transfer to |
| `account_name` | str | beneficiary name |
| `account_number` | str | |
| `iban` | str, **optional** | shown only when present |
| `instructions` | text | free-form how-to-pay |
| `currency` | 3-char | default `SAR` today → align with plan currency |
| `is_active` | bool | only active accounts are listed |
| `display_order` | int | stable ordering in the UI |

Rules: **no bank name is ever hardcoded in the frontend** — the UI renders whatever
the API returns. Seed/migration creates the default active account from
`settings.PAYMENT_INSTRUCTIONS` so nothing breaks. `iban` empty ⇒ omitted from the
response (matches current `PaymentInstructions` behaviour).

---

## 4. Payment Proof Workflow (state machine)

```
selected_plan
   ↓ (student picks a plan on Pricing)
bank_instructions_shown            (BankTransferPage reads GET /billing/bank-account/)
   ↓ (student transfers via Bankak, captures receipt)
proof_submitted  ──► POST /billing/payment-proof/  (multipart; unique txn; receipt required)
   ↓
pending_review
   ├──► approved          ──► subscription_activated     (admin approve)
   ├──► rejected          ──► rejected_closed            (admin reject + reason)
   └──► needs_more_info   ──► (student resubmits/updates) ──► pending_review   (NEW)
```

Transition rules:
- **Only `pending_review` → approved | rejected | needs_more_info** is a valid admin move.
- `needs_more_info` → student supplies info → back to `pending_review` (new review event).
- **Idempotency:** approving/rejecting a non-pending proof → `409 invalid_state`
  (`PaymentAlreadyDecided`, already enforced).
- **Duplicate transaction:** unique `transaction_number` at submit → `409
  duplicate_transaction_number` (enforced today; keep).
- **Receipt retention:** `retain_until = submitted_at + 5y`; proofs are never row-deleted.
- **Manual review only:** OCR/`raw_ocr_data` is advisory; a human always decides.
- **Audit:** every decision writes an `AdminAction` (approve/reject/reopen, + new
  request-info) with reviewer, reason/note, and before/after metadata.

---

## 5. OCR / Bankak Receipt Extraction Strategy (design only)

A future `ReceiptExtractionGateway` (port) with a stub default, mirroring the existing
`AIProvider`/`VideoProvider` seams. On submit (or async post-submit), it *may* populate a
`ReceiptExtractionResult`:

| Field | Use |
|---|---|
| `transaction_number`, `transfer_datetime`, `amount`, `sender_name`, `receiver_name`, `bank_name`, `status` | pre-fill / cross-check against what the student typed and the plan |
| `confidence_score` (0–1) | surfaced to admin as a hint only |
| `raw_ocr_data` (JSON) | full provider payload for audit |

**Hard rules:** OCR is **optional**; result is **advisory only**; the **admin is the
final approver**; **low confidence never blocks** manual review; OCR **never** changes a
proof's status. The extraction result is a sibling record, not a gate.

---

## 6. Subscription Activation Rules

- **Created/activated:** only inside `approve_payment_proof` (one `transaction.atomic`).
  A `Subscription` row is created (or the pending one promoted) and set `ACTIVE` with
  `started_at = now`, `expires_at = now + plan.billing_period_days`.
- **Credits:** `sessions_remaining = plan.sessions_per_month` at activation; mirrored onto
  `StudentProfile.sessions_remaining` and `payment_status = approved`.
- **planId ↔ proof:** the proof snapshots `plan` + `plan_name` + `amount` at submit; the
  approved subscription uses that same plan. (Plan price is immutable per proof via snapshot.)
- **On rejection:** no subscription; proof → `rejected` with reason; student
  `payment_status = rejected`. Student may submit a fresh proof (new txn number).
- **Duplicate transaction:** rejected at submit with `409 duplicate_transaction_number`;
  no proof row persists.
- **Amount mismatch (G5, NEW):** if submitted `amount ≠ plan.price`, **do not auto-reject**
  — accept the proof but flag `amount_matches_plan = false` and surface it prominently to
  the admin; the admin decides. (Manual-review philosophy: flag, don't block.)
- **Proof submitted twice (G8):** enforce **at most one open proof** (`pending_review` or
  `needs_more_info`) per student per plan; a second open submission → `409 invalid_state`.
  Already-decided proofs don't block new submissions.

---

## 7. API Contract

All JSON camelCase; errors `{code, detail}` via the global handler; auth = JWT; ownership
& role enforced **in use cases**.

### Student
| Method | Path | UC | Req → Resp | Codes |
|---|---|---|---|---|
| GET | `/billing/providers/` | ListPaymentProviders | — → `Provider[]` (`{providerKey, providerName, transferMethod, currency}`) | 200 |
| GET | `/billing/bank-account/` | GetActiveBankAccount | — → `BankAccount` (`{bankName, accountName, accountNumber, iban?, transferMethod, instructions, currency}`) | 200 |
| POST | `/billing/payment-proof/` | SubmitPaymentProof | **multipart** `{receipt(file), planId, transactionNumber, transferDatetime, amount, senderName?, receiverName?}` → `PaymentProofDetail` | 201 · 400 validation · 409 `duplicate_transaction_number` · 409 `invalid_state` (open proof exists) |
| GET | `/billing/history/` | ListStudentBillingHistory | — → `BillingHistoryItem[]` (owner only) | 200 |
| GET | `/student/subscription/` | GetCurrentSubscription | — → `SubscriptionDetail` | 200 · **404 if none active** |

> `/billing/bank-account/` is the renamed/forward of today's `/billing/payment-instructions/`
> (keep the old path as an alias for one phase to avoid breaking the wired BankTransferPage).
> `/billing/history/` forwards today's `/student/billing/history/`.

### Admin (role = admin, enforced in the use case)
| Method | Path | UC | Req → Resp | Codes |
|---|---|---|---|---|
| GET | `/admin/payment-proofs/` | ListAdminPaymentApprovals | `?status=` → `PaymentApprovalItem[]` | 200 · 403 |
| GET | `/admin/payment-proofs/{id}/` | GetPaymentProofDetail (**new**) | — → `PaymentProofDetail` (incl. signed `receiptUrl`, `amountMatchesPlan`, OCR hint) | 200 · 403 · 404 |
| POST | `/admin/payment-proofs/{id}/approve/` | ApprovePaymentProof | — → `PaymentApprovalResult` (subscription activated) | 200 · 403 · 409 `invalid_state` |
| POST | `/admin/payment-proofs/{id}/reject/` | RejectPaymentProof | `{note}` (**reason required**) → `PaymentDecision` | 200 · 403 · 409 |
| POST | `/admin/payment-proofs/{id}/request-info/` | RequestPaymentInfo (**new**) | `{note}` → `PaymentDecision` (status `needs_more_info`) | 200 · 403 · 409 |
| GET | `/admin/billing/dashboard/` | GetAdminBillingDashboard (**new**) | — → `{pendingCount, needsInfoCount, approvedToday, revenue, queue[]}` | 200 · 403 |

**Permissions / ownership:** student endpoints resolve the actor's own
`StudentProfile`; `GET /billing/history/` and `/student/subscription/` return **only the
caller's** rows (no `studentId` parameter). Admin endpoints call `ensure_admin(actor)`.

---

## 8. Frontend Flow

| Page | Reads | Writes | Cleanup |
|---|---|---|---|
| **PricingPage** | `usePlans` | selects plan (stash planId) | already wired |
| **BankTransferPage** | `useBankAccount` (was `usePaymentInstructions`) + `usePlans` for order summary | — | **G11:** drop the `plans` mock import → `usePlans` |
| **PaymentProofPage** | selected plan | `useSubmitPaymentProof` (multipart) | handle `duplicate_transaction_number`, `invalid_state` inline |
| **PaymentUnderReviewPage** | `useSubscription` (poll) + latest proof status | — | show `needs_more_info` with the admin's note + resubmit CTA |
| **StudentDashboard** | `useStudentDashboard` (payment_status) | — | reflect `needs_more_info` |
| **AdminPaymentApprovalPage** | `useAdminProofs` (queue) + `useProofDetail(id)` (**new**: receipt image, amount-match flag, OCR hint) | approve / reject / **request-info** | add detail drawer + reason prompts |
| **BillingHistory** | `useBillingHistory` | — | surface per-proof status + receipt link |

**No mock bank data after implementation** — every bank value comes from
`/billing/bank-account/`. The only remaining mock to remove is the plan-summary import on
BankTransferPage (G11), not bank data.

---

## 9. Security & Fraud Risk Register

| Risk | Control |
|---|---|
| **Duplicate transaction reuse** | DB-unique `transaction_number` + submit-time check; race backstop on `IntegrityError` → `409`. |
| **Fake / reused receipt** | Manual admin review of the image; OCR cross-check (advisory); txn uniqueness; retention for dispute. |
| **Amount mismatch** | Flag `amountMatchesPlan=false`, surface to admin (G5); never auto-approve, never silently accept. |
| **Wrong bank account** | Single source of truth = active `BankTransferAccount`; instructions explicit; admin verifies receiver. |
| **Malicious file upload** | Validate content-type & size; store bytes in object storage via gateway (never executed/served inline); serve via short-lived signed URLs; never trust client filename for storage key. |
| **PII exposure** (sender/receiver names, receipts) | Receipts behind signed URLs; admin-only detail; never list receipt URLs to other students; retention policy bounded (5y) + access-logged. |
| **IDOR — student reads another's proof** | All student reads scoped to `get_student_profile(actor)`; **no** `studentId` parameter; ownership enforced in the use case, not the view. |
| **Admin audit** | Every decision (approve/reject/reopen/request-info) writes append-only `AdminAction` with reviewer, reason, before/after metadata; `PaymentReview` rows (if adopted) give a full back-and-forth trail. |
| **Privilege escalation** | `ensure_admin` in every admin use case; thin views never authorize. |

---

## 10. Test Strategy

| # | Test | Layer |
|---|---|---|
| 1 | provider/bank-account config returned correctly (default Bank of Khartoum / Bankak) | API |
| 2 | **no "Al Rajhi" reference anywhere** (negative assertion, source + responses) | API + FE |
| 3 | payment-proof submission persists proof + receipt, starts `pending_review` | use case |
| 4 | `transaction_number` uniqueness → `409 duplicate_transaction_number` (incl. race) | use case |
| 5 | admin approve → subscription ACTIVE, `sessions_remaining` credited, mirrors updated | service |
| 6 | admin reject → **no** subscription; status `rejected`; reason recorded | service |
| 7 | billing history returns **only the caller's** proofs (IDOR) | use case |
| 8 | receipt image **required** (missing file → 400) | API |
| 9 | amount mismatch → proof accepted but `amountMatchesPlan=false`, not auto-approved | use case |
| 10 | OCR is advisory — populating `raw_ocr_data`/extraction never changes status | use case |
| 11 | `needs_more_info` round-trip → resubmit returns to `pending_review` | service |
| 12 | one-open-proof rule → second open submission `409 invalid_state` | use case |
| 13 | frontend BankTransferPage uses the bank-account API (no hardcoded bank, no bank mock) | FE |
| 14 | admin proof-detail returns signed receipt URL + amount-match flag; admin-only | API |

---

## 11. Migration Plan (no breakage)

1. **Additive models first.** Create `PaymentProvider` + `BankTransferAccount` (+ later
   `ReceiptExtractionResult`, optional `PaymentReview`) in a new migration. A data
   migration **seeds the default active account** from `settings.PAYMENT_INSTRUCTIONS`
   (Bank of Khartoum / Bankak), so existing `GET /billing/payment-instructions/` behaviour
   is preserved.
2. **Status enum extension.** Add `needs_more_info` to `PaymentProofStatus` and
   `PAYMENT_REQUEST_INFO` to `AdminActionType` — additive, no rewrite of existing rows
   (all current proofs stay pending/approved/rejected).
3. **Endpoint aliasing.** Add `/billing/bank-account/` and `/billing/history/` as the
   canonical paths while keeping `/billing/payment-instructions/` and
   `/student/billing/history/` as **deprecated aliases** for one phase; the wired frontend
   keeps working, then is migrated in 9A.6.
4. **Existing PaymentProof rows.** Untouched: same table, same unique txn, same retention.
   New nullable columns (`account_id`, `amount_matches_plan`) default safely.
5. **Approval flow.** Unchanged transactionally; only adds the amount-match flag + the new
   request-info transition. Existing approve/reject tests stay green.
6. **Fix G7** (`__str__` → `self.transaction_number`) in the same hardening migration phase
   — pure code fix, no schema impact.
7. **Tests.** Keep all current billing tests; add the new ones from §10 alongside. No test
   is deleted, only added — guaranteeing the current flow is preserved.

---

## 12. Delivery Plan

| Phase | Scope | Key outputs |
|---|---|---|
| **9A.1** | Configurable Payment Provider + Bank Account API | `PaymentProvider` + `BankTransferAccount` models, seed-from-settings migration, `GET /billing/providers/`, `GET /billing/bank-account/` (alias old path) |
| **9A.2** | Payment Proof Workflow Hardening | `needs_more_info` status, amount-vs-plan flag (G5), one-open-proof rule (G8), fix `__str__` (G7), account snapshot on proof |
| **9A.3** | Admin Review Queue + Detail | `GET /admin/payment-proofs/{id}/` (G3), `…/request-info/` (G2), `GET /admin/billing/dashboard/` (G10), optional `PaymentReview` trail |
| **9A.4** | Billing History + Subscription View | `GET /billing/history/` (alias), subscription detail polish, status surfacing |
| **9A.5** | Bankak OCR Architecture seam | `ReceiptExtractionGateway` port + stub, `ReceiptExtractionResult` model (advisory only) |
| **9A.6** | Frontend Integration Cleanup | remove plan mock from BankTransferPage (G11), wire proof-detail + request-info + history, `needs_more_info` UX, alias→canonical endpoint switch |

**Guardrails for every phase:** payment stays a *verification* workflow; OCR never
auto-approves; subscription activates only on admin approval; no hardcoded bank name; no
card payments; no new external gateways.
