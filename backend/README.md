# OneClub — Backend (Django, Clean Architecture)

Django + DRF backend for the OneClub MVP. Phase 5 delivered the data layer
(models, constraints, admin, services, tests). **Phase 6** added a Clean
Architecture application layer (use cases, domain rules, ports, stub adapters) so
future REST endpoints stay thin. It implements the approved
[backend plan](../docs/backend-plan.md) and
[database design](../docs/database-design.md). See
[backend-architecture.md](../docs/backend-architecture.md) for the layer design.

> **Out of scope** (intentionally not implemented yet): OpenAI integration, Agora
> integration, DRF endpoints/serializers/viewsets, frontend integration,
> background jobs, production deployment. The `AIProvider` and `VideoProvider`
> ports are **stubs** this phase.

## Stack

- Django 5 · Django REST Framework · SimpleJWT
- PostgreSQL (production) · `django-environ` for config
- pytest + pytest-django

## Database: PostgreSQL vs SQLite

Production runs on **PostgreSQL** (set `DATABASE_URL`). When `DATABASE_URL` is
unset the project falls back to a local **SQLite** file so the test suite and a
quick `runserver` work without a Postgres server. The models use only portable
constructs (UUID PKs, `TextChoices`, partial `UniqueConstraint`, `CheckConstraint`),
so the same schema and constraints apply on both engines.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt          # psycopg2-binary only needed for Postgres

cp .env.example .env                      # optional; defaults work for SQLite

python manage.py migrate
python manage.py createsuperuser --email you@example.com --full_name "You"
python manage.py runserver
```

- Admin: http://127.0.0.1:8000/admin/
- JWT: `POST /api/v1/auth/token/` and `/api/v1/auth/token/refresh/`

### Running against PostgreSQL

```bash
# .env
DATABASE_URL=postgres://english_club:password@localhost:5432/english_club
```

Then `pip install psycopg2-binary` (in requirements) and `python manage.py migrate`.

## Tests

```bash
cd backend
source .venv/bin/activate
pytest                      # 83 passed — runs on SQLite by default
```

Tests: `apps/*/tests.py` (models/services), `application/tests/` (use cases —
command seams + read-side ownership/gating), and `api/tests/` (DRF request/response
through `APIClient`). The thin API layer lives under `api/`; see
[docs/api.md](../docs/api.md).

Covered business rules (the Phase-5 required set):

| Test | Rule | Location |
|---|---|---|
| `test_payment_approval_activates_subscription` | approval creates/activates subscription | `apps/billing/tests.py` |
| `test_sessions_remaining_cannot_go_below_zero_db_constraint` | sessions ≥ 0 (CHECK backstop) | `apps/billing/tests.py` |
| `test_cannot_book_without_active_subscription` | no booking without active approved sub | `apps/scheduling/tests.py` |
| `test_expired_subscription_cannot_book` | expired sub blocks booking | `apps/scheduling/tests.py` |
| `test_booking_decrements_sessions_and_floor_is_enforced` | sessions floor at booking time | `apps/scheduling/tests.py` |
| `test_double_booking_is_prevented` | no double booking on a slot | `apps/scheduling/tests.py` |
| `test_cancel_before_24h_returns_credit` | >24h cancel returns credit | `apps/scheduling/tests.py` |
| `test_cancel_within_24h_does_not_return_credit` | ≤24h cancel keeps credit | `apps/scheduling/tests.py` |
| `test_full_questions_hidden_without_confirmed_booking` | question visibility gate | `apps/scheduling/tests.py` |

## Project layout

```
backend/
├── config/                 # settings, urls (admin + JWT only), wsgi/asgi
├── manage.py · requirements.txt · .env.example · pytest.ini · conftest.py
├── apps/                   # INFRASTRUCTURE: Django models, admin, migrations, services
│   ├── common/             #   abstract bases, enums, exceptions, factories (NOT an app)
│   ├── accounts/           #   User (custom, email login), Student/InstructorProfile
│   ├── onboarding/         #   Goal, PlacementQuestion/Attempt/Result
│   ├── billing/            #   Plan, Subscription, PaymentProof, File  (+ services)
│   ├── scheduling/         #   Topic, Subtopic, Question, AvailabilitySlot, Booking (+ services)
│   ├── sessions/           #   Session, SessionTranscript  (app label: live_sessions*)
│   ├── ai_reports/         #   AIReport
│   ├── notifications/      #   Notification
│   └── admin_ops/          #   AdminAction (append-only audit log)
├── domain/                 # DOMAIN: pure rules, exceptions, events, DTOs (no Django)
│   ├── exceptions.py · events.py · dtos.py
│   └── rules/              #   billing.py, scheduling.py, sessions.py
├── application/            # APPLICATION: use cases + permission boundary
│   ├── permissions.py
│   ├── ports/              #   repository + gateway interfaces (ABCs)
│   ├── billing/ scheduling/ sessions/ ai_reports/   #   use_cases.py each
│   └── tests/              #   use-case tests
├── infrastructure/         # INFRASTRUCTURE adapters
│   ├── repositories/django.py
│   ├── gateways/           #   notification (Django), video/ai/file_storage (stubs), events
│   └── container.py        #   composition root (port → adapter wiring)
└── api/                    # PRESENTATION: thin DRF layer (Phase 6B)
    ├── serializers.py      #   request validation + DTO→camelCase
    ├── views.py            #   one use case per view; actor=request.user
    ├── urls.py             #   /api/v1/ routing
    ├── exceptions.py       #   global DomainError → HTTP handler
    └── tests/test_api.py
```

See [docs/backend-architecture.md](../docs/backend-architecture.md) for layer
boundaries and where REST endpoints will call use cases.

\* The `sessions` app uses the Django app **label `live_sessions`** to avoid a
clash with `django.contrib.sessions`. Cross-app model references therefore use
`"live_sessions.Session"`. The directory/app is still named `sessions`.

## Design decisions worth knowing

- **UUID primary keys** everywhere (`apps/common/models.py::UUIDModel`).
- **Timezone-aware** datetimes (`USE_TZ=True`, `TIME_ZONE=UTC`).
- **Status enums** are Django `TextChoices` centralized in `apps/common/enums.py`
  — the single source of truth for the state machines.
- **Audit fields** (`created_at/updated_at/created_by/updated_by`) via
  `AuditModel`; `*_by` are nullable (self-signup / system jobs).
- **Soft delete** via `SoftDeleteModel.deleted_at` on the tables the deletion
  policy marks soft. `payment_proofs` is retention-locked (`retain_until` =
  `submitted_at` + 5 years), not soft-deleted.

### Where the business rules live

DB-level (constraints/indexes) where possible, service-level where a constraint
can't express the rule:

- **No double booking** — `Booking.slot` OneToOne + slot status flip in
  `scheduling.services.create_booking` (`UNIQUE` + transactional guard).
- **Approval → active subscription** — only `billing.services.approve_payment_proof`
  activates a subscription; CHECK `active ⇒ started_at/expires_at` present.
- **sessions_remaining ≥ 0** — `CheckConstraint` + guarded decrement
  (`UPDATE ... WHERE sessions_remaining > 0`).
- **Expired sub blocks booking** — live `expires_at > now()` check in
  `create_booking`.
- **Question visibility** — `scheduling.services.get_topic_for_student` returns
  `preview` vs `full` based on a confirmed-booking `EXISTS`; only `approved=True`
  questions are ever returned.
- **Agora channel ↔ session** — `Session.agora_channel` unique + CHECK that
  live/completed sessions have a channel. (Token minting/Agora SDK is a later phase.)
- **Manual admin actions** — `billing.services` (approve/reject/reopen/extend/
  topup/refund_note) and `scheduling.services.cancel_booking` override, each
  recorded in `admin_ops.AdminAction` (append-only).

## Phase 5 deliverable checklist

- [x] Django project + 8 apps
- [x] Models from the approved database design (UUID PKs, TZ-aware, TextChoices)
- [x] Constraints & indexes (unique, partial-unique, check) where Django supports them
- [x] Model-level validation (`clean()`) for rules beyond DB constraints
- [x] Django Admin registration for all core models
- [x] Business-rule services (billing + scheduling)
- [x] Unit tests passing (12 passed)
- [x] Setup README
