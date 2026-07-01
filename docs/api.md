# OneClub — API Reference (v1)

Thin DRF layer over the application use cases. Base path: **`/api/v1`**.

**Architecture guarantee:** views contain no business logic, never touch the ORM,
and never return Django models. Each view validates input, calls exactly one use
case with `actor=request.user`, and serializes the returned DTO. See
[backend-architecture.md](backend-architecture.md).

## Auth

JWT bearer (SimpleJWT). Obtain a token, then send `Authorization: Bearer <access>`.

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/token/` | `{username,password}`* | returns `{access, refresh}` |
| POST | `/auth/token/refresh/` | `{refresh}` | returns `{access}` |

\* `username` is the email (the user model's `USERNAME_FIELD`).

`/onboarding/goals/` and `/billing/plans/` are public (`AllowAny`); everything else
requires authentication. Authorization (role + ownership) is enforced **inside the
use cases**, not in the views.

## Conventions

- JSON in/out, **camelCase** keys.
- Server-only fields are structurally absent from DTOs (no `correctIndex`,
  `passwordHash`, `isStaff`, provider secrets) — a serializer cannot leak what the
  DTO does not contain.
- IDs are UUID strings. Timestamps are ISO-8601.

## Error model

Every error shares one shape, produced by the global handler
(`api/exceptions.py`):

```json
{ "code": "no_active_subscription", "detail": "..." }
```

| `code` | HTTP | Raised when |
|---|---|---|
| `not_authenticated` | 401 | missing/invalid token |
| `permission_denied` | 403 | role/ownership check fails |
| `no_active_subscription` | 403 | booking without an active subscription |
| `questions_not_available` | 403 | full questions before a confirmed booking |
| `validation_error` | 400 | request body fails serializer validation |
| `not_found` | 404 | repository `.get()` miss / no active subscription |
| `invalid_state` | 409 | illegal state transition (e.g. re-approving a decided proof) |
| `subscription_expired` | 409 | booking on an expired subscription |
| `no_sessions_remaining` | 409 | booking with zero credits |
| `slot_unavailable` | 409 | double-booking a slot |
| `session_not_joinable` | 409 | joining a non-joinable session |
| `ai_report_already_generated` | 409 | regenerating a ready report |
| `email_already_registered` | 409 | registering an existing email |
| `duplicate_transaction_number` | 409 | reusing a bank transaction number |
| `domain_error` | 422 | generic domain rule violation |

## Endpoints

`Role` = the authorization enforced by the use case. `UC` = the use case invoked.

### Auth / Profile
| Method | Path | Role | UC | Returns |
|---|---|---|---|---|
| POST | `/auth/register/` | public | RegisterStudent | `UserProfile` (201) — body `{fullName, email, password}` |
| GET | `/me/` | any | GetCurrentUserProfile | `UserProfile` |
| PATCH | `/me/` | self | UpdateCurrentProfile | `UserProfile` — body `{fullName}` |
| PUT | `/me/goal/` | student | SetStudentGoal | `UserProfile` — body `{goalId}` |

### Onboarding / Goals
| Method | Path | Role | UC | Returns |
|---|---|---|---|---|
| GET | `/onboarding/goals/` | public | ListGoalOptions | `GoalOption[]` |

### Placement (Phase 8E — AI-led written + spoken)
Implemented thin endpoints. Responses are DTO-only camelCase; **never expose
`correctAnswer`/`correctIndex`/`options`** and **no pronunciation field anywhere**.
Placement personalizes the student's level — it does **not** unlock booking.

| Method | Path | Role | UC | Returns |
|---|---|---|---|---|
| GET | `/placement/test/` | student | ListPlacementQuestions | `{written:[], spoken:[]}` (no answer key) |
| POST | `/placement/start/` | student | StartPlacementAttempt | `PlacementAttempt` (201; create or reuse) |
| GET | `/placement/status/` | student | GetPlacementAttemptStatus | `{status, attemptId, writtenComplete, spokenComplete, assessed, canSubmit}` |
| POST | `/placement/written-answers/` | student | SaveWrittenAnswers | `PlacementAttempt` — body `{attemptId, answers:[{questionId,answerText}]}` |
| POST | `/placement/spoken-transcripts/` | student | SaveSpokenTranscripts | `PlacementAttempt` — body `{attemptId, transcripts:[{questionId,transcriptText}]}` (text only, one-shot) |
| POST | `/placement/submit/` | student | SubmitPlacementAttempt | `PlacementAssessment` (deterministic; `providerName`,`fallbackUsed`) |
| GET | `/placement/result/` | owner student | GetMyPlacementResult | `PlacementAssessment` (latest) |
| POST | `/admin/placement/{studentId}/reset-spoken/` | admin | AdminResetSpokenAttempt | `PlacementResetAudit` — body `{reason}` |

Placement error codes (global handler): `placement_attempt_not_found`(404),
`placement_result_not_found`(404), `placement_incomplete`(409), `spoken_attempt_used`(409),
`placement_reset_required`(409), `invalid_placement_question`(422). The legacy onboarding
placement endpoints (`/placement/attempts/{id}/result/`) are **removed** — superseded by
`/placement/submit/` + `/placement/result/`.

### Billing
| Method | Path | Role | UC | Returns |
|---|---|---|---|---|
| GET | `/billing/plans/` | public | ListPlans | `Plan[]` |
| GET | `/billing/payment-instructions/` | public | GetPaymentInstructions | `PaymentInstructions` `{bankName, accountName, accountNumber, iban?, transferMethod, instructions}` |
| POST | `/billing/payment-proof/` | student | SubmitPaymentProof | `PaymentProofDetail` (201) — **multipart**: `receipt` file + `planId, transactionNumber, transferDatetime, amount, senderName?, receiverName?, rawOcrData?` |
| GET | `/student/subscription/` | student | GetCurrentSubscription | `SubscriptionDetail` — **404 if none active** |
| GET | `/student/billing/history/` | student | ListStudentBillingHistory | `BillingHistoryItem[]` |

> **PaymentProof is a manual verification workflow, not online payment.** The
> receipt image is stored, `transactionNumber` is **unique** (reuse → `409
> duplicate_transaction_number`), the proof starts as `pending_review`, and
> `rawOcrData` is informational only — it never auto-approves. Approval stays a
> manual admin action.

> **Payment provider is configurable, not hardcoded.** `/billing/payment-instructions/`
> returns the bank-transfer details from settings (`PAYMENT_INSTRUCTIONS`, env-driven via
> `PAYMENT_BANK_NAME`, `PAYMENT_ACCOUNT_NAME`, `PAYMENT_ACCOUNT_NUMBER`, `PAYMENT_IBAN`,
> `PAYMENT_TRANSFER_METHOD`, `PAYMENT_INSTRUCTIONS_TEXT`). Default production provider:
> **Bank of Khartoum** via **Bankak**. `iban` is optional (omitted/empty when not set).

### Student Scheduling
| Method | Path | Role | UC | Returns |
|---|---|---|---|---|
| GET | `/student/dashboard/` | student | GetStudentDashboard | `StudentDashboard` |
| GET | `/student/topics/` | student | ListStudentAvailableTopics | `TopicPreview[]` |
| GET | `/student/topics/{id}/` | student | GetTopicPreviewOrFull | `TopicPreview` or `TopicFull` (by booking) |
| GET | `/student/topics/{id}/questions/` | student + booking | GetQuestionsForBooking | `QuestionFull[]` (403 if no booking) |
| GET | `/instructors/{id}/availability/` | student | ListAvailableSlots | `AvailableSlot[]` |
| GET | `/student/bookings/` | student | ListStudentBookings | `BookingListItem[]` |
| POST | `/student/bookings/` | student | CreateBooking | `BookingResult` (201) — body `{topicId, slotId}` |
| GET | `/student/bookings/{id}/` | owner | GetBookingDetail | `BookingDetail` |
| DELETE | `/student/bookings/{id}/` | owner | CancelBooking | `Cancellation` (incl. `creditRefunded`) |

### Instructor
| Method | Path | Role | UC | Returns |
|---|---|---|---|---|
| GET | `/instructor/dashboard/` | instructor | GetInstructorDashboard | `InstructorDashboard` |
| GET | `/instructor/topics/` | instructor | ListInstructorTopics | `TopicFull[]` (own; all questions) |
| POST | `/instructor/topics/create/` | instructor | CreateTopic | `TopicFull` (201) — draft, unpublished |
| PUT | `/instructor/topics/{id}/` | owner | UpdateTopic | `TopicFull` |
| POST | `/instructor/topics/{id}/publish/` | owner | PublishTopic | `TopicFull` (needs title + description + ≥1 approved question) |
| POST | `/instructor/topics/{id}/questions/` | owner | AddManualQuestion | `QuestionFull` (201; approved on creation) |
| POST | `/instructor/topics/{id}/questions/{qid}/approve/` | owner | ApproveAIQuestion | `QuestionFull` |
| GET | `/instructor/availability/` | instructor | ListInstructorAvailability | `InstructorSlot[]` |
| PUT | `/instructor/availability/set/` | instructor | SetAvailability | `InstructorSlot[]` — body `{slots:[{startAt, durationMinutes?}]}` (booked slots preserved) |
| POST | `/instructor/topics/{id}/suggest-subtopics/` | owner | GenerateTopicSubtopics | `Suggestion` (proposals) |
| POST | `/instructor/topics/{id}/suggest-questions/` | owner | GenerateDiscussionQuestions | `Suggestion` (201; drafts `approved=false`) |

### Admin
| Method | Path | Role | UC | Returns |
|---|---|---|---|---|
| GET | `/admin/dashboard/` | admin | GetAdminDashboard | `AdminDashboard` |
| GET | `/admin/payment-proofs/` | admin | ListAdminPaymentApprovals | `PaymentApprovalItem[]` |
| POST | `/admin/payment-proofs/{id}/approve/` | admin | ApprovePaymentProof | `PaymentApprovalResult` (activates subscription) |
| POST | `/admin/payment-proofs/{id}/reject/` | admin | RejectPaymentProof | `PaymentDecision` — body `{note?}` |
| POST | `/admin/payment-proofs/{id}/reopen/` | admin | ReopenPaymentProof | `PaymentDecision` |
| PATCH | `/admin/subscriptions/{id}/extend/` | admin | ExtendSubscription | `SubscriptionResult` — body `{newExpiresAt, reason?}` |
| PATCH | `/admin/subscriptions/{id}/topup/` | admin | TopUpSubscription | `SubscriptionResult` — body `{sessions, reason?}` |
| POST | `/admin/subscriptions/{id}/refund-note/` | admin | RecordRefundNote | `RefundNote` (201) — body `{amount, currency, reason}` |
| POST | `/admin/bookings/{id}/cancel/` | admin | CancelBooking | `Cancellation` — body `{forceCredit?}` |

### Sessions
| Method | Path | Role | UC | Returns |
|---|---|---|---|---|
| GET | `/sessions/{id}/` | participant | GetSessionDetail | `SessionDetail` (approved questions + vocabulary) |
| POST | `/sessions/{id}/join/` | participant | JoinSession | `VideoJoin` → `{agoraAppId, channel, agoraToken, uid, expiresAt}` |
| POST | `/sessions/{id}/start/` | participant | StartSession | `SessionResult` |
| POST | `/sessions/{id}/end/` | participant | CompleteSession | `SessionResult` (prepares pending report) |
| POST | `/sessions/{id}/transcript/` | participant | AttachTranscript | `Transcript` (201) — body `{content, source?}` |

### AI Reports
| Method | Path | Role | UC | Returns |
|---|---|---|---|---|
| GET | `/reports/{id}/` | student/instructor/admin | GetAIReportDetail | `AIReportDetail` (skills, mistakes, recommendations, vocabulary, instructorNote) |
| GET | `/sessions/{id}/report/` | participant | GetSessionReport | `AIReportDetail` — **202 if still pending**, 404 if none |
| POST | `/sessions/{id}/report/generate/` | participant | GenerateSessionReport | `AIReportAck` (201) — body `{transcript?}` |

### Notifications
| Method | Path | Role | UC | Returns |
|---|---|---|---|---|
| GET | `/notifications/` | owner | ListNotifications | `Notification[]` |
| POST | `/notifications/{id}/read/` | owner | MarkNotificationRead | `Notification` |

## Video join payload (Agora)

`POST /sessions/{id}/join/` returns the credential minted server-side by the
`VideoProvider` port. The current adapter is a **stub** (no real Agora); the shape
is stable:

```json
{ "sessionId": "...", "provider": "stub", "agoraAppId": "stub-app-id",
  "channel": "session-...", "agoraToken": "stub-token::...", "uid": "...",
  "expiresAt": "..." }
```

The frontend passes `agoraAppId`/`channel`/`agoraToken`/`uid` to the Agora SDK; it
never mints tokens.

## Not built (deliberately out of scope)

- **Admin user management** (`GET/PATCH /admin/users/...`) — there is **no admin
  user-management screen** among the 20 approved frontend screens, so building it
  would be a new product feature. Skipped by design (the `AdminUserManagementUseCase`
  is intentionally not implemented).
- **Plan checkout / draft order** (`POST /billing/checkout/select`) — not required:
  `SubmitPaymentProof` records the chosen `planId` directly, and approval creates the
  subscription. No separate order step in the MVP.
- **Submit placement attempt** (`POST /placement/test/submit`) — the placement
  *scoring* use case exists (`POST /placement/attempts/{id}/result/`), but creating
  an attempt from raw answers has no use case yet. Add `SubmitPlacementAttemptUseCase`
  when the attempt-capture flow is built.

Everything else from the Phase-6B "missing use cases" list (registration, `/me`
update, set-goal, payment-proof submission, topic create/update/publish, manual
question add + AI-question approve, set-availability, notification mark-read,
session report read) is now implemented in Phase 6C.

The Phase-8 placement endpoints are now **implemented** (Phase 8E) — see the
**Placement** table above. Frontend wiring is the remaining step (a later phase).
