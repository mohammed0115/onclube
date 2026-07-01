# OneClub Design System

> **Calm Sky Blue** — Phase 9.5 visual identity.
> OneClub is a premium, human conversation platform. Every screen should feel
> **friendly, premium, calm, human, modern, and elegant** — and make a first-time
> visitor think *"I want to join."*
>
> **The implementation is the source of truth.** This document explains the design
> language so contributors can extend it consistently. When code and doc disagree,
> the code in [`src/styles/globals.css`](../src/styles/globals.css) wins — and this
> file should be updated to match.

---

## 1. Design philosophy

OneClub is **not** an LMS, a course platform, an AI chatbot, or a finance dashboard.
It is a place to **practice English, build confidence, and speak naturally** with real
instructors, assisted by AI.

Design principles, in priority order:

1. **Trust** — vetted instructors, clear pricing, honest UI. No dark patterns.
2. **Clarity** — one obvious next action per screen; the eye is guided naturally.
3. **Confidence** — warm, judgement-free tone; mistakes are welcome.
4. **Warmth** — human illustration, soft shapes, friendly copy. Never robotic.
5. **Simplicity** — generous whitespace, large type, calm color.

Hard rules:

- **Light theme only.** Large dark backgrounds are forbidden (see §11 for the single
  scoped exception: live-video tiles).
- **Never use color without meaning** (see §2.3 — the semantic roles).
- **Never sacrifice usability for beauty.** Every button has a clear purpose.

---

## 2. Color system

All color lives as CSS custom properties in
[`src/styles/globals.css`](../src/styles/globals.css). There are **two layers**:

1. **Semantic tokens** (`:root`) — meaning-named (`--primary`, `--accent`, `--muted`…).
   Used through Tailwind utilities like `bg-primary`, `text-muted-foreground`.
2. **Ramp remap** (plain `@theme {}` block) — the built-in Tailwind `indigo` and
   `purple` color scales are **redefined**, so every `indigo-*` / `purple-*` utility in
   the codebase resolves to our brand hues without per-file edits. See §12 (migration).

### 2.1 Brand palette

| Role            | Hex       | Notes                                            |
| --------------- | --------- | ------------------------------------------------ |
| Primary         | `#3B82F6` | Calm sky blue (`blue-500`). Main brand color.    |
| Primary hover   | `#2563EB` | `blue-600`. Hover/active for primary surfaces.   |
| AI / periwinkle | `#6366F1` | Cool blue-violet — the **"AI-assisted"** signal. |
| Accent          | `#F59E0B` | Warm orange (`amber-500`). Deliberate highlight. |
| Success         | `#22C55E` | `green-500`.                                     |
| Warning         | `#F97316` | `orange-500`.                                    |
| Error           | `#EF4444` | `red-500`.                                       |

### 2.2 Surfaces & neutrals (slate scale)

| Token              | Hex                      | Usage                              |
| ------------------ | ------------------------ | ---------------------------------- |
| `--background`     | `#FFFFFF`                | App background.                    |
| `--surface`        | `#EFF6FF` (`blue-50`)    | Tinted panels, soft blue blocks.   |
| `--surface-2`      | `#F8FAFC` (`slate-50`)   | Secondary bg; dashboard canvas.    |
| `--card`           | `#FFFFFF`                | Cards always stay bright white.    |
| `--foreground`     | `#0F172A` (`slate-900`)  | Primary text.                      |
| `--muted`          | `#F1F5F9` (`slate-100`)  | Quiet fills, search bars.          |
| `--muted-foreground` | `#64748B` (`slate-500`) | Secondary text.                   |
| `--border`         | `rgba(15,23,42,0.08)`    | Hairline borders — kept light.     |
| `--input-background`| `#F8FAFC`               | Form fields.                       |
| `--ring`           | `rgba(59,130,246,0.45)`  | Focus ring (blue).                 |

### 2.3 Semantic roles (meaning, not decoration)

- **Blue** = the product, primary actions, navigation, links.
- **Periwinkle** (`purple-*` utilities) = **AI-assisted** content only — the AI badge,
  Sparkles, session-report intelligence. Never decorative.
- **Orange/amber** = the single highest-intent CTA, "most popular", instructor identity,
  and warnings. Use sparingly; orange means "look here".
- **Green** = success, positive progress, confirmations.
- **Red** = errors, destructive actions, "live" indicator.

> The colorful topic accents in [`mockData.ts`](../src/data/mockData.ts) (sky, cyan,
> emerald, rose, orange…) are an intentional **category palette** for topic tiles —
> variety that reads as friendly, not as semantic state.

### 2.4 Charts

Recharts/SVG use literal hex (not utilities) so they are set explicitly:
`#3B82F6` (primary series), `#6366F1` (AI), `#06B6D4`, `#22C55E`, `#F59E0B`, `#F97316`.
Mirror the `--chart-1..5` tokens.

---

## 3. Typography

Loaded in `globals.css` from Google Fonts.

- **Display** — `Plus Jakarta Sans` (`font-display`). Headings, hero, logo, card titles.
  Set automatically on `h1–h5` in the base layer.
- **Body** — `Inter` (`font-sans`). Paragraphs, labels, UI text.

### Scale (Tailwind utilities, large & readable — no tiny fonts)

| Use            | Class                          | Approx        |
| -------------- | ------------------------------ | ------------- |
| Hero           | `text-5xl`/`text-6xl` `font-extrabold` | 48–60px |
| Section title  | `text-3xl`/`text-4xl` `font-extrabold` | 30–36px |
| Card title     | `text-lg`/`text-xl` `font-bold`        | 18–20px |
| Body / lead    | `text-base`/`text-lg`                  | 16–18px |
| Secondary      | `text-sm`                              | 14px    |
| Eyebrow / meta | `text-xs` `font-bold uppercase tracking-widest` | 12px |

Base font size is `16px` (`--font-size`). Headings use `tracking-tight`; eyebrows use
`tracking-widest`. Body line-height stays comfortable (`leading-relaxed`).

---

## 4. Spacing scale

Tailwind's default 4px-based scale. Conventions:

- **Section vertical rhythm:** `py-20 md:py-24` (via `<Section>`).
- **Section horizontal padding:** `px-6 md:px-8`.
- **Card padding:** `p-6` (compact) to `p-7`/`p-8` (feature).
- **Content max width:** `max-w-6xl` for sections, `max-w-3xl` for prose (FAQ).
- **Gap between grid cards:** `gap-5`/`gap-6`.

Favor whitespace over borders for separation.

---

## 5. Radius & elevation

`--radius: 1rem` (16px), with a friendly scale:

| Token        | Value | Typical use            |
| ------------ | ----- | ---------------------- |
| `radius-sm`  | 10px  | chips, small controls  |
| `radius-md`  | 12px  | inputs                 |
| `radius-lg`  | 16px  | cards                  |
| `radius-xl`  | 20px  | feature cards          |
| `radius-2xl` | 24px  | hero / CTA panels      |

Buttons use `rounded-2xl`; large hero/CTA panels use `rounded-[2rem]`/`rounded-[2.5rem]`.

**Elevation** is soft and tinted, never harsh:
`shadow-sm` (resting cards) → `shadow-md`/`shadow-lg shadow-blue-100/60` (hover/raised).
Avoid heavy/black shadows.

---

## 6. Component guidelines

Primitives live in [`src/components/ui/`](../src/components/ui/) and are token-driven.

- **Button** ([`button.tsx`](../src/components/ui/button.tsx)) — variants:
  `primary` (blue gradient, default), `accent` (warm orange — **one per screen, the
  highest-intent CTA**), `ghost` (outline), `soft` (blue tint), `danger`, `link`, and
  `glass` (**reserved for the dark live-video stage only**). Sizes `sm | md | lg | icon`.
  Buttons are large, rounded, and have an `active:scale` press.
- **Card** ([`card.tsx`](../src/components/ui/card.tsx)) — white, `rounded-2xl`,
  hairline border, `shadow-sm`. Cards stay bright.
- **Input / Textarea** — `bg-input-background`, focus → `border-primary` + ring.
- **Badge** — tonal pills; `purple` tone = AI.
- **Switch / Tabs / Progress** — active state uses `--primary`.

Marketing building blocks live in
[`src/components/marketing/`](../src/components/marketing/): `Section`, `SectionHeading`,
`Eyebrow`, `BrandPanel` (the light auth side-panel), and the illustration set.

---

## 7. Iconography

- **Library:** [lucide-react](https://lucide.dev) only. Consistent stroke, minimal.
- **Sizes:** 12–14px inline, 16–18px nav/buttons, 20–22px feature tiles.
- **Color with meaning:** primary actions blue, AI periwinkle, success green, etc.
- Icons sit in soft rounded tiles (`rounded-2xl` with a 10%-tint background) on feature
  cards, or in gradient tiles for primary emphasis.

---

## 8. Illustration strategy

No raster art and no external illustration dependencies. The visual language is built
from four hand-made, fully themeable layers (all in
[`marketing/illustrations.tsx`](../src/components/marketing/illustrations.tsx)):

1. **Simple vector characters** — friendly round avatars (student + instructor) in
   `ConversationScene`. Human, never robotic.
2. **Conversation bubbles** — speech bubbles + a microphone signal live, human dialogue.
3. **3D gradient shapes (`BlobShape`)** — soft blue/orange gradient blobs for depth
   behind hero/auth content (low opacity, `pointer-events-none`).
4. **Soft background patterns** — the `bg-dot-pattern` utility (subtle blue dotted grid).

Plus `GrowthMark` for "confidence/progress" beats. Palette is locked to brand hues.
When adding illustrations: keep them simple, rounded, warm, and on-palette.

---

## 9. Motion

- **Soft, fast, elegant.** No flashy or gaming effects.
- Transitions: `transition-all duration-200`. Hovers lift cards `hover:-translate-y-1`
  with a soft tinted shadow. Buttons press with `active:scale-[0.98]`.
- Live/recording dots use a gentle `animate-pulse`.
- Respect reduced-motion preferences for any future larger animations.

---

## 10. Responsive rules

- **Mobile-first.** Single column by default; `sm:` (640) and `lg:` (1024) introduce
  multi-column grids. Major layout shifts at `md:` (768).
- Dashboard sidebar is hidden under `md` and returns as a `w-60` rail above it.
- Hero and split sections collapse to one column under `lg`; illustrations stack last.
- Touch targets stay ≥ 40px (`h-10`+). Type never drops below `text-xs` (12px).

---

## 11. Accessibility

- **Contrast ≥ WCAG AA.** `--foreground` (`#0F172A`) on white ≈ 17:1; white on
  `--primary` ≈ 3.7:1 for large/bold button text (passes AA for ≥18px/bold).
- **Amber caveat:** `#F59E0B` with white text fails AA. So:
  - `--accent-foreground` is **dark** (`#0F172A`) for amber chips/badges.
  - Orange **buttons** (`variant="accent"`) use the deeper `orange-500/600` with white
    text, which passes AA.
- **Focus:** every interactive element shows a visible `ring-2 ring-ring` (blue) with
  offset. Never remove focus outlines.
- **Semantics:** illustrations are `aria-hidden` or carry an `aria-label`/`role="img"`;
  icon-only buttons carry `aria-label`; errors use `role="alert"`.
- **Live-video exception (§ below):** the dark stage keeps white text at AA contrast.

### The one dark exception — live-video tiles

The "no large dark backgrounds" rule has a single, scoped exception: the **video tiles**
inside the live session ([`session/index.tsx`](../src/components/session/index.tsx)) use a
deep neutral slate (`from-slate-800 to-slate-900`) because that is where a camera feed
sits — a universal convention in video products. The **room chrome** (page, header,
sidebar, controls, footer) is fully light. Nothing else in the app may go dark.

---

## 12. Migration guide (how the reboot works)

The reboot preserved the engineering foundation and changed only the visual language.
The mechanism:

1. **Token rewrite** — `:root` semantic tokens in `globals.css` were set to the Calm Sky
   Blue palette. Anything using `bg-primary`, `text-muted-foreground`, `border-border`,
   etc. updated for free.
2. **Ramp remap (the key lever)** — a plain `@theme {}` block redefines the built-in
   `--color-indigo-*` scale to the **blue** ramp and `--color-purple-*` to the
   **periwinkle** ramp. The codebase had ~240 hardcoded `indigo-*`/`purple-*` utilities
   across 39 files; remapping the scales recolored all of them at once, with zero
   per-file churn. This is why `indigo` now means *blue* and `purple` means *AI*.
3. **Hand edits** for what utilities can't reach: literal chart/SVG hex, the few dark
   surfaces (landing, auth panels, pricing, live room) rebuilt light, and the landing
   page fully rewritten with the 11-section story.

**Adding new code:** prefer semantic tokens (`bg-primary`, `text-foreground`,
`bg-surface-2`). If you reach for a raw scale, remember `indigo-*` = blue and
`purple-*` = AI. Never reintroduce a large dark background. Keep cards white.

> ⚠️ **Do not** define a literal indigo/purple value expecting the old hue — the ramps
> are remapped globally.

---

## 13. Dark mode strategy (future, not implemented)

The infrastructure exists (`@custom-variant dark (&:is(.dark *))`) but **no dark theme
ships today**. When it is built:

1. Add a `.dark` block in `globals.css` overriding the **semantic** `:root` tokens only
   (`--background` → deep slate, `--foreground` → near-white, `--card` → elevated slate,
   borders/rings lightened). Do **not** re-darken via per-component classes.
2. Keep the brand hues (`--primary`, periwinkle, orange) but verify AA on dark surfaces;
   nudge lightness up one ramp step where needed.
3. The ramp remap stays; only semantic surface/text tokens flip.
4. Provide a toggle in the dashboard header + auth, persisted per user, defaulting to
   system preference. Honor `prefers-color-scheme`.

Until then, OneClub is light-only by design.

---

## 14. Source-of-truth file map

| Concern                      | File |
| ---------------------------- | ---- |
| Tokens + ramp remap          | [`src/styles/globals.css`](../src/styles/globals.css) |
| Buttons / cards / inputs …   | [`src/components/ui/`](../src/components/ui/) |
| Marketing blocks + brand panel | [`src/components/marketing/index.tsx`](../src/components/marketing/index.tsx) |
| Illustrations (SVG)          | [`src/components/marketing/illustrations.tsx`](../src/components/marketing/illustrations.tsx) |
| Landing (11-section story)   | [`src/pages/public/LandingPage.tsx`](../src/pages/public/LandingPage.tsx) |
| Dashboard shell              | [`src/components/layout/DashboardLayout.tsx`](../src/components/layout/DashboardLayout.tsx) |
| Live-room (dark exception)   | [`src/components/session/index.tsx`](../src/components/session/index.tsx) |
