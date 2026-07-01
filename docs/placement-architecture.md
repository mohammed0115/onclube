# Phase 8A — OneClub Placement Architecture

**Status:** Architecture & design only. **No production code.** Reference studied:
`/home/mohamed/onlenco` (`placement/` app + `ai_engine/` model router). This redesigns
placement for **OneClub — a Conversation Practice Platform**, where placement exists
**only to determine speaking readiness and build a conversation profile before live sessions**.

---

## 0. Confirmed Scope (locked with product owner)

The placement test is an **AI-tutor interview in two sections**. This pins/overrides the
broader options in §1–§10.

1. **Written section** — the **fixed, known written questions**; the student **types** answers.
2. **Spoken section (AI tutor)** — the AI tutor asks the **fixed, known speaking questions**
   (it **does not invent** questions), one at a time. The student answers **by voice
   (microphone → speech-to-text)**. Scoring is **transcript-based**.

Locked decisions:
- **Spoken input = real voice → STT (transcript).** Not typed; not audio-pronunciation grading.
- **AI tutor = fixed known questions only** — a presenter/interviewer, never a generator
  (consistent with "AI assists, never owns content").
- **No `pronunciation_score`** — voice is used only to produce the transcript; pronunciation is
  omitted / always reported as *unavailable* (integrity rule C6). The pronunciation scorer,
  audio-file grading, free-form/adaptive conversation, and the separate top-level speaking screen
  are **dropped**.
- **Outputs (final):** CEFR level, conversation/overall score, **grammar**, **vocabulary**,
  **fluency**, **confidence** (transcript-derived "speaking comfort" — optional, cheap to compute),
  recommended conversation topics, recommended instructor difficulty, strengths, weak areas.
- Everything else in §2–§10 stands as written, simplified by the four bullets above.

> The "one-shot speaking attempt + audited reset" (C8) is **kept** for the voice section
> (one valid spoken interview; written may be retried, speaking-capped per C5).

---

## 1. Architecture Review (study of Onlenco — concepts, not code)

Onlenco is a full LMS (courses, lessons, daily learning, tutor, question factory). Its
`placement/` app is mature and well-factored. I studied: `models.py`, `services/level_mapping.py`,
`services/dynamic_scoring.py`, `services/_assessor.py`, `services/completion.py`,
`services/placement_question_selector.py`, and `ai_engine/services/{providers,model_router}.py`.

### Reusable engineering concepts (KEEP — adapt, don't copy)

| # | Concept (Onlenco) | Why it's good | How it maps to OneClub |
|---|---|---|---|
| C1 | **Question bank ↔ per-attempt snapshot** (`PlacementQuestion` → `PlacementAttemptQuestion`, FK `PROTECT`) | Editing/deactivating a bank question never corrupts past attempts; answers live on the snapshot | Same split: `PlacementQuestion` (bank) + `PlacementItem` (per-attempt copy + answer) |
| C2 | **Pluggable assessor with deterministic fallback** (`assessor: Callable`, heuristic always available) | AI is *optional*; the system always produces a result; AI failure never blocks onboarding | `AssessmentProvider` port; `HeuristicAssessor` (default) + `OpenAIAssessor` (one impl) |
| C3 | **Model router / provider chain** (`route_task`: rules → local → llm → openai, confidence-gated, killswitch, `ModelPredictionLog`) | Single audited entry point; cheapest-first; OpenAI is last and replaceable | `AssessmentRouter` chains `HeuristicAssessor → OpenAIAssessor` with confidence threshold, kill-switch, and `AssessmentLog` |
| C4 | **Configurable CEFR band mapping** (`PLACEMENT_LEVEL_MAP` in settings) | Retune levels without code/migration | `domain/rules/cefr.py` reads `settings.PLACEMENT_LEVEL_MAP` |
| C5 | **Speaking-dominant weighting + level capping** (`weighted_overall` 0.65 speak / 0.35 written; `cap_to_speaking`) | A perfect written sheet can't inflate a weak speaker's level | Conversation platform ⇒ **speaking weighs even more**; written/MCQ is a warm-up signal only |
| C6 | **Honest "unavailable" signals** (pronunciation marked `available:false`, never invented) | Integrity: never fabricate a score we can't measure | `pronunciation_score` is **nullable + optional**; emitted only when an audio scorer ran |
| C7 | **Defensive normalisation of AI output** (`_normalise_assessment` merges AI over a fallback skeleton) | A garbage/partial LLM response can't corrupt the result shape | Assessor output validated/clamped against the heuristic skeleton before persisting |
| C8 | **One-shot speaking attempt with audited admin reset** (`is_used_attempt` gate; `reset_by/at/reason`; nothing deleted) | Anti-gaming + cost control; reversible by audit, not deletion | Keep for the speaking step (one valid spoken attempt; written retis cheap/retryable) |
| C9 | **Difficulty-aware expectations** (`difficulty_score 0..1`, target word/sentence counts scale) | Fairer scoring per item | Keep on the bank; drives adaptive selection + scoring targets |
| C10 | **Strict completion gate** (`completion.py`: final result needs a *completed* speaking section, min answers, max retries) | "Readiness" is meaningful, not a half-finished test | `domain/rules/readiness.py` — profile finalises only with enough spoken signal |
| C11 | **Status state machine** (`started → written_completed → speaking_completed → completed`) | Resumable, observable flow | Same, expressed as `TextChoices` |
| C12 | **Audit log of every AI call** (`ModelPredictionLog`: provider, confidence, latency, fallback_used, cost) | Answer "how often did we hit OpenAI / what did it cost" with one query | `AssessmentLog` |

### Concepts to DROP (LMS coupling, out of scope for conversation practice)

- ❌ **Lessons / courses / learning path / course assignment** — Onlenco places students *into a course*; OneClub places them into a **conversation profile** (level + topics + instructor difficulty). No course write-back.
- ❌ **AI tutor / `TutorConversation` / live voice-call tutor** — Onlenco runs the speaking part through its tutor voice engine. OneClub's speaking step is a **self-contained prompt+response capture**, decoupled from any tutor.
- ❌ **Exercise / question generation, quizzes, homework, weekly assessment** — not part of placement.
- ❌ **`question_factory`, `local_classifier` joblib ML models, RAG provider** — over-engineered for our needs; we ship `Heuristic + OpenAI` only (the router stays open for more later).
- ❌ **Bilingual `.po`-free catalog complexity, `code_generator` auto-codes** — keep a simple stable `code`; skip the elaborate sequence generator unless needed.

### Net: what OneClub placement IS

A small, reusable module that takes a student's **goal + a short written warm-up + one speaking
prompt**, runs a **pluggable AI assessment with a deterministic fallback**, and stores a
**Conversation Profile** (CEFR + per-skill scores + recommended topics + instructor difficulty +
strengths/weaknesses). It marks onboarding "placement complete"; it does **not** change the
existing booking gate (payment-approved subscription remains the hard gate — see Risks R4).

---

## 2. Domain Model

Pure, framework-free (lives in `domain/`). Values are illustrative.

### Enums / value objects
```
CEFRLevel        = A0 | A1 | A2 | B1 | B2 | C1 | C2
PlacementStatus  = started | written_submitted | speaking_submitted | assessed | abandoned
SpeakingStatus   = started | captured | insufficient | failed | reset   (one-shot gate)
QuestionType     = written | speaking
Skill            = grammar | vocabulary | fluency | comprehension | conversation
AnswerType       = short_text | sentence | paragraph | mcq | voice
InstructorDifficulty = supportive | balanced | challenging   (maps from CEFR)
```

### Core domain entities (conceptual)
```
PlacementItem (snapshot of a bank question on an attempt)
  prompt, type, skill, topic, difficulty(0..1), expected_answer_type
  answer_text | transcript, audio_ref?, per-item scores, error_notes

ScoreSet (value object — the assessment output)
  conversation:int  grammar:int  vocabulary:int  fluency:int  confidence:int
  pronunciation: int | null         # null = not measured (honest, C6)
  overall:int  cefr:CEFRLevel

ConversationProfile (the deliverable)
  cefr_level, scores:ScoreSet,
  recommended_topics: [TopicRef],            # from goal + level + weak areas
  recommended_instructor_difficulty,         # from cefr
  strengths: [str], weak_areas: [str],
  pronunciation_available: bool,
  feedback: str,                             # level-consistent (C4 consistent_feedback)
  source: 'heuristic' | 'openai', confidence: float
```

### Domain DTOs (returned by use cases — `domain/dtos.py`)
- `PlacementQuestionDTO` — id, prompt, type, skill, options (**never** the answer key)
- `SpeakingPromptDTO` — id, prompt, expected seconds, tips
- `PlacementAttemptDTO` — id, status, written_submitted, speaking_submitted, can_assess
- `ConversationProfileResult` — the full result above (camelCase at the API edge)
- `AssessmentResult` — internal assessor return (scores + per-item + provider + confidence)

### Domain rules (pure functions — `domain/rules/`)
- `cefr.level_for_percentage(pct)` / `cap_to_speaking(level, speaking)` — **C4/C5**
- `scoring.weighted_overall(written, speaking)` — speaking-dominant (e.g. 0.75/0.25)
- `confidence.confidence_score(transcript_stats)` — **new for OneClub**: derived from
  response completeness, filler ratio, self-corrections, sentence completion, latency
  (proxy for *willingness/comfort speaking*, which is what conversation practice cares about)
- `recommend.topics_for(goal, level, weak_areas)` / `instructor_difficulty_for(level)`
- `readiness.is_ready(attempt)` — enough spoken signal to finalise (**C10**)
- `profile.strengths_weaknesses(scoreset)` — top/bottom dimensions

### Domain exceptions (`domain/exceptions.py`, subclass the existing `BusinessRuleError`)
`PlacementAlreadyAssessed`, `WrittenNotSubmitted`, `SpeakingAttemptAlreadyUsed`,
`SpeakingResponseTooShort`, `PlacementNotReady`, `InvalidPlacementTransition`, `PlacementResultNotFound`.

### Domain events (`domain/events.py`)
`PlacementStarted`, `WrittenSubmitted`, `SpeakingSubmitted`, `PlacementAssessed`,
`ConversationProfileCreated` (consumed later for notifications/analytics — no coupling now).

---

## 3. Application Flow (use cases + ports)

Mirrors the existing OneClub clean-architecture layering (`application/<ctx>/use_cases.py`).

### Use cases (`application/placement/`)
| Use case | Input | Output DTO | Rules enforced |
|---|---|---|---|
| `StartPlacementUseCase` | actor, goalId | `PlacementAttemptDTO` | one active attempt per student; selects items (C9 adaptive) and snapshots them (C1) |
| `GetPlacementTestUseCase` | actor, attemptId | `PlacementQuestionDTO[]` | **no answer key leaves the layer** |
| `SubmitWrittenAnswersUseCase` | actor, attemptId, answers[] | `PlacementAttemptDTO` | owner-only; `started→written_submitted` |
| `GetSpeakingPromptUseCase` | actor, attemptId | `SpeakingPromptDTO` | written submitted first |
| `SubmitSpeakingResponseUseCase` | actor, attemptId, transcript/audio | `PlacementAttemptDTO` | **one-shot gate (C8)**; too-short ⇒ `SpeakingResponseTooShort` (retry); `→speaking_submitted` |
| `AssessPlacementUseCase` | actor, attemptId | `ConversationProfileResult` | readiness (C10); runs `AssessmentRouter` (C2/C3); normalises (C7); persists profile; `→assessed`; emits events |
| `GetConversationProfileUseCase` | actor, attemptId/latest | `ConversationProfileResult` | owner/instructor/admin visibility |
| `ResetSpeakingAttemptUseCase` (admin) | admin, attemptId, reason | `PlacementAttemptDTO` | audited reset (C8); never deletes |

### Ports (`application/placement/ports.py`)
- `PlacementRepository` — get/create attempt, snapshot items, save answers/scores, latest profile
- `QuestionBankRepository` — active questions by type/skill/difficulty (adaptive selection)
- `AssessmentProvider` — `assess(payload) -> AssessmentResult | None` (skip-by-None like C3)
- `SpeechToTextProvider` — `transcribe(audio) -> transcript` (optional; stubbed first)
- `ProfileRepository` — persist/read `ConversationProfile`; write `StudentProfile.level`
- `Clock` / `IdGenerator` (testability)

### Infrastructure (`infrastructure/`)
- `DjangoPlacementRepository`, `DjangoQuestionBankRepository`, `DjangoProfileRepository`
- `HeuristicAssessor` (deterministic, **default**, always returns a result — adapts `dynamic_scoring.py`'s text-stat heuristics, minus LMS bits)
- `OpenAIAssessor` (**the one** real provider; behind the router; honors kill-switch)
- `AssessmentRouter` (chain: heuristic baseline → OpenAI if enabled & confident; logs to `AssessmentLog`; never raises)
- `StubSpeechToText` (returns the typed/browser transcript as-is) → future `WhisperSTT`/`OpenAISTT`
- `container.py` wiring (matches existing composition root)

### Presentation (DRF, thin — `api/`)
Views call exactly one use case, serialize the DTO, map domain exceptions via the existing
global handler. No business logic, no ORM (per the established Phase-6B rules).

---

## 4. Sequence Diagram

```
Student        Frontend            DRF (thin)              Application                Infra / AI
  |  pick goal   |                    |                        |                          |
  |------------->| PUT /me/goal       |--SetStudentGoal------->| (existing)               |
  |  start test  |                    |                        |                          |
  |------------->| POST /placement/attempts                    |                          |
  |              |------------------->|--StartPlacement------->| select+snapshot items -->| QuestionBankRepo
  |              |<-- attempt {id} ---|<-----------------------|<-------------------------|
  |  load Qs     | GET .../test       |--GetPlacementTest----->| (no answer key)          |
  |              |<-- questions ------|<-----------------------|                          |
  |  answer written                   |                        |                          |
  |------------->| POST .../written   |--SubmitWritten-------->| status=written_submitted |
  |  speaking prompt                  |                        |                          |
  |------------->| GET .../speaking-prompt --------------------| (gate: written first)    |
  |  record/typed transcript          |                        |                          |
  |------------->| POST .../speaking  |--SubmitSpeaking------->| one-shot gate (C8)       |--STT? (optional)
  |              |                    |                        | status=speaking_submitted|
  |  finalize    | POST .../assess    |--AssessPlacement------>| readiness gate (C10)     |
  |              |                    |                        |  AssessmentRouter:       |
  |              |                    |                        |   1) HeuristicAssessor --| (baseline, always)
  |              |                    |                        |   2) OpenAIAssessor -----| (if enabled+confident)
  |              |                    |                        |  normalise(C7) + clamp   |
  |              |                    |                        |  build ConversationProfile|
  |              |                    |                        |  persist + StudentProfile.level
  |              |                    |                        |  log AssessmentLog        |--AssessmentLog
  |              |<-- ConversationProfile (CEFR, scores, topics, instructor difficulty) --|
  |  see result  | GET .../profile    |--GetConversationProfile| onboarding: placement ✓  |
  |  → pricing → payment → (existing booking gate)             |                          |
```

---

## 5. Database Changes (additive; OneClub `apps/onboarding`)

Existing OneClub placement is minimal (`PlacementQuestion{prompt,options,correct_index,skill,active}`,
`PlacementAttempt{student,answers,submitted_at}`, `PlacementResult{level,level_label,summary,skills}`).
All changes are **additive** (no drops, no destructive edits).

**`PlacementQuestion` (extend bank)** — add: `question_type`, `topic`, `difficulty_score(0..1)`,
`cefr_min/max`, `expected_answer_type`, `is_active` index. Keep `correct_index` server-only.

**`PlacementItem` (new — per-attempt snapshot, C1)** — `attempt FK`, `question FK PROTECT`, `section`,
`order`, `answer_text`, `transcript`, `audio` (nullable), per-item `score/grammar/vocabulary/fluency`,
`error_notes JSON`. Unique `(attempt, question)`.

**`PlacementAttempt` (extend)** — add `status` (state machine, C11), `goal FK`, `assessed_at`.
(Keep `answers` for back-compat or migrate into items.)

**`PlacementSpeakingAttempt` (new — one-shot gate, C8)** — `student`, `attempt`, `status`,
`is_used_attempt` (bool, indexed), `answered_count`, `duration_seconds`, audited
`reset_by/reset_at/reset_reason`. Never deleted.

**`ConversationProfile` (new — the deliverable; or extend `PlacementResult`)** — 1:1 with attempt:
`cefr_level`, `conversation_score`, `grammar_score`, `vocabulary_score`, `fluency_score`,
`confidence_score`, `pronunciation_score (nullable)`, `pronunciation_available (bool)`,
`overall_score`, `recommended_topics JSON`, `recommended_instructor_difficulty`,
`strengths JSON`, `weak_areas JSON`, `feedback`, `source`, `confidence`, `created_at`.

**`StudentProfile` (existing)** — already has `level`; add `placement_completed (bool)` +
`conversation_profile FK` (nullable) for fast onboarding/booking checks.

**`AssessmentLog` (new — infra audit, C12)** — `provider`, `confidence`, `latency_ms`,
`fallback_used`, `success`, `cost?`, `attempt`, `created_at`. (Optional `ProviderKillSwitch`.)

> No changes to `Subscription`/`Booking`/payment — the booking gate is untouched (R4).

---

## 6. API Changes (`/api/v1`, thin DRF)

| Method | Path | Use case | Notes |
|---|---|---|---|
| POST | `/placement/attempts/` | StartPlacement | body `{goalId}` → attempt |
| GET | `/placement/attempts/{id}/` | (state) | status + flags |
| GET | `/placement/attempts/{id}/test/` | GetPlacementTest | questions, **no correctIndex** |
| POST | `/placement/attempts/{id}/written/` | SubmitWritten | body `{answers:[{questionId,answer}]}` |
| GET | `/placement/attempts/{id}/speaking-prompt/` | GetSpeakingPrompt | gated on written |
| POST | `/placement/attempts/{id}/speaking/` | SubmitSpeaking | multipart (audio) or `{transcript}`; one-shot |
| POST | `/placement/attempts/{id}/assess/` | AssessPlacement | → `ConversationProfile` (201) |
| GET | `/placement/attempts/{id}/profile/` | GetConversationProfile | full profile |
| GET | `/placement/profile/latest/` | GetConversationProfile | student's latest |
| POST | `/admin/placement/{id}/reset-speaking/` | ResetSpeakingAttempt | admin, audited |

New error codes (→ existing global handler): `written_not_submitted`(409), `speaking_attempt_used`(409),
`speaking_response_too_short`(422), `placement_not_ready`(409), `placement_already_assessed`(409).
**Deprecates** the placeholder `POST /placement/attempts/{id}/result/` from earlier phases.

---

## 7. Frontend Changes (React, preserve design language)

The prototype's 3 onboarding screens map cleanly; one **sub-step** is added for speaking.

| Screen | Change |
|---|---|
| **Goal Selection** (exists, wired) | on continue → `StartPlacement` (creates attempt, stashes attemptId) |
| **AI Placement Test** (exists, currently mock-blocked) | `GetPlacementTest` for real questions → `SubmitWritten`; advances to speaking |
| **Speaking Prompt** (**new sub-step**, same screen shell) | `GetSpeakingPrompt`; capture via browser mic→transcript (MVP) or textarea fallback; `SubmitSpeaking`; one-shot UX (clear "you get one go") |
| **Placement Result** (exists, currently mock-blocked) | `AssessPlacement` then render `ConversationProfile`: CEFR ring, the 5–6 score bars (pronunciation shown only if `pronunciationAvailable`), recommended topics, instructor difficulty badge, strengths/weak areas |

- New hooks: `useStartPlacement`, `usePlacementTest`, `useSubmitWritten`, `useSpeakingPrompt`,
  `useSubmitSpeaking`, `useAssessPlacement`, `useConversationProfile` (extend `src/api/placement.ts`).
- Loading/empty/error/retry via existing `components/states`. No redesign of visual language.
- This **unblocks** the two placement pages Phase 7B flagged (they needed a submit endpoint).

---

## 8. Migration Strategy

1. **Additive migrations only** — new tables (`PlacementItem`, `PlacementSpeakingAttempt`,
   `ConversationProfile`, `AssessmentLog`) + nullable columns on existing models. No data loss; the
   thin current placement data (likely empty in prod) needs no backfill.
2. **Dual-read window** — keep `PlacementResult` readable; new reads go to `ConversationProfile`.
   (Or make `ConversationProfile` a superset and migrate `PlacementResult` rows forward by script.)
3. **Heuristic-first rollout** — ship with `HeuristicAssessor` as default; `OpenAIAssessor` behind a
   settings flag + kill-switch, dark-launched and compared via `AssessmentLog` before enabling.
4. **STT later** — speaking ships transcript-based (typed / browser Web Speech API) first;
   audio upload + `pronunciation_score` is a separate, optional follow-up (stays `null` until then).
5. **Feature flag** `PLACEMENT_V2_ENABLED`; old `/result/` endpoint kept returning 410/deprecation
   until the frontend cuts over.
6. **Backwards-compatible booking** — no change to subscription/booking; placement-complete is an
   onboarding marker only.

---

## 9. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Speaking capture (audio/STT) is the hardest part; browser mic + STT is flaky | High | Transcript-first MVP (typed or Web Speech API); audio/pronunciation strictly optional & marked unavailable (C6) |
| R2 | AI cost/latency/availability for OpenAI assessment | Med | Router with heuristic baseline (C2/C3); cache; one-shot speaking (C8); kill-switch + `AssessmentLog` cost view (C12) |
| R3 | **Confidence score is a novel metric** — risk of meaningless numbers | Med | Define it transparently from transcript stats; label as "speaking comfort"; validate against a small rubric; never present as absolute truth |
| R4 | "Booking Enabled" in the flow vs the existing **payment-approval booking gate** | High | Placement does **not** unlock booking; it completes onboarding & sets level/topics/difficulty. Hard gate stays = active subscription. Documented; no business-rule change |
| R5 | Pronunciation faked when no audio scorer | High (integrity) | `pronunciation_score` nullable; only emitted with a real scorer; UI hides it otherwise (C6) |
| R6 | Adding a speaking step expands the original 20-screen prototype | Med | Implement as a sub-step of the existing placement screen, not a new top-level screen; gated by the flow above |
| R7 | Importing Onlenco's coupling (courses/tutor/question_factory) | Med | Explicit DROP list (§1); ports keep AI/STT replaceable; zero LMS dependencies |
| R8 | Migration on a live `StudentProfile.level` already set by the old flow | Low | Additive columns; recompute via management command; old level preserved until reassessed |
| R9 | Anti-gaming (retake to inflate level) | Med | One-shot speaking + audited reset (C8); written retake allowed but speaking-capped (C5) |

---

## 10. Implementation Plan (phased; build after approval)

**Phase 8B — Domain & rules (pure, fully unit-tested, no Django)**
- `domain/` placement enums, DTOs, exceptions, events; rules: `cefr`, `scoring`, `confidence`,
  `recommend`, `readiness`, `profile`. Tests: band mapping, speaking-dominant blend + cap,
  confidence from transcript stats, topic/difficulty recommendation.

**Phase 8C — Persistence & repositories**
- Additive models + migrations (§5); `Django*Repository` adapters; question-bank seeding command
  (written warm-up + speaking prompts, difficulty-tagged). Tests: snapshot decoupling, one-shot gate.

**Phase 8D — Assessment providers & router**
- `AssessmentProvider` port; `HeuristicAssessor` (default); `AssessmentRouter` (chain + confidence +
  kill-switch + `AssessmentLog`); `OpenAIAssessor` behind flag (mocked in tests — no live calls).
  `StubSpeechToText`. Tests: router fallback, normalisation/clamping (C7), provider skip-by-None.

**Phase 8E — Use cases (application layer)**
- The 8 use cases (§3) with permission boundary + DTO-only returns; container wiring.
  Tests: full flow, readiness gate, one-shot speaking, ownership, profile correctness.

**Phase 8F — Thin DRF endpoints**
- Serializers (no answer key, camelCase) + thin views (§6) + URL routing + new error-code mapping.
  API tests (MSW-style / DRF APIClient) for each endpoint incl. loading/empty/error.

**Phase 8G — Frontend wiring**
- `src/api/placement.ts` + hooks; wire Goal → Test → Speaking sub-step → Result against the real API;
  unblock the two placement pages; integration test of the onboarding placement flow.

**Phase 8H — OpenAI enablement & hardening (optional, later)**
- Real `OpenAIAssessor` + (optional) STT/pronunciation behind flags; dark-launch compare via
  `AssessmentLog`; tune `PLACEMENT_LEVEL_MAP`/weights from real data.

---

### Approval gate
Implementation begins only after this architecture is approved. No production code, no OpenAI calls,
no Agora/tutor coupling, no booking/subscription changes are introduced by this document.
