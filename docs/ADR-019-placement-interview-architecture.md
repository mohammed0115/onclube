# ADR-019 — Placement Interview Architecture

**Status:** Accepted (2026-07) · **Scope:** Placement speaking interview only.

## Context

The placement journey has two parts: a written multiple-choice test and a spoken
interview. Earlier work coupled the spoken step to the assessment/submit flow and
saved all transcripts in one batch at the end, with capture state living only in
the browser. That made the interview fragile (a refresh lost progress), hard to
reason about (interview and assessment concerns intermixed), and tied to the
browser Web Speech API.

This ADR records the architecture that **isolates the speaking interview as an
independent business scenario whose only output is a finalized transcript.**

## Decisions

### 1. Interview isolation

The interview is fully separated from the assessment engine. No interview module
(backend use case, DTO, model, or frontend component) references CEFR, scores,
grammar, vocabulary, confidence, or recommendations.

- `application/placement/interview.py` imports **no** assessor.
- `InterviewSession` (model + DTO) carries **no** assessment fields — verified by
  `test_interview_session_model_has_no_assessment_fields` and
  `test_session_never_carries_assessment_fields`.
- The pipeline is explicit: **Interview → Transcript → Assessment (future sprint).**
  Assessment reads the finalized spoken answers; it is triggered separately.

### 2. Interview Session lifecycle

A dedicated `InterviewSession` owns the interview lifecycle and progress:
`interview_id`, `attempt` (1:1 with the placement attempt),
`current_question_index`, `status`, `started_at`, `finished_at`. The transcript is
the ordered set of `PlacementSpokenAnswer` rows for the attempt.

States: **created → running → completed → finalized.**
- `created` on get-or-create; `running` after the first saved answer;
  `completed`/`finalized` on finalize (with `finished_at`).

### 3. SpeechProvider abstraction

Speech recognition depends on an abstract `SpeechProvider` interface, never on the
Web Speech API directly:

```
SpeechProvider
  ↳ WebSpeechProvider   (now)
  ↳ Azure / Google / Whisper / Deepgram (future)
```

`src/lib/speech.ts` exposes the interface plus a swappable active provider
(`getSpeechProvider` / `setSpeechProvider`), which keeps the UI testable and lets
another engine drop in behind the same seam. Only transcript text crosses the
boundary — no audio, no pronunciation scoring.

### 4. Transcript locking + manual fallback + answer source

Every answer records its **source**: `VOICE` or `MANUAL`.
- **Recognition succeeds → VOICE, locked.** The transcript cannot be edited
  (re-saving the identical voice text is an idempotent no-op; any edit →
  `transcript_locked` 409).
- **Recognition fails → MANUAL.** The student types the answer, which becomes the
  official transcript. Every failure mode (permission denied, mic unavailable,
  timeout, recognition error, network) drops to the editable fallback so the
  student can always continue.

### 5. Error recovery / resume

Answers are persisted **per question** via `POST /placement/interview/answer/`, and
the session tracks `current_question_index`. On refresh / reconnect, the UI calls
`GET /placement/interview/session/` and resumes from the last completed question
with every captured answer intact — no completed answer is lost.

### 6. AI Interviewer (unchanged)

`InterviewerProvider` stays an abstract provider. The interviewer may greet,
explain, ask the fixed questions, repeat/clarify (meaning-preserving), encourage,
and finish. It may **not** score, evaluate, recommend, generate questions, skip, or
reorder. Model prompts/keys remain server-side and never reach the client.

## Consequences

- The interview can be developed, tested, and reasoned about on its own; assessment
  can be built later without touching it.
- New API surface: `GET /placement/interview/session/`,
  `POST /placement/interview/answer/`, `POST /placement/interview/finalize/`.
- A DB migration adds `InterviewSession` and `PlacementSpokenAnswer.source`.
- The legacy batch endpoint (`POST /placement/spoken-transcripts/`) remains for
  backward compatibility but the UI no longer uses it (technical debt to retire).

## References

`apps/placement/models.py` (InterviewSession, AnswerSource) ·
`application/placement/interview.py` · `domain/placement/interview_rules.py` ·
`src/lib/speech.ts` · `src/components/placement/SpeakingInterview.tsx` ·
`api/tests/test_interview_session_api.py`.
