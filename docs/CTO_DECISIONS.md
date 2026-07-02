# CTO Decisions

- Business Logic stays in Application Layer.
- OneClub is a Conversation Practice Platform.
- Payment is a Verification Workflow.
- AI assists instructors only.

## Architecture Decision Records

- [ADR-019 — Placement Interview Architecture](ADR-019-placement-interview-architecture.md):
  the speaking interview is an isolated business scenario (Interview → Transcript →
  Assessment), with a dedicated `InterviewSession` lifecycle, an abstract
  `SpeechProvider`, transcript locking + `VOICE`/`MANUAL` answer source, and
  resume-from-last-question. No assessment fields in the interview layer.
- [ADR-020 — Placement Assessment Provider Architecture](ADR-020-placement-assessment-provider.md):
  assessment runs behind an `AssessmentProvider` seam. OpenAI is replaceable and
  primary when configured; the deterministic heuristic is always the fallback (AI
  failure never breaks placement). Structured JSON validation is mandatory and
  business rules (spoken CEFR cap) override AI output. OpenAI/HTTP lives only in
  infrastructure; domain/application never import it.
- [ADR-021 — Prompt Architecture](ADR-021-prompt-architecture.md): prompts are
  internal, versioned, server-side assets in `infrastructure/prompts/`. Providers
  do not own prompt text — they receive built messages from a `PromptBuilder`.
  Prompts are never exposed to clients/API/DTOs and carry no PII (the placement
  builder accepts only an `AssessmentInput`).

---

## CTO-001 — Placement questions are fixed, owned content (2026-06)

**Placement questions are fixed content owned by OneClub. The smart teacher
only asks known spoken questions and never generates placement questions.**

**Why.** Placement must be fair, comparable and reproducible so CEFR levels stay
calibrated; a generated/drifting set would undermine that. It also keeps the AI
tutor an *interviewer, not a content owner* (consistent with "AI assists only"),
and bounds cost + quality/safety risk.

**How it's enforced.**
- `apps.placement.PlacementQuestion` is the single source of truth; seeded by
  `manage.py seed_placement` (idempotent), admin-edited only.
- `domain.placement.attempt_rules.ensure_known_questions(...)` raises
  `InvalidPlacementQuestion` for any answer outside the fixed set.
- The public `PlacementQuestionDTO` carries **no answer key** — `correct_answer`,
  `correct_index`, `options`, `scoring_rubric` are server-side only.

**MVP non-goals.** No AI-generated questions, no adaptive/free-form conversation,
**no pronunciation score**, no uploaded-audio grading. Audio → transcript (STT)
only; all scoring is text-based.

See [placement-architecture.md](placement-architecture.md) ·
[placement-domain-rules.md](placement-domain-rules.md) · `apps/placement/`.

---

## CTO-002 — Rename product to OneClub (2026-06, approved)

**The product name is officially changed from "English Club" to "OneClub."**

**Why.** Stronger, more memorable brand; not limited to English only (supports
future expansion); better for trademark and international growth.

**Impact.**
- **Documentation** — all docs and READMEs updated (this repo).
- **Branding** — the in-app logo, page titles (`index.html`), and landing/register
  copy now read **OneClub**. The word "English" remains where it refers to the
  language (e.g. "Speak English", "English conversation practice"), not the brand.
- **Architecture unchanged** — no module, package, model, API path, DB label, or
  identifier was renamed; this is a brand/copy/docs change only. The repository
  directory (`onclube`) and Python package layout are untouched.
- **External (out of repo, owner action)** — GitHub repository name, Figma files,
  and deployment/environment names to be renamed by the team; tracked here for
  visibility.

**Verification.** `tsc` clean · frontend suite green · `vite build` OK · backend
suite green after the sweep.
