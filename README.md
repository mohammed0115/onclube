# English Club

A structured English **conversation practice** platform (frontend MVP). Students already
know basic English — they register, pick a goal, take an AI placement test, pay by **local
bank transfer**, wait for **admin approval**, then book **live conversation sessions** with a
human instructor, receive **discussion questions in advance**, attend the session, and get an
**AI session report** afterward.

This is a frontend prototype: **mock data only, no backend, no real API calls.**

## Run

```bash
npm install
npm run dev      # start Vite dev server
npm run build    # type-check + production build
```

## What AI does (and doesn't)

AI has exactly five supporting roles and **never replaces the instructor**:

1. Placement test
2. Generate subtopics for the instructor
3. Generate discussion questions
4. Analyze the session afterward
5. Generate improvement recommendations

The instructor owns every topic; AI suggestions must be explicitly accepted.

## Business rules encoded in the UI

- A student **cannot book** a session until payment is **approved**.
- Payment proofs are **reviewed by an admin** — never auto-approved.
- Instructors **create topics**; AI only suggests subtopics/questions.
- Students **see the questions before** the session.
- AI **analyzes the session after** it completes.
- AI **assists**, it does **not** replace the instructor (separate human instructor note in
  every report).

## The 20 screens

Public: Landing · Register · Login
Onboarding: Goal Selection · AI Placement Test · Placement Result
Billing: Pricing · Bank Transfer · Payment Proof · Payment Under Review
Student: Dashboard · Book Session · Questions Preview · Live Session Room · AI Report
Instructor: Dashboard · Availability · Topic & AI Question Builder
Admin: Dashboard · Payment Approval

A floating **screen navigator** (bottom-right) lets you jump to any screen and switch the
active role / payment status to explore the gated flows.

## Structure

```
src/
├── app/            App.tsx, AppState (role + payment gating)
├── routes/         all 20 routes
├── pages/          public · onboarding · billing · student · instructor · admin
├── components/     layout · cards · forms · navigation · session · payment · ai · ui
├── data/           mockData.ts
├── types/          domain types
├── lib/            utils
└── styles/         globals.css (indigo/purple theme, fonts)
```

## Stack

React 18 · Vite 6 · TypeScript · react-router 7 · Tailwind CSS v4 · shadcn/ui primitives ·
lucide-react · recharts.
