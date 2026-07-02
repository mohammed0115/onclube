# ADR-020 — Placement Assessment Provider Architecture

**Status:** Accepted (2026-07) · **Scope:** Placement assessment engine + providers.

## Context

Placement produces a structured assessment (CEFR level + dimension scores +
recommendations) from a student's written answers and finalized speaking
transcript. We need this to be deterministic and always-available, while allowing
an AI provider (OpenAI) to improve quality when configured — without leaking
prompts/keys, and without an AI outage ever breaking placement.

## Decisions

### 1. Engine + provider seam (OpenAI is replaceable)

```
AssessmentInput → PlacementAssessmentEngine → AssessmentProvider → AssessmentResult DTO
                                                 ↳ HeuristicAssessmentProvider (deterministic)
                                                 ↳ OpenAIAssessmentProvider    (infrastructure)
```

The engine and use cases depend only on the abstract `AssessmentProvider`. The
**composition root** (`infrastructure/container.default_assessment_engine`) is the
only place that selects a provider. Swapping OpenAI ↔ heuristic changes nothing in
the domain, use cases, APIs, DB, or frontend.

### 2. Heuristic is the fallback (AI failure never breaks placement)

`OpenAIAssessmentProvider` wraps a mandatory `fallback` (the heuristic). It degrades
to the fallback on **every** failure mode: missing API key, timeout, unavailable,
rate limit, empty response, invalid JSON, schema-validation failure, or any
exception. No assessment request fails because OpenAI failed.

When `OPENAI_API_KEY` is unset the composition root selects the heuristic outright,
so tests and local dev run with no OpenAI dependency.

### 3. Structured validation is mandatory

OpenAI must return a JSON object matching the DTO fields. A pure domain validator
(`domain/placement/assessment/schema.parse_assessment_payload`) enforces: required
fields present; `cefrLevel ∈ {A1,A2,B1,B2,C1}`; scores numeric in 0–100;
strengths/weaknesses/recommendedTopics are lists of strings;
`recommendedInstructorDifficulty ∈ {supportive,balanced,challenging}`. Unknown
fields are ignored safely. Free-form text / partial / invalid JSON is rejected →
fallback.

### 4. Business rules override AI output

The domain assembler re-applies the spoken-performance **CEFR cap** to the
provider's output: a weak spoken transcript caps the final level regardless of the
level the AI proposed (`spoken_capped` / `spoken_ceiling`). AI proposes; domain
invariants decide.

### 5. Clean-architecture boundaries

OpenAI/HTTP/JSON I/O lives only in `infrastructure/gateways/openai_assessment.py`.
The **domain** imports no OpenAI/requests/Django/ORM/env; the **application** layer
does not know OpenAI exists. The `openai` SDK is a lazy, optional import (never
required for tests or local dev).

### 6. Prompt & data security

The system prompt is a server-side constant; it, the API key, provider config, and
the raw response never reach the client and are never placed on the DTO. Only the
failure *type* is logged — never the prompt, input, or raw response. Only the
minimum data is sent to OpenAI: written answer text, spoken transcript text, and
the student goal — no ids, JWT, payment data, or model objects.

## Configuration

`OPENAI_API_KEY` (unset → heuristic), `OPENAI_MODEL` (default `gpt-4o-mini`),
`OPENAI_TIMEOUT_SECONDS` (default 20).

## Consequences

- OpenAI is primary when configured; heuristic is always the safety net.
- New env vars; no new API endpoints, models, or migrations.
- The `openai` package must be installed in environments that set a key
  (otherwise the lazy import fails at call time and the provider falls back).

## References

`domain/placement/assessment/{engine,provider,heuristic,schema}.py` ·
`infrastructure/gateways/openai_assessment.py` ·
`infrastructure/container.py` · `config/settings.py` ·
`infrastructure/tests/test_openai_assessment_provider.py` ·
`domain/placement/tests/test_assessment_schema.py`.
