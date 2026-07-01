# OneClub — Phase 6A: DRF Endpoint Implementation Plan

**Status:** Planning only — no code. This plans the **thin** DRF presentation layer
over the existing use cases ([backend-architecture.md](backend-architecture.md)).
Every view does only: parse input → call **one** use case → serialize the returned
DTO → map `DomainError.code` to HTTP. No business logic, no ORM, no raw models in
views.

Conventions: base prefix `/api/v1`. Auth = SimpleJWT bearer unless marked
**public**. "Required role" is enforced by the use case's permission boundary
(`application/permissions.py`); the view may add a coarse DRF `permission_class` as
defense-in-depth but the use case is the source of truth.

---

## Domain Exception → HTTP Status (global mapping)

A single DRF exception handler maps any `BusinessRuleError`/`DomainError` by `.code`.

| Domain exception | `.code` | HTTP |
|---|---|---|
| `PermissionDenied` | `permission_denied` | 403 |
| `PaymentAlreadyDecided` / `InvalidStateTransition` | `invalid_state` | 409 |
| `NoActiveSubscription` | `no_active_subscription` | 403 |
| `SubscriptionExpired` | `subscription_expired` | 409 |
| `InsufficientSessionCredits` | `no_sessions_remaining` | 409 |
| `SlotAlreadyBooked` | `slot_unavailable` | 409 |
| `BookingCancellationWindowClosed` | `cancellation_window_closed` | 409 |
| `QuestionsNotAvailable` | `questions_not_available` | 403 |
| `SessionNotJoinable` | `session_not_joinable` | 409 |
| `AIReportAlreadyGenerated` | `ai_report_already_generated` | 409 |
| (generic) `DomainError` | `domain_error` | 422 |
| `Model.DoesNotExist` (repo `.get`) | `not_found` | 404 |
| DRF serializer validation | `validation_error` | 422 |
| Unauthenticated | — | 401 |

Response body shape for errors: `{ "code": <str>, "detail": <str> }`.

---

## 1. Auth / Profile

| Path | Method | Role | Input serializer | Output serializer | Use case | DTO | Domain exceptions | Status | Ownership notes |
|---|---|---|---|---|---|---|---|---|---|
| `/auth/token/` | POST | public | `TokenObtainPairSerializer` (SimpleJWT) | `TokenPairSerializer` | — (SimpleJWT view) | — | — | 200 / 401 | n/a |
| `/auth/token/refresh/` | POST | public | `TokenRefreshSerializer` | `AccessTokenSerializer` | — (SimpleJWT view) | — | — | 200 / 401 | n/a |
| `/auth/register/` | POST | public | `RegisterInputSerializer` | `AuthUserSerializer` | **RegisterUserUseCase** *(missing)* | `AuthResult` *(missing)* | `EmailAlreadyRegistered` *(missing)* | 201 / 409 / 422 | creates self student |
| `/auth/logout/` | POST | any | `RefreshTokenSerializer` | — | — (token blacklist) | — | — | 204 | self token only |
| `/me/` | GET | any | — | `MeSerializer` | **GetMyProfileUseCase** *(missing)* | `MeResult` *(missing)* | `PermissionDenied` | 200 / 401 | actor == request.user |
| `/me/` | PATCH | any | `UpdateMeInputSerializer` | `MeSerializer` | **UpdateMyProfileUseCase** *(missing)* | `MeResult` *(missing)* | `PermissionDenied` | 200 / 422 | self only; role/status read-only |

Serializer guard: `AuthUserSerializer`/`MeSerializer` expose `id, full_name, email,
role`. Never expose `password_hash`, `is_superuser`, `is_staff`.

---

## 2. Onboarding / Placement

| Path | Method | Role | Input serializer | Output serializer | Use case | DTO | Domain exceptions | Status | Ownership notes |
|---|---|---|---|---|---|---|---|---|---|
| `/onboarding/goals/` | GET | public | — | `GoalSerializer` (many) | **ListGoalsUseCase** *(missing)* | `GoalDTO[]` *(missing)* | — | 200 | reference data |
| `/me/goal/` | PUT | student | `SetGoalInputSerializer` | `StudentProfileSerializer` | **SetStudentGoalUseCase** *(missing)* | `StudentProfileResult` *(missing)* | `PermissionDenied` | 200 / 422 | self student |
| `/placement/test/` | GET | student | — | `PlacementQuestionPublicSerializer` (many) | **GetPlacementTestUseCase** *(missing)* | `PlacementQuestionDTO[]` *(missing)* | — | 200 | **must omit `correct_index`** |
| `/placement/test/submit/` | POST | student | `PlacementSubmitInputSerializer` | `PlacementAttemptSerializer` | **SubmitPlacementAttemptUseCase** *(missing)* | `PlacementAttemptResult` *(missing)* | `PermissionDenied` | 201 / 422 | self student |
| `/placement/result/latest/` | GET | student | — | `PlacementResultSerializer` | **GetLatestPlacementResultUseCase** *(missing)* | `PlacementResultDTO` ✅ | `PermissionDenied` | 200 / 404 | self student |
| `/placement/result/<id>/` | GET | student | — | `PlacementResultSerializer` | **GetPlacementResultUseCase** *(missing)* | `PlacementResultDTO` ✅ | `PermissionDenied` | 200 / 404 | owner-only result |

> Scoring (`GeneratePlacementResultUseCase` ✅ exists) is triggered server-side by
> `SubmitPlacementAttemptUseCase`; `correct_index` is **never** serialized.

---

## 3. Billing

| Path | Method | Role | Input serializer | Output serializer | Use case | DTO | Domain exceptions | Status | Ownership notes |
|---|---|---|---|---|---|---|---|---|---|
| `/billing/plans/` | GET | public | — | `PlanSerializer` (many) | **ListPlansUseCase** *(missing)* | `PlanDTO[]` *(missing)* | — | 200 | active plans only |
| `/billing/checkout/select/` | POST | student | `SelectPlanInputSerializer` | `OrderSerializer` | **SelectPlanUseCase** *(missing)* | `OrderResult` *(missing)* | `PermissionDenied` | 201 / 422 | self student |
| `/billing/bank-account/` | GET | student | — | `BankAccountSerializer` | **GetBankAccountUseCase** *(missing)* | `BankAccountDTO` *(missing)* | — | 200 | static config |
| `/billing/upload-url/` | POST | student | `UploadUrlInputSerializer` | `UploadUrlSerializer` | **CreateReceiptUploadUrlUseCase** *(missing)* | `UploadUrlResult` *(missing)* | `PermissionDenied` | 201 / 422 | self; uses `FileStorageGateway` |
| `/billing/payment-proof/` | POST | student | `SubmitPaymentProofInputSerializer` | `PaymentProofSerializer` | **SubmitPaymentProofUseCase** *(missing)* | `PaymentProofResult` *(missing)* | `PermissionDenied` | 201 / 422 | self student |
| `/billing/payment-proof/latest/` | GET | student | — | `PaymentProofSerializer` | **GetLatestPaymentProofUseCase** *(missing)* | `PaymentProofResult` *(missing)* | `PermissionDenied` | 200 / 404 | self student |
| `/student/billing/history/` | GET | student | — | `PaymentProofSerializer` (many) | **ListMyPaymentHistoryUseCase** *(missing)* | `PaymentProofResult[]` *(missing)* | `PermissionDenied` | 200 | self; signed receipt url |
| `/student/subscription/` | GET | student | — | `SubscriptionSerializer` | **GetMySubscriptionUseCase** *(missing)* | `SubscriptionResult` ✅ | `PermissionDenied` | 200 / 404 | self student |

Serializer guard: `PaymentProofSerializer` exposes status/amount/reference/receipt
URL; never exposes another student's proof or internal `reviewed_by` email.

---

## 4. Student Scheduling

| Path | Method | Role | Input serializer | Output serializer | Use case | DTO | Domain exceptions | Status | Ownership notes |
|---|---|---|---|---|---|---|---|---|---|
| `/student/topics/` | GET | student | — | `TopicListSerializer` (many) | **ListPublishedTopicsUseCase** *(missing)* | `TopicListDTO[]` *(missing)* | — | 200 | published only |
| `/student/topics/<id>/` | GET | student | — | `TopicAccessSerializer` | **GetTopicForStudentUseCase** ✅ | `TopicAccessResult` ✅ | `PermissionDenied`, `QuestionsNotAvailable` | 200 / 403 | preview vs full by booking |
| `/instructor/<id>/availability/` | GET | student | — | `SlotSerializer` (many) | **ListAvailableSlotsUseCase** ✅ | `SlotDTO[]` ✅ | `PermissionDenied` | 200 | open slots only |
| `/student/bookings/` | GET | student | — | `BookingSerializer` (many) | **ListMyBookingsUseCase** *(missing)* | `BookingDTO[]` *(missing)* | `PermissionDenied` | 200 | self bookings |
| `/student/bookings/` | POST | student | `CreateBookingInputSerializer` | `BookingSerializer` | **CreateBookingUseCase** ✅ | `BookingResult` ✅ | `NoActiveSubscription`, `SubscriptionExpired`, `InsufficientSessionCredits`, `SlotAlreadyBooked`, `PermissionDenied` | 201 / 403 / 409 | self student |
| `/student/bookings/<id>/` | DELETE | student | — | `CancellationSerializer` | **CancelBookingUseCase** ✅ | `CancellationResult` ✅ | `InvalidStateTransition`, `PermissionDenied` | 200 / 403 / 409 | owner; `force_credit` admin-only |
| `/student/dashboard/` | GET | student | — | `StudentDashboardSerializer` | **GetStudentDashboardUseCase** *(missing)* | `StudentDashboardResult` *(missing)* | `PermissionDenied` | 200 | self aggregate |

> `GetTopicForStudentUseCase` returns `mode=preview`/`full`; `TopicAccessSerializer`
> conditionally includes `questions`/`vocabulary` only when present (full mode). The
> `QuestionsNotAvailable` exception is reserved for an explicit "fetch questions"
> variant if added; the default gate is the preview/full DTO shape.

---

## 5. Instructor

| Path | Method | Role | Input serializer | Output serializer | Use case | DTO | Domain exceptions | Status | Ownership notes |
|---|---|---|---|---|---|---|---|---|---|
| `/instructor/dashboard/` | GET | instructor | — | `InstructorDashboardSerializer` | **GetInstructorDashboardUseCase** *(missing)* | `InstructorDashboardResult` *(missing)* | `PermissionDenied` | 200 | self instructor |
| `/instructor/topics/` | GET | instructor | — | `TopicSerializer` (many) | **ListInstructorTopicsUseCase** *(missing)* | `TopicDTO[]` *(missing)* | `PermissionDenied` | 200 | own topics |
| `/instructor/topics/` | POST | instructor | `CreateTopicInputSerializer` | `TopicSerializer` | **CreateTopicUseCase** *(missing)* | `TopicResult` *(missing)* | `PermissionDenied` | 201 / 422 | owner set to actor |
| `/instructor/topics/<id>/` | PUT | instructor | `UpdateTopicInputSerializer` | `TopicSerializer` | **UpdateTopicUseCase** *(missing)* | `TopicResult` *(missing)* | `PermissionDenied`, `InvalidStateTransition` | 200 / 403 / 422 | owner only |
| `/instructor/topics/<id>/publish/` | POST | instructor | — | `TopicSerializer` | **PublishTopicUseCase** *(missing)* | `TopicResult` *(missing)* | `PermissionDenied`, `InvalidStateTransition` | 200 / 403 / 422 | owner; requires fields |
| `/instructor/topics/<id>/suggest-subtopics/` | POST | instructor | — | `SuggestionSerializer` | **GenerateTopicSubtopicsUseCase** ✅ | `SuggestionResult` ✅ | `PermissionDenied` | 200 / 403 | owner; proposals only |
| `/instructor/topics/<id>/suggest-questions/` | POST | instructor | — | `SuggestionSerializer` | **GenerateDiscussionQuestionsUseCase** ✅ | `SuggestionResult` ✅ | `PermissionDenied` | 201 / 403 | owner; drafts `approved=false` |
| `/instructor/topics/<id>/questions/` | POST | instructor | `CreateQuestionInputSerializer` | `QuestionSerializer` | **AddQuestionUseCase** *(missing)* | `QuestionResult` *(missing)* | `PermissionDenied` | 201 / 422 | owner; manual question |
| `/instructor/topics/<id>/questions/<qid>/approve/` | POST | instructor | — | `QuestionSerializer` | **ApproveQuestionUseCase** *(missing)* | `QuestionResult` *(missing)* | `PermissionDenied`, `InvalidStateTransition` | 200 / 403 | owner approves AI/draft |
| `/instructor/availability/` | GET | instructor | — | `SlotSerializer` (many) | **GetInstructorAvailabilityUseCase** *(missing)* | `SlotDTO[]` ✅ | `PermissionDenied` | 200 | own slots |
| `/instructor/availability/` | PUT | instructor | `SetAvailabilityInputSerializer` | `SlotSerializer` (many) | **SetInstructorAvailabilityUseCase** *(missing)* | `SlotDTO[]` ✅ | `PermissionDenied`, `SlotAlreadyBooked` | 200 / 409 | own; can't free booked slot |

---

## 6. Admin

| Path | Method | Role | Input serializer | Output serializer | Use case | DTO | Domain exceptions | Status | Ownership notes |
|---|---|---|---|---|---|---|---|---|---|
| `/admin/dashboard/` | GET | admin | — | `AdminDashboardSerializer` | **GetAdminDashboardUseCase** *(missing)* | `AdminDashboardResult` *(missing)* | `PermissionDenied` | 200 | admin only |
| `/admin/payment-proofs/` | GET | admin | — | `PaymentProofAdminSerializer` (many) | **ListPaymentProofsUseCase** *(missing)* | `PaymentProofResult[]` *(missing)* | `PermissionDenied` | 200 | admin queue |
| `/admin/payment-proofs/<id>/` | GET | admin | — | `PaymentProofAdminSerializer` | **GetPaymentProofUseCase** *(missing)* | `PaymentProofResult` *(missing)* | `PermissionDenied` | 200 / 404 | admin; signed receipt url |
| `/admin/payment-proofs/<id>/approve/` | POST | admin | `ReviewNoteInputSerializer` | `PaymentApprovalSerializer` | **ApprovePaymentProofUseCase** ✅ | `PaymentApprovalResult` ✅ | `PermissionDenied`, `PaymentAlreadyDecided` | 200 / 403 / 409 | admin only |
| `/admin/payment-proofs/<id>/reject/` | POST | admin | `ReviewNoteInputSerializer` | `PaymentDecisionSerializer` | **RejectPaymentProofUseCase** ✅ | `PaymentDecisionResult` ✅ | `PermissionDenied`, `PaymentAlreadyDecided` | 200 / 403 / 409 | admin only |
| `/admin/payment-proofs/<id>/reopen/` | POST | admin | — | `PaymentDecisionSerializer` | **ReopenPaymentProofUseCase** ✅ | `PaymentDecisionResult` ✅ | `PermissionDenied` | 200 / 403 | admin only |
| `/admin/subscriptions/` | GET | admin | — | `SubscriptionSerializer` (many) | **ListSubscriptionsUseCase** *(missing)* | `SubscriptionResult[]` *(missing)* | `PermissionDenied` | 200 | admin only |
| `/admin/subscriptions/<id>/extend/` | PATCH | admin | `ExtendSubscriptionInputSerializer` | `SubscriptionSerializer` | **ExtendSubscriptionUseCase** ✅ | `SubscriptionResult` ✅ | `PermissionDenied` | 200 / 403 / 422 | admin only |
| `/admin/subscriptions/<id>/topup/` | PATCH | admin | `TopUpInputSerializer` | `SubscriptionSerializer` | **TopUpSubscriptionUseCase** ✅ | `SubscriptionResult` ✅ | `PermissionDenied`, `DomainError` (non-positive) | 200 / 403 / 422 | admin only |
| `/admin/subscriptions/<id>/refund-note/` | POST | admin | `RefundNoteInputSerializer` | `RefundNoteSerializer` | **RecordRefundNoteUseCase** ✅ | `RefundNoteResult` ✅ | `PermissionDenied` | 201 / 403 | admin only; record-only |
| `/admin/bookings/<id>/cancel/` | POST | admin | `AdminCancelInputSerializer` | `CancellationSerializer` | **CancelBookingUseCase** ✅ | `CancellationResult` ✅ | `PermissionDenied`, `InvalidStateTransition` | 200 / 403 / 409 | admin override (`force_credit`) |
| `/admin/users/` | GET | admin | — | `UserAdminSerializer` (many) | **ListUsersUseCase** *(missing)* | `UserDTO[]` *(missing)* | `PermissionDenied` | 200 | admin only |
| `/admin/users/<id>/` | PATCH | admin | `UpdateUserInputSerializer` | `UserAdminSerializer` | **UpdateUserUseCase** *(missing)* | `UserDTO` *(missing)* | `PermissionDenied` | 200 / 403 / 422 | admin; suspend/role |

---

## 7. Sessions

| Path | Method | Role | Input serializer | Output serializer | Use case | DTO | Domain exceptions | Status | Ownership notes |
|---|---|---|---|---|---|---|---|---|---|
| `/sessions/<id>/` | GET | participant | — | `SessionSerializer` | **GetSessionUseCase** *(missing)* | `SessionDetailResult` *(missing)* | `PermissionDenied` | 200 / 404 | booked student or instructor |
| `/sessions/<id>/join/` | POST | participant | — | `VideoJoinSerializer` | **JoinSessionUseCase** ✅ | `VideoJoinResult` ✅ | `PermissionDenied`, `SessionNotJoinable` | 200 / 403 / 409 | participant; token via `VideoProvider` (stub) |
| `/sessions/<id>/start/` | POST | participant | — | `SessionSerializer` | **StartSessionUseCase** ✅ | `SessionResult` ✅ | `PermissionDenied`, `InvalidStateTransition` | 200 / 403 / 409 | participant |
| `/sessions/<id>/notes/` | POST | participant | `SessionNotesInputSerializer` | — | **SaveSessionNotesUseCase** *(missing)* | `SessionResult` ✅ (reuse) | `PermissionDenied` | 204 / 403 | participant; autosave |
| `/sessions/<id>/transcript/` | POST | participant/system | `AttachTranscriptInputSerializer` | `TranscriptRefSerializer` | **AttachTranscriptUseCase** ✅ | `dict {transcript_id, session_id}` ⚠️ | `PermissionDenied` | 201 / 403 | participant |
| `/sessions/<id>/end/` | POST | participant | — | `SessionSerializer` | **CompleteSessionUseCase** ✅ | `SessionResult` ✅ | `PermissionDenied`, `InvalidStateTransition` | 200 / 403 / 409 | participant; prepares pending report |

> ⚠️ `AttachTranscriptUseCase` currently returns a plain `dict`. Add a
> `TranscriptResult` DTO for a consistent serializer contract (see risks).
> `VideoJoinSerializer` must surface only `provider, channel, token, uid,
> expires_at` — never any provider secret/app-certificate.

---

## 8. AI Reports

| Path | Method | Role | Input serializer | Output serializer | Use case | DTO | Domain exceptions | Status | Ownership notes |
|---|---|---|---|---|---|---|---|---|---|
| `/student/reports/<id>/` | GET | student | — | `AIReportSerializer` | **GetAIReportUseCase** *(missing)* | `AIReportDetailResult` *(missing)* | `PermissionDenied` | 200 / 404 | owner student (or report's instructor) |
| `/sessions/<id>/report/` | GET | participant | — | `AIReportSerializer` | **GetSessionReportUseCase** *(missing)* | `AIReportDetailResult` *(missing)* | `PermissionDenied` | 200 / 202 / 404 | participant; 202 if pending |
| `/sessions/<id>/report/generate/` | POST | participant/system | `GenerateReportInputSerializer` (optional transcript) | `AIReportSerializer` | **GenerateSessionReportUseCase** ✅ | `AIReportResult` ✅ | `PermissionDenied`, `InvalidStateTransition`, `AIReportAlreadyGenerated` | 201 / 403 / 409 | participant; AI via `AIProvider` (stub) |

> Existing `AIReportResult` carries `report_id, session_id, status, overall_score`.
> Full report rendering (skills/mistakes/recommendations/instructor_note) needs a
> richer `AIReportDetailResult` + `GetAIReportUseCase` (read path) — see missing
> use cases.

---

## 9. Notifications

| Path | Method | Role | Input serializer | Output serializer | Use case | DTO | Domain exceptions | Status | Ownership notes |
|---|---|---|---|---|---|---|---|---|---|
| `/notifications/` | GET | any | — | `NotificationSerializer` (many) | **ListMyNotificationsUseCase** *(missing)* | `NotificationDTO[]` *(missing)* | `PermissionDenied` | 200 | self user only |
| `/notifications/<id>/read/` | POST | any | — | — | **MarkNotificationReadUseCase** *(missing)* | `NotificationDTO` *(missing)* | `PermissionDenied` | 204 / 403 / 404 | owner notification |

---

## Missing use cases required before DRF implementation

Use cases that **do not yet exist** and must be added (application layer) before the
matching endpoints can be thin. Grouped by context.

| Context | Missing use case | Reason / endpoint |
|---|---|---|
| Auth/Profile | `RegisterUserUseCase`, `GetMyProfileUseCase`, `UpdateMyProfileUseCase` | register, `/me` read/update |
| Onboarding | `ListGoalsUseCase`, `SetStudentGoalUseCase`, `GetPlacementTestUseCase`, `SubmitPlacementAttemptUseCase`, `GetLatestPlacementResultUseCase`, `GetPlacementResultUseCase` | goals + placement flow (scoring use case already exists) |
| Billing | `ListPlansUseCase`, `SelectPlanUseCase`, `GetBankAccountUseCase`, `CreateReceiptUploadUrlUseCase`, `SubmitPaymentProofUseCase`, `GetLatestPaymentProofUseCase`, `ListMyPaymentHistoryUseCase`, `GetMySubscriptionUseCase` | full billing read/submit paths |
| Student | `ListPublishedTopicsUseCase`, `ListMyBookingsUseCase`, `GetStudentDashboardUseCase` | topic list, bookings list, dashboard aggregate |
| Instructor | `GetInstructorDashboardUseCase`, `ListInstructorTopicsUseCase`, `CreateTopicUseCase`, `UpdateTopicUseCase`, `PublishTopicUseCase`, `AddQuestionUseCase`, `ApproveQuestionUseCase`, `GetInstructorAvailabilityUseCase`, `SetInstructorAvailabilityUseCase` | topic authoring, AI approval, availability |
| Admin | `GetAdminDashboardUseCase`, `ListPaymentProofsUseCase`, `GetPaymentProofUseCase`, `ListSubscriptionsUseCase`, `ListUsersUseCase`, `UpdateUserUseCase` | admin queues + user management |
| Sessions | `GetSessionUseCase`, `SaveSessionNotesUseCase` | room context read, notes autosave |
| AI Reports | `GetAIReportUseCase`, `GetSessionReportUseCase` | report read paths (+ `AIReportDetailResult` DTO) |
| Notifications | `ListMyNotificationsUseCase`, `MarkNotificationReadUseCase` | notification feed |

Supporting **repository/port additions** these will need (currently absent): a
`GoalRepository`, `PlanRepository`, `PlacementRepository`, `NotificationRepository`,
`UserRepository`, and read methods on `TopicRepository` (instructor-owned list) and
`BookingRepository` (student bookings list). Plus new **DTOs** for every "missing"
row above and a `TranscriptResult` DTO to replace the raw dict.

---

## Risks

- **Read-path gap.** Most write/command use cases exist; almost all **query** use
  cases (lists, dashboards, detail reads) are missing. ~80% of GET endpoints are
  blocked on new read use cases + DTOs. Risk: pressure to query the ORM directly in
  views — must be resisted to keep views thin.
- **`AttachTranscriptUseCase` returns a raw `dict`.** Violates "no raw/loose
  structures out of the app layer"; introduce `TranscriptResult` before wiring its
  serializer.
- **DTO richness for reports.** `AIReportResult` is a thin write-ack; rendering the
  full report needs `AIReportDetailResult`. Without it the GET report endpoints leak
  toward serializing models directly.
- **Server-only field leakage.** High-risk serializers: `PlacementQuestion`
  (`correct_index` must be omitted), `User` (`password_hash`, `is_staff`,
  `is_superuser`), `VideoJoin` (no app-certificate/secret), `PaymentProof`
  (cross-tenant reviewer/PII). Need explicit allow-list serializers, not
  `fields = "__all__"`.
- **Ownership vs role.** DRF role permissions are coarse; true ownership (student
  owns booking/report/notification; instructor owns topic; participant in session)
  is enforced only inside use cases. Endpoints must pass `actor=request.user` and
  let the use case decide — never trust a URL id alone.
- **Exception-handler coupling.** The global `DomainError`→HTTP handler must cover
  the full `.code` set (incl. `not_found` from repository `.get`). A missing code
  silently degrades to 500. Needs a single tested handler + a catch-all `422`.
- **Pagination/filtering unspecified.** List endpoints (admin queues, bookings,
  notifications) need pagination decided in the read use cases, not bolted onto
  views, to avoid logic creeping into the presentation layer.
- **Placement gating subtlety.** `QuestionsNotAvailable` is defined but the default
  topic gate is the preview/full DTO shape; if a dedicated "questions" endpoint is
  added, wire the exception there to avoid two inconsistent gating mechanisms.
