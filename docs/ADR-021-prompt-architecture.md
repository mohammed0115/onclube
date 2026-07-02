# ADR-021 — Prompt Architecture

**Status:** Accepted (2026-07) · **Scope:** AI prompt construction (assessment).

## Context

The OpenAI assessment provider (ADR-020) embedded its prompt text directly. Prompts
are sensitive, evolving assets that need versioning, review, and testing, and must
never leak to clients. Owning prompt text inside a provider made them hard to
review/version and coupled model wiring to prompt wording.

## Decisions

### 1. Prompts are internal, server-side assets

All prompt text lives in `infrastructure/prompts/`. It is never stored in the
frontend, never returned by any API, and never placed on a DTO. The domain and
application layers do not import prompts (enforced by test).

### 2. Providers do not own prompt text

`OpenAIAssessmentProvider` no longer contains prompt strings. It receives built
messages from a `PromptBuilder`, calls the model, and forwards the raw response to
domain validation. Its responsibilities shrink to: build-via-builder → call model
→ validate → fallback.

### 3. Prompt components

```
PromptVersion   — { version, review_note }         (version metadata)
PromptTemplate  — prompt_id, purpose, system_message, instruction_message,
                  expected_output_schema, version   (a versioned, reviewable asset)
PromptMessages  — { system, instruction, user } → to_openai_messages()
PromptBuilder   — abstract: template + build(context) → PromptMessages
PlacementAssessmentPromptBuilder — builds from an AssessmentInput ONLY
```

### 4. Versioning & reviewability

Every template carries `prompt_id`, `version` (+ `review_note`), `purpose`,
`system_message`, `instruction_message`, and `expected_output_schema`. An invalid
template (missing core fields) raises on construction, so a missing/broken prompt
fails fast and the provider falls back.

### 5. Placement prompt content rules (unchanged behavior)

The placement template requires the model to return ONLY the fixed JSON keys,
forbids free-form explanation and unknown fields, and states that **business rules
(e.g. the spoken CEFR cap) override the model output**. Prompt wording was moved,
not tuned — scoring behavior is unchanged.

### 6. Minimum data / no PII

`PlacementAssessmentPromptBuilder.build` accepts only an `AssessmentInput` (whose
fields are exactly written answers, speaking transcript, goal), so no password,
JWT, payment data, email, phone, internal id, or model object can enter a prompt by
construction.

### 7. Security

Prompts, API key, provider config, and raw responses never reach the client or the
DTO. Only the failure *type* is logged — never prompt/input/response.

## Consequences

- Prompts can be reviewed and versioned independently of provider wiring.
- The provider’s `chat` seam now takes `messages` (built by the builder).
- No new API, model, migration, or frontend surface.

## References

`infrastructure/prompts/{base,placement_assessment}.py` ·
`infrastructure/gateways/openai_assessment.py` ·
`infrastructure/tests/test_prompt_architecture.py` ·
`infrastructure/tests/test_openai_assessment_provider.py`. See also
[ADR-020](ADR-020-placement-assessment-provider.md).
