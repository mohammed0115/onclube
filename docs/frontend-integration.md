# Phase 7 — Frontend ↔ Backend Integration

Integrates the existing React SPA with the existing Django REST API (`/api/v1`).
No redesigns, no new features, no business logic in the frontend — the SPA only
consumes the REST surface built in Phases 6B/6C.

## Architecture

```
src/api/            Typed API layer (no React)
  client.ts         fetch wrapper · JWT bearer · single-flight refresh on 401 · ApiError
  types.ts          response contracts (camelCase, mirror the DRF serializers)
  auth/billing/booking/placement/sessions/reports/notifications/topics.ts
src/auth/
  AuthProvider.tsx  session bootstrap, login/register/logout, reacts to logout signal
  guards.tsx        <RequireAuth>, <RequireRole roles={[...]}>
src/query/
  queryClient.ts    QueryClient + central query keys (qk)
src/hooks/index.ts  React Query query + mutation hooks (the only data surface pages use)
src/components/states/  <Loading> <EmptyState> <ErrorState(retry)> <QueryBoundary>
```

Provider nesting (`App.tsx`): `QueryClientProvider → BrowserRouter → AuthProvider → AppStateProvider`.

Dev wiring: `vite.config.ts` proxies `/api` → `http://localhost:8000` (override with
`VITE_API_TARGET`), so the SPA always calls same-origin `/api/...` (no CORS).

## Cross-cutting behaviours (all tested)

- **JWT**: access + refresh persisted in `localStorage` (`ec_access`/`ec_refresh`).
- **Auto-refresh**: a 401 triggers a single-flight `POST /auth/token/refresh/`, then the
  original request is retried once with the new access token.
- **Logout signal**: a failed refresh clears tokens and dispatches `ec:auth-logout`;
  `AuthProvider` redirects to `/login`.
- **Error interceptor**: every non-2xx becomes an `ApiError{status, code, detail}` carrying
  the backend's `{code, detail}` body (e.g. `no_active_subscription`).
- **Role routing**: route guards send anonymous users to `/login` and wrong-role users to
  their own home.
- **States**: Loading / Empty / Error+Retry primitives; React Query handles caching,
  invalidation and refetch.

## Pages wired to the API (markup preserved)

| Page | Hook(s) | Notes |
|---|---|---|
| Login | `useAuth().login` | real JWT; inline error + submitting state |
| Register | `useAuth().register` | registers then auto-logs-in |
| Goal Selection | `useGoals`, `useSetGoal` | `PUT /me/goal` |
| Pricing | `usePlans` | selected plan stashed for the proof step |
| Student Dashboard | `useStudentDashboard` | stats, progress chart, recent sessions, lock gate |
| **Payment Proof** (7B) | `usePlans`, `useSubmitPaymentProof` | real multipart upload → `pending_review` |
| **Payment Under Review** (7B) | `useSubscription` (polled) | reflects real status; **fake "simulate approval" removed** |
| **Book Session** (7B) | `useSubscription`, `useStudentTopics` | sub-gated; `TopicCard` icon/accent via adapter |
| **Questions Preview** (7B) | `useStudentTopic`, `useOpenSlots`, `useCreateBooking` | preview vs full by booking; server booking errors surfaced |
| **Live Session** (7B) | `useSession`, `useJoinSession`, `useEndSession` | join via `VideoProvider` seam (`src/lib/video.ts`); **no mock token** |
| **AI Report** (7B) | `useReport` | 200 ready / non-ready "generating" state; mistakes + recs + note |
| **Instructor Dashboard** (7B) | `useInstructorDashboard` | stats, today's sessions, topics |
| **Admin Dashboard** (7B) | `useAdminDashboard` | stats, pending queue, recent activity |
| **Admin Payment Approval** (7B) | `useAdminProofs`, `useApprovePayment`, `useRejectPayment` | real queue + approve/reject |
| **Dashboard chrome** (7B) | `useAuth`, `useNotifications` | profile = real user; bell badge = real unread count |
| Routing | `RequireRole` | student / instructor / admin / shared session+report |

## Partially wired (backend gap, documented, not faked)

| Page | What works | What's blocked (needs a backend endpoint not built) |
|---|---|---|
| Admin Payment Approval | queue + approve/reject (list endpoint) | **no `GET /admin/payment-proofs/{id}`** → receipt image, transaction ref, transfer date shown as "not available", never faked |
| Live Session | room context + join credential | **no booking→session link / "my sessions"** → navigating from a booking id can 404; needs `GET /sessions?booking=…` or a session id on the booking |
| Instructor Dashboard | stats + sessions + topics | participant/student names + weekly hours/reviews not in DTOs (no public instructor/aggregate endpoint) |
| Questions Preview / Live Session | instructor shown by name | **no public instructor detail** → rating/sessions/avatar unavailable |

## Still on mock / not wired (blocked or out-of-scope)

| Page | Reason |
|---|---|
| ~~Bank Transfer~~ | **Wired** — reads `GET /billing/payment-instructions/` (configurable provider; default Bank of Khartoum / Bankak). No hardcoded bank name remains |
| ~~Placement Test / Result~~ | **Fully wired in Phase 8F** — see the Placement flow section below |
| Instructor Availability | needs `setAvailability` calendar mapping + API/hooks (not added this phase) |
| Topic & Question Builder | needs instructor authoring API funcs/hooks (create/update/publish/add-question/approve/suggest) — not added this phase |
| Landing | marketing copy — legitimately static |
| Notifications (full panel) | bell badge wired; no dedicated notifications screen exists in the 20-screen design |

`src/data/mockData.ts` remains only for the pages above and the demo `ScreenNavigator`.

## Backend endpoints needed to fully unblock

- `GET /api/v1/admin/payment-proofs/{id}` — proof detail (receipt url, txn ref, transfer date)
- `GET /api/v1/billing/payment-proof/latest` — exact under-review status (today polled via subscription)
- A booking→session link (`GET /sessions?booking=` or `sessionId` on the booking DTO) — to open the room from a booking
- A public instructor detail endpoint — rating / sessions / avatar for chips
- Instructor authoring endpoints already exist server-side; the **frontend** needs matching `api/`+hooks to wire the Topic Builder / Availability pages

## Tests (`src/test/`, MSW + Vitest)

- `integration.test.ts` — full MVP journey against a mocked API (register → login → me → goal →
  plans → submit proof → subscription 404 → admin approve → subscription active → topics → book →
  join → report) + auto-refresh-on-401, failed-refresh→logout, domain-error mapping, bad creds.
- `hooks.test.tsx` — React Query hooks resolve through the provider.
- `pages.test.tsx` — page-level DOM tests (Book Session lock/active, Admin queue render + approve +
  error/retry, Admin dashboard, role-guard redirect). Chart-heavy pages are covered at the data
  layer instead (recharts + jsdom is a known testing-env friction).

## Placement flow (Phase 8F)

The placement interview is **fully wired** to the live backend — **no mock placement data
remains** (`placementQuestions` / `placementResult` were removed from `mockData.ts`).

> **Sprint 5 — Placement Result Experience.** Journey 2 is complete end-to-end
> (Registration → Goal → Written Test → Speaking Interview → Assessment → **Placement
> Result** → Continue to Subscription) with no mock data. `PlacementResultPage` is
> presentation + orchestration only: it renders the validated `GET /placement/result/`
> DTO verbatim (no CEFR estimation, no score calculation in the frontend) via reusable
> presentation components in `src/components/placement/result/` (ResultHeader, CEFRCard,
> SummaryCard, SkillScoreCard, StrengthCard, WeaknessCard, RecommendationCard,
> DifficultyCard, ResultFooter, ResultSkeleton). It has skeleton/loading, error+retry, and
> empty (missing-assessment) states, accessible progress bars, and **never renders provider
> name, prompts, raw AI data, or internal mechanics**. "Continue to plans" routes to
> `/billing/pricing`.

- **API** `src/api/placement.ts`: `test · start · status · saveWritten · saveSpoken · submit ·
  result · resetSpoken`. Types in `api/types.ts` carry **no answer key** (`correctAnswer` /
  `correctIndex` / `options`) and **no pronunciation field**.
- **Hooks** `src/hooks/index.ts`: `usePlacementTest`, `usePlacementStatus`, `usePlacementResult`,
  `useStartPlacementAttempt`, `useSaveWrittenAnswers`, `useSaveSpokenTranscripts`,
  `useSubmitPlacement` (mutations invalidate `placementStatus` / `placementResult` / `me`).
- **PlacementTestPage** — loads `GET /placement/test/`, starts/reuses an attempt via
  `POST /placement/start/`, and runs **one flow with two sections**: a **Written** section
  (`POST /placement/written-answers/`, overwritable/retakeable) then a **Spoken** section.
  The spoken section uses a **transcript text input** labelled **"Voice answer transcript"** to
  simulate the STT result — **microphone & speech-to-text are a future phase**; only fixed known
  spoken prompts are shown (no generation, no free conversation). Submit runs
  `POST /placement/spoken-transcripts/` then `POST /placement/submit/` and redirects to the result.
  Inline handling for `spoken_attempt_used`, `placement_incomplete`, `invalid_placement_question`,
  plus client-side "answer every question" validation.
- **PlacementResultPage** — renders `GET /placement/result/`: `cefrLevel`,
  `overallConversationScore`, grammar/vocabulary/fluency/confidence/written/spoken scores,
  strengths, weaknesses, recommended focus, conversation topics, instructor difficulty,
  `providerName` + `fallbackUsed`. **No pronunciation score is rendered (not in MVP).** A 404
  (`placement_result_not_found`) shows an empty state linking back to the test.
- **Status** `GET /placement/status/` drives progress, blocks a duplicate spoken submission once
  used, and short-circuits to the result once `assessed`. Route guards unchanged
  (`RequireRole(["student"])`).
- **UX states** — every screen supports loading / empty / error+retry / success / validation
  feedback via `@/components/states`.
- **Tests** `src/test/placement.test.tsx` (**13**) + MSW handlers in `src/test/server.ts`: loads
  questions from the API, no mock data remains, written/spoken submit, one-shot error, incomplete
  error, success redirect, result render, **no pronunciation in UI**, no `correctAnswer/correctIndex`
  in UI, route guard. Full frontend suite **28 passed**; `tsc` clean; `vite build` OK.

## Commands

```bash
npm run typecheck   # tsc -b --noEmit
npm test            # vitest run
npm run build       # tsc + vite build
npm run dev         # SPA on :5173, proxying /api → :8000 (run Django separately)
```

> Node was not preinstalled; a local Node 20 toolchain (`~/.local/node-v20.18.1-linux-x64/bin`)
> was used. **Verification status:** the foundation, auth, and the Phase-7-batch pages were
> verified earlier this session (tsc clean, integration+hooks tests green, `vite build` OK, and the
> running app driven via curl: proxy + login + `/me`). The **final Phase-7B test/typecheck/build
> re-run could not be executed** — the sandbox's command-permission stream began rejecting all
> `node`/`npx` invocations mid-session. The Phase-7B edits are type-consistent by construction but
> the last full `npm test` / `npm run build` were not re-run; they should be re-run when the
> sandbox recovers.
