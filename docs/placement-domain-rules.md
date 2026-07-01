# Placement Domain Rules (Phase 8B)

**Pure, framework-free** placement scoring for OneClub's AI-led interview.
Lives in `backend/domain/placement/`. **No Django, no API, no OpenAI, no STT, no
audio, no pronunciation.** The default evaluator is a deterministic heuristic; a
future AI provider can replace it behind a flag (same call signature) while this
baseline always remains as the fallback.

## Module map

| Module | Responsibility |
|---|---|
| `text_signals.py` | Deterministic signals from text: word/sentence counts, unique ratio, hesitation markers, connectors, assertive cues, ellipses |
| `cefr.py` | 5-level ladder (A1–C1), score→level bands, spoken-dominant weighting, spoken-cap rule |
| `scoring.py` | Per-answer + per-section grammar/vocabulary/completion; **text-based fluency**; **text-based confidence** |
| `recommendations.py` | strengths / weaknesses / focus / conversation topics / instructor difficulty |
| `attempt_rules.py` | one-shot spoken, admin reset, written retake, result versioning, completeness, known-question validation |
| `assessor.py` | `assess(written, spoken, goal)` → `PlacementAssessmentResult` (the deterministic default) |
| `dtos.py` | frozen DTOs (inputs + results) |

## CEFR mapping (`cefr.py`)

Five levels only: **A1, A2, B1, B2, C1** (no A0/C2).

```
score → level bands:  ≤35 A1 · ≤52 A2 · ≤69 B1 · ≤85 B2 · ≤100 C1
```

**Section weighting — spoken dominates** (`SPOKEN_WEIGHT=0.60`, `WRITTEN_WEIGHT=0.40`):
```
overallConversationScore = 0.60·spoken + 0.40·written   (clamped 0–100)
```
So an equal magnitude on the spoken side pulls the blend further than the written
side (e.g. `weighted(written=0, spoken=100)=60` > `weighted(written=100, spoken=0)=40`).

**Spoken cap** — a weak spoken performance bounds the final level regardless of written:
```
spoken < 36 (A1)        → ceiling A2   (final max A2)
36 ≤ spoken < 53 (A2)   → ceiling B1   (final max B1)
spoken ≥ 53             → ceiling C1   (no effective cap)
final = cap(level_for_score(overall), ceiling)
```
Invariant guaranteed by `final_level`: **the final level never exceeds the spoken ceiling.**

## Score dimensions returned

`overallConversationScore, grammarScore, vocabularyScore, fluencyScore,
confidenceScore, writtenScore, spokenScore` — **pronunciation is excluded everywhere**
(asserted by tests on the result and on the DTO fields).

- **grammar / vocabulary** — blended across both sections (spoken-dominant).
- **fluency** — from the spoken transcripts only (written answers carry `fluency=None`).
- **confidence** — from the spoken transcripts only.

## Text-based fluency (`scoring.fluency_from_signals`)

Deterministic, 0–100, from the transcript:
`flow(length coverage) + sentence_flow + coherence(connectors) + base − hesitation_penalty`.
Empty transcript → 0; hesitation markers (`um/uh/…`, ellipses) lower it.

## Text-based confidence (`scoring.confidence_from_spoken`)

Cheap proxy for *speaking comfort*, weighted:
```
0.40·completeness + 0.25·assertiveness + 0.25·low_hesitation + 0.10·cross-answer consistency
```
- *completeness* — average answer coverage.
- *assertiveness* — density of assertive cues ("I am", "I can", "definitely", "yes", …).
- *low_hesitation* — `100 − hesitation/ellipsis penalty`.
- *consistency* — `100 − stdev(per-answer completion)`.
No spoken answers → 0.

## Recommendations (`recommendations.py`)

- **strengths** = dimensions ≥ 70; **weaknesses** = dimensions < 50.
- **recommendedFocus** = the two lowest dimensions, as focus phrases.
- **recommendedConversationTopics** = goal-based slugs (+ "everyday_essentials" for A1/A2,
  + remedial slugs for weak dimensions), deduped, ≤ 5. Topic *slugs* only — the application
  layer maps them to catalogue topics.
- **recommendedInstructorDifficulty** — `A1/A2 → supportive · B1/B2 → balanced · C1 → challenging`.

## Attempt rules (`attempt_rules.py`, pure)

- **One spoken attempt** — `ensure_spoken_attempt_available(used, reset_after_use)` raises
  `SpokenAttemptAlreadyUsed` once used (until an audited admin reset).
- **Admin reset** — `apply_admin_reset(used)` reopens the spoken attempt;
  `ensure_can_start_new_spoken(...)` raises `PlacementResetRequired` without one.
- **Written retake** — always allowed (`written_retake_allowed() → True`).
- **Versioning** — `next_result_version(prev)` (first = 1); final results are versioned per attempt.
- **Completeness** — `ensure_placement_complete(written, spoken)` raises `PlacementIncomplete`.
- **Known questions only** — `ensure_known_questions(answered, allowed)` raises
  `InvalidPlacementQuestion` (enforces "no AI-generated placement questions").

## DTOs (`dtos.py`, frozen)

Inputs: `PlacementWrittenAnswer`, `PlacementSpokenAnswer`.
Outputs: `PlacementSectionScore`, `PlacementRecommendationResult`, `PlacementAssessmentResult`.

## Domain exceptions (`domain/exceptions.py`, subclass `BusinessRuleError`)

`SpokenAttemptAlreadyUsed` (`spoken_attempt_used`), `PlacementResetRequired`
(`placement_reset_required`), `PlacementIncomplete` (`placement_incomplete`),
`InvalidPlacementQuestion` (`invalid_placement_question`). (Not yet wired into the API
handler — that's a later phase.)

## Tests (`domain/placement/tests/`, **36 passing**, no DB/AI)

CEFR bands · spoken-weight dominance · weak-spoken caps final CEFR · written retake ·
spoken one-shot · admin reset · versioning · completeness · known-question validation ·
fluency from transcript · confidence from transcript · recommendations · deterministic
stability (same input → identical result) · **no pronunciation anywhere** · **no
AI/Django/OpenAI imports in the domain**.

> Phase 8B is domain-only. Models, migrations, repositories, use cases, API, and frontend
> are explicitly **not** touched here.

---

## Persistence & repositories (Phase 8C)

The pure domain above stays framework-free. Phase 8C adds the **`apps.placement`** Django
app (6 models, one clean migration) plus repository ports + Django adapters + mappers. No
API, no frontend, no real OpenAI/STT, no audio, **no pronunciation**.

**Models** (`apps/placement/models.py`): `PlacementQuestion` (fixed, owned — CTO-001),
`PlacementAttempt` (status machine + one active-attempt rule), `PlacementWrittenAnswer`,
`PlacementSpokenAnswer` (transcript text only), `PlacementAssessmentResult` (1:1 with
attempt), `PlacementResetAudit` (append-only). Constraints: order-unique-per-type,
partial-unique active attempt, answers unique per (attempt, question), result one-to-one.
See [database-design.md](database-design.md#placement-phase-8c--appsplacement).

**Boundary DTOs** (added to `domain/placement/dtos.py`): `PlacementQuestionDTO` (public — **no
answer key**), `PlacementAttemptDTO`, `PlacementStoredResult` (flat persisted result +
recommendation). Repositories return these — never raw models.

**Ports** (`application/ports/repositories.py`) + **Django impls**
(`infrastructure/repositories/placement.py`) + **mappers**
(`infrastructure/repositories/placement_mappers.py`):
`PlacementQuestionRepository`, `PlacementAttemptRepository`, `PlacementAnswerRepository`,
`PlacementResultRepository`, `PlacementResetAuditRepository`. **No scoring logic in models or
repositories** — they only persist/fetch. One-shot signals exposed for the use-case layer:
`has_used_spoken(student)`, `reset_after_use(student)`.

**Seed** (`manage.py seed_placement`): idempotent fixed set — 5 written + 5 spoken known
questions. The smart teacher only ever reads the spoken set.

**Tests** (`apps/placement/tests.py`, **11**, + the 36 domain tests = **47**): order-unique-per-type,
result one-to-one, answers unique per attempt/question, active-attempt uniqueness, **no
pronunciation field in any model**, `correct_answer/correct_index` stored server-side but
absent from the public DTO, full repository round-trip (attempt → answers → result), one-shot
+ admin-reset signals, seed idempotency. Full backend suite: **130 passed**; migrations in sync.

> Phase 8C is persistence-only. DRF endpoints, frontend, real OpenAI, real STT, audio upload,
> and pronunciation are explicitly **not** touched.

---

## Application use cases (Phase 8D)

`application/placement/use_cases.py` — orchestrate the pure domain + the repositories.
**No ORM in use cases, no AI provider, no STT, no pronunciation; outputs are DTOs only.**
Each takes `actor` and enforces permission/ownership via `application/permissions.py`.

| Use case | Does | Key rules |
|---|---|---|
| `ListPlacementQuestionsUseCase` | active questions split written/spoken | public `PlacementQuestionDTO` — **no answer key** |
| `StartPlacementAttemptUseCase` | create or **reuse** the one active attempt | one active in_progress per student; stores `student.goal` |
| `SaveWrittenAnswersUseCase` | save written answers (overwrite = retake) | `ensure_known_questions` (written); does not assess |
| `SaveSpokenTranscriptsUseCase` | save transcript text for fixed spoken Qs | `ensure_known_questions` (spoken); **one-shot** via `has_used_spoken_excluding` + `ensure_spoken_attempt_available`; no audio/STT/pronunciation |
| `SubmitPlacementAttemptUseCase` | completeness → **deterministic assessor** → persist → mark assessed → set student level | `ensure_placement_complete`; spoken-dominant + cap (domain); `fallback_used=True` (no AI yet); returns `PlacementAssessmentResult` |
| `GetMyPlacementResultUseCase` | latest stored result for the student | ownership inherent; `PlacementResultNotFound` if none |
| `AdminResetSpokenAttemptUseCase` | record audit + mark attempt `reset` (frees one-shot) | `ensure_admin`; **reason required**; transcripts kept (never deleted) |
| `GetPlacementAttemptStatusUseCase` | not_started/in_progress/submitted/assessed/reset + written/spoken complete flags | no server-only fields |

New boundary DTOs: `PlacementTestDTO`, `PlacementAttemptStatusDTO`, `PlacementResetAuditResult`.
New exceptions: `PlacementAttemptNotFound`, `PlacementResultNotFound`. New repo methods:
`latest`, `mark_reset`, `has_used_spoken_excluding`, `list_written/list_spoken`,
`get_latest_for_student`, `PlacementProfileRepository.set_level`; `ResetAudit.record` now derives
the student from the attempt.

**Placement does not unlock booking** — it personalizes the student's CEFR level and (later)
topics/instructor difficulty; the booking gate stays the approved subscription (CTO / Phase 8A R4).

**Tests** (`application/tests/test_placement_use_cases.py`, **16**): listing hides answer keys ·
start creates/reuses · written save + retake + unknown-question reject · spoken multi-save same
attempt · spoken one-shot blocks a new attempt · admin reset reopens + audits · non-admin cannot
reset · submit fails when incomplete · submit deterministic + sets level · weak spoken caps CEFR ·
result retrievable by owner · another student can't read it · status transitions · **no
pronunciation in any DTO** · **no OpenAI/STT dependency** (source-scanned + `source=="heuristic"`).

> Phase 8D is application-only. DRF endpoints, frontend, real OpenAI/STT, audio, and pronunciation
> are **not** touched.

---

## Thin DRF API (Phase 8E)

`api/views.py` + `api/serializers.py` + `api/urls.py` expose the use cases as **thin**
endpoints — each view validates input, calls exactly one use case with `actor=request.user`,
and serializes the returned DTO. **No business logic, no ORM, no raw models in views.**
Output serializers read frozen DTOs only, so `correctAnswer`/`correctIndex`/`options` and any
pronunciation field **cannot** appear. Domain exceptions map via the global handler.

| Method | Path | Use case |
|---|---|---|
| GET | `/api/v1/placement/test/` | ListPlacementQuestions |
| POST | `/api/v1/placement/start/` | StartPlacementAttempt |
| GET | `/api/v1/placement/status/` | GetPlacementAttemptStatus |
| POST | `/api/v1/placement/written-answers/` | SaveWrittenAnswers |
| POST | `/api/v1/placement/spoken-transcripts/` | SaveSpokenTranscripts |
| POST | `/api/v1/placement/submit/` | SubmitPlacementAttempt |
| GET | `/api/v1/placement/result/` | GetMyPlacementResult |
| POST | `/api/v1/admin/placement/{studentId}/reset-spoken/` | AdminResetSpokenAttempt |

Error codes added to the global handler (`api/exceptions.py`): `placement_attempt_not_found`(404),
`placement_result_not_found`(404), `placement_incomplete`(409), `spoken_attempt_used`(409),
`placement_reset_required`(409), `invalid_placement_question`(422).

**Refinements this phase:** `SubmitPlacementAttempt` now returns the persisted
`PlacementStoredResult` (carries `providerName` + `fallbackUsed`); `PlacementAttemptStatusDTO`
gained `assessed` + `can_submit`; `AdminResetSpokenAttempt` accepts `student_id` (the
`/admin/placement/{studentId}/` route) or `attempt_id`; new repo method
`latest_for_student_id`. The legacy onboarding placement endpoints were removed (superseded).

**Tests** (`api/tests/test_placement_api.py`, **15**): test endpoint hides answer keys ·
start creates/reuses · written saves · spoken one-shot (`spoken_attempt_used`) · submit
incomplete (`placement_incomplete`) · submit deterministic CEFR · result for owner · another
student blocked (`placement_result_not_found`) · non-admin cannot reset (403) · admin reset
works + requires reason (422) · **no pronunciation anywhere** · status shape · global mapping
(`invalid_placement_question` → 422) · auth required (401).

> Phase 8E is API-only. Frontend, real OpenAI/STT, audio upload, and pronunciation are **not**
> touched.
