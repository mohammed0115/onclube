# OneClub — Backend Architecture (Clean Architecture)

**Status:** Phase 6 — application/domain/infrastructure layering. No DRF endpoints,
no real OpenAI, no real Agora in this phase. This document explains the layer
boundaries and the rules for where code may live.

## Why

REST endpoints should be **thin**. Business logic must not live in serializers or
views, where it is hard to test, easy to bypass, and coupled to HTTP. Phase 6
introduces a use-case layer so that — when DRF is added — a view does nothing but
parse input, call one use case, and serialize the returned DTO.

## The four layers

```
┌─────────────────────────────────────────────────────────────────────┐
│ Presentation (LATER)   DRF views & serializers                        │
│   • parse request → call ONE use case → serialize the DTO             │
│   • NO business logic, NO ORM queries, NO permission rules            │
└───────────────▲───────────────────────────────────────────────────────┘
                │ calls
┌───────────────┴───────────────────────────────────────────────────────┐
│ Application   application/                                              │
│   • use cases (orchestration), transactions, permission boundary       │
│   • depends on domain + ports; injects infrastructure                  │
│   • returns DTOs, never raw Django models                              │
└───────────────▲───────────────────────────────▲───────────────────────┘
                │ uses                           │ depends on (interfaces)
┌───────────────┴───────────────┐   ┌────────────┴──────────────────────┐
│ Domain   domain/              │   │ Ports   application/ports/         │
│   • pure rules, state checks  │   │   • repository + gateway ABCs      │
│   • exceptions, events, DTOs  │   └────────────▲──────────────────────┘
│   • no Django, no I/O         │                │ implemented by
└───────────────────────────────┘   ┌────────────┴──────────────────────┐
                                     │ Infrastructure  infrastructure/   │
                                     │   • Django ORM repositories        │
                                     │   • gateways: notification, video, │
                                     │     AI, file storage, events       │
                                     │   • Django models live in apps/    │
                                     └────────────────────────────────────┘
```

Dependencies point **inward**: infrastructure → ports → domain. The domain depends
on nothing framework-specific.

## Directory map

| Path | Layer | Contains |
|---|---|---|
| `domain/exceptions.py` | Domain | `DomainError` + specific exceptions (all subclass `BusinessRuleError`) |
| `domain/rules/` | Domain | pure functions: bookability, 24h credit window, session state |
| `domain/dtos.py` | Domain | frozen dataclasses returned by use cases |
| `domain/events.py` | Domain | domain event value objects |
| `application/permissions.py` | Application | the permission boundary (`ensure_admin`, ownership checks) |
| `application/ports/` | Application | repository + gateway **interfaces** (ABCs) |
| `application/<ctx>/use_cases.py` | Application | use cases for billing / scheduling / sessions / ai_reports |
| `infrastructure/repositories/django.py` | Infrastructure | Django ORM repositories |
| `infrastructure/gateways/` | Infrastructure | notification (Django), video (stub), AI (stub), file storage (stub), events |
| `infrastructure/container.py` | Infrastructure | composition root: default port→adapter wiring |
| `apps/*/models.py` | Infrastructure | Django models (persistence) |
| `apps/*/services.py` | Domain+Infra (transactional) | existing transactional business services the use cases delegate to |

## Where business logic belongs

- **Pure decisions** (no I/O): `domain/rules/`. Example: `cancellation_refunds_credit(scheduled_at, now)` — the 24h rule, testable with no DB.
- **Orchestration** (load → check → mutate → return): `application/<ctx>/use_cases.py`. A use case validates permissions, opens a transaction (or delegates to a service that does), calls domain rules and repositories, emits events, and returns a DTO.
- **Transactional multi-row mutations with constraints**: the existing `apps/*/services.py` (e.g. `approve_payment_proof`, `create_booking`, `cancel_booking`). These already run in `transaction.atomic`, enforce the DB-level guards, and write `AdminAction`. Use cases delegate to them rather than duplicating that logic. (Sessions/AI use cases, which had no prior service, implement orchestration directly on repositories + gateways.)

### What must NOT go in serializers/views (Presentation)

- ❌ ORM queries / `.objects.filter(...)` for business reads
- ❌ permission/authorization rules (call `application.permissions` via a use case)
- ❌ state transitions, credit math, double-booking checks, visibility gating
- ❌ calling Agora/OpenAI/email directly
- ✅ allowed: request validation/parsing, calling **one** use case, serializing its DTO, mapping `DomainError.code` → HTTP status

## Presentation layer (Phase 6B — implemented)

The DRF layer now exists under **`api/`** and is thin by construction:

| Path | Role |
|---|---|
| `api/serializers.py` | request validation + DTO→camelCase serialization (no models, no server-only fields) |
| `api/views.py` | one use case per view; passes `actor=request.user`; no logic, no ORM |
| `api/urls.py` | routing under `/api/v1/`, grouped by endpoint plan |
| `api/exceptions.py` | global handler: `DomainError.code` → HTTP, `Model.DoesNotExist` → 404 |
| `api/tests/test_api.py` | request/response tests through `APIClient` |

Full endpoint reference: [api.md](api.md). The handler is registered via
`REST_FRAMEWORK["EXCEPTION_HANDLER"]`, so views never catch domain exceptions.

## How a future REST endpoint will look

```python
# presentation (later phase) — illustrative only, not implemented in Phase 6
class ApprovePaymentProofView(APIView):
    def post(self, request, proof_id):
        try:
            result = ApprovePaymentProofUseCase().execute(actor=request.user, proof_id=proof_id)
        except DomainError as e:
            return Response({"code": e.code, "detail": str(e)}, status=_http_for(e.code))
        return Response(PaymentApprovalSerializer(result).data, status=200)
```

The view holds no business logic. `request.user` is the actor; the use case owns
authorization and orchestration; the DTO is serialized directly.

## Domain exceptions → HTTP (for the later presentation layer)

Every domain exception carries a `.code` matching the backend plan. Suggested mapping:

| Exception | `.code` | HTTP |
|---|---|---|
| `PermissionDenied` | `permission_denied` | 403 |
| `PaymentAlreadyDecided` / `InvalidStateTransition` | `invalid_state` | 409 |
| `NoActiveSubscription` | `no_active_subscription` | 403/409 |
| `SubscriptionExpired` | `subscription_expired` | 409 |
| `InsufficientSessionCredits` | `no_sessions_remaining` | 409 |
| `SlotAlreadyBooked` | `slot_unavailable` | 409 |
| `BookingCancellationWindowClosed` | `cancellation_window_closed` | 409 |
| `QuestionsNotAvailable` | `questions_not_available` | 403 |
| `SessionNotJoinable` | `session_not_joinable` | 409 |
| `AIReportAlreadyGenerated` | `ai_report_already_generated` | 409 |

Because all subclass `BusinessRuleError`, a single `except DomainError` handler can
translate any of them uniformly.

## Ports & adapters

| Port (interface) | Default adapter (this phase) | Future adapter |
|---|---|---|
| `PaymentRepository`, `SubscriptionRepository`, `BookingRepository`, `SessionRepository`, `TopicRepository` | Django ORM (`infrastructure/repositories/django.py`) | — |
| `NotificationGateway` | `DjangoNotificationGateway` (writes `Notification` rows) | email/push later |
| `VideoProvider` | **`StubVideoProvider`** — fake token, no network | `AgoraVideoProvider` |
| `AIProvider` | **`StubAIProvider`** — deterministic offline data | `OpenAIProvider` |
| `FileStorageGateway` | `StubFileStorageGateway` | S3/object store |
| `EventBus` | `NoOpEventBus` (in-memory for tests) | async dispatcher |

Use cases accept these via constructor injection and fall back to
`infrastructure.container` defaults, so tests inject fakes and production gets the
real/stub adapters without any change to use-case code.

## How OpenAI plugs in later (no code change to use cases)

1. Implement `OpenAIProvider(AIProvider)` in `infrastructure/gateways/ai.py` with real API calls.
2. Point `infrastructure/container.default_ai_provider()` at it (guarded by a settings flag/key).
3. Done. `GeneratePlacementResultUseCase`, `GenerateDiscussionQuestionsUseCase`, and `GenerateSessionReportUseCase` already depend only on the `AIProvider` port.

Product invariant preserved across the swap: **AI-generated questions are persisted
as `approved=False` drafts** by `GenerateDiscussionQuestionsUseCase` and only become
student-visible after an instructor approves them. Subtopic suggestions are returned
as proposals (not persisted).

## How Agora plugs in later

1. Implement `AgoraVideoProvider(VideoProvider)` that mints **real RTC tokens server-side**.
2. Point `default_video_provider()` at it.
3. `JoinSessionUseCase`/`StartSessionUseCase` already call `VideoProvider`; the frontend never mints tokens.

`CompleteSessionUseCase` prepares a **pending** `AIReport` on completion but does not
call AI; `GenerateSessionReportUseCase` (AIProvider) fills it to `ready` from
transcript input.

## Use cases delivered

**Command use cases** — `application/<ctx>/use_cases.py`:
- **Accounts (6C):** RegisterStudent, UpdateCurrentProfile
- **Onboarding (6C):** SetStudentGoal
- **Billing:** Approve / Reject / Reopen PaymentProof, Extend / TopUp Subscription, RecordRefundNote, **SubmitPaymentProof (6C)**
- **Scheduling:** CreateBooking, CancelBooking, GetTopicForStudent, ListAvailableSlots
- **Instructor authoring (6C)** — `application/instructor/use_cases.py`: CreateTopic, UpdateTopic, PublishTopic, AddManualQuestion, ApproveAIQuestion, SetAvailability
- **Sessions:** JoinSession, StartSession, CompleteSession, AttachTranscript *(returns `TranscriptResult`)*
- **AI:** GeneratePlacementResult, GenerateTopicSubtopics, GenerateDiscussionQuestions, GenerateSessionReport
- **Notifications (6C):** MarkNotificationRead
- **Placement (8D)** — `application/placement/use_cases.py`: ListPlacementQuestions, StartPlacementAttempt, SaveWrittenAnswers, SaveSpokenTranscripts, SubmitPlacementAttempt, GetMyPlacementResult, AdminResetSpokenAttempt, GetPlacementAttemptStatus. Pure domain rules in `domain/placement/` + new `apps/placement/` persistence + repositories (Phase 8B–8C). **Exposed via thin DRF endpoints at `/api/v1/placement/*` (Phase 8E)** — see [api.md](api.md) Placement table; legacy onboarding placement endpoints removed. No AI/STT/pronunciation/frontend yet.

**Query (read) use cases** (Phase 5.5) — `application/<ctx>/queries.py`:
- **Accounts:** GetCurrentUserProfile
- **Onboarding:** ListGoalOptions, GetPlacementAttempt
- **Billing:** ListPlans, GetCurrentSubscription, ListStudentBillingHistory
- **Scheduling:** GetStudentDashboard, ListStudentBookings, GetBookingDetail, ListStudentAvailableTopics, GetTopicPreviewOrFull, GetQuestionsForBooking, GetInstructorDashboard, ListInstructorAvailability, ListInstructorTopics
- **Sessions:** GetSessionDetail
- **AI Reports:** GetAIReportDetail, **GetSessionReport (6C — by session id, 202 if pending)**
- **Admin:** ListAdminPaymentApprovals, GetAdminDashboard
- **Notifications:** ListNotifications
- **Onboarding:** ListGoalOptions, GetPlacementTest, GetPlacementAttempt

### Command vs Query split

Write use cases live in `use_cases.py`; read use cases live in `queries.py`. Both
return DTOs only. Reads go through repositories (no service mutation) and convert
models to DTOs via **`application/mappers.py`** — pure functions that read
attributes off already-fetched models and emit frozen DTOs. Mappers perform **no
queries** (repositories pre-fetch relations), which is the seam that guarantees no
Django model escapes the application layer.

### Read DTOs & server-only fields

`domain/dtos.py` holds the read DTOs (`UserProfileResult`, `TopicPreviewResult` /
`TopicFullResult`, `BookingDetailResult`, `AIReportDetailResult`, `SubscriptionDetailResult`,
`PaymentProofDetailResult`, dashboards, `NotificationResult`, `TranscriptResult`, …).
Server-only fields are **structurally absent**: `PlacementQuestionResult` has no
`correct_index`; `UserProfileResult` has no `password_hash`/`is_staff`; video DTOs
carry no app-certificate. A serializer literally cannot leak what the DTO does not contain.

### Ownership enforcement (read paths)

Every query use case takes `actor` and authorizes before returning data, via
`application/permissions.py`: `ensure_booking_viewer`, `ensure_report_viewer`,
`ensure_instructor_owns_topic`, `ensure_notification_owner`, `ensure_session_participant`,
`get_student_profile`, `ensure_admin`. Rules enforced: a student sees only their own
billing/bookings/reports; an instructor only their own topics/sessions; admin views
require admin; full questions require a confirmed booking. URL ids are never trusted
alone — the use case re-checks ownership on the loaded entity.

### Repository ports added (Phase 5.5)

Read methods added to `application/ports/repositories.py` and implemented in
`infrastructure/repositories/django.py`: `UserRepository`, `GoalRepository`,
`PlanRepository`, `PlacementRepository`, `QuestionRepository`, `AIReportRepository`,
`NotificationRepository`, plus read methods on `Payment`/`Subscription`/`Booking`/`Topic`
repositories. (`PaymentProofRepository` is an alias of `PaymentRepository`.)

## Tests

`application/tests/` holds command use-case tests (provider seams via in-test fakes)
and **`test_query_use_cases.py`** (ownership, the full-question gate, server-only
field absence, DTO-only returns). The Phase-5 model/service tests in `apps/*/tests.py`
remain green — domain exceptions subclass `BusinessRuleError` with identical `.code`
values. `api/tests/` adds request/response tests through DRF's `APIClient`
(routing, DTO-only output, server-only field absence, ownership, the global
exception mapping). Phase 6C adds command-side use-case tests
(`application/tests/test_phase6c_use_cases.py`) and API tests
(`api/tests/test_api_phase6c.py`). Full suite: **83 passed**.
