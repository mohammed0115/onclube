import { describe, it, expect, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthProvider";
import { RequireRole } from "@/auth/guards";
import { tokenStore } from "@/api";
import { setSpeechProvider, resetSpeechProvider } from "@/lib/speech";
import type { SpeechHandlers, SpeechErrorKind } from "@/lib/speech";
import { server } from "./server";
import { renderPage } from "./utils";

import { PlacementTestPage } from "@/pages/onboarding/PlacementTestPage";
import { PlacementResultPage } from "@/pages/onboarding/PlacementResultPage";
import * as mockData from "@/data/mockData";

const W_PROMPT = "Describe your typical morning routine.";
const W_OPTION = "I wake up early";

function renderFlow(route = "/onboarding/placement-test") {
  tokenStore.set({ access: "access-1", refresh: "refresh-1" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <Routes>
            <Route path="/onboarding/placement-test" element={<PlacementTestPage />} />
            <Route path="/onboarding/placement-result" element={<PlacementResultPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function fillWrittenAndContinue() {
  await screen.findByText(W_PROMPT);
  await userEvent.click(screen.getByRole("radio", { name: W_OPTION }));
  await userEvent.click(screen.getByRole("button", { name: /Continue to spoken/i }));
}

/** A controllable fake SpeechProvider the tests drive directly. */
function installFakeProvider() {
  let handlers: SpeechHandlers | null = null;
  setSpeechProvider({
    isSupported: () => true,
    start: (h: SpeechHandlers) => {
      handlers = h;
    },
    stop: () => {},
    abort: () => {},
  });
  return {
    async result(text: string) {
      await act(async () => {
        handlers?.onResult(text);
        handlers?.onEnd();
      });
    },
    async fail(kind: SpeechErrorKind) {
      await act(async () => {
        handlers?.onError(kind);
        handlers?.onEnd();
      });
    },
  };
}

async function startInterview() {
  await screen.findByText(/Hello, and welcome/i);
  await userEvent.click(screen.getByRole("button", { name: /Start interview/i }));
  await screen.findByText("What is your name?");
}

async function recordAnswer(ctrl: ReturnType<typeof installFakeProvider>, text: string) {
  await userEvent.click(screen.getByRole("button", { name: /Record answer/i }));
  await ctrl.result(text);
}

async function completeInterview(ctrl: ReturnType<typeof installFakeProvider>, a1 = "My name is Sam", a2 = "I am twenty") {
  await fillWrittenAndContinue();
  await startInterview();
  await recordAnswer(ctrl, a1);
  await userEvent.click(screen.getByRole("button", { name: /^Continue/i }));
  await screen.findByText("How old are you?");
  await recordAnswer(ctrl, a2);
  await userEvent.click(screen.getByRole("button", { name: /Finish interview/i }));
}

afterEach(() => resetSpeechProvider());

// ── written section (Sprint 1) ────────────────────────────────────────────────
describe("PlacementTestPage — written", () => {
  it("has no placement mock data left in the bundle", () => {
    expect("placementQuestions" in mockData).toBe(false);
    expect("placementResult" in mockData).toBe(false);
  });

  it("submits written answers to the API", async () => {
    let body: { attemptId?: string; answers?: { questionId: string; answerText: string }[] } = {};
    server.use(
      http.post("*/api/v1/placement/written-answers/", async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ id: "att1", status: "in_progress", version: 1, goalId: null, startedAt: "x", submittedAt: null, assessedAt: null, fallbackUsed: false, providerName: null });
      })
    );
    renderFlow();
    await fillWrittenAndContinue();
    await waitFor(() => expect(body.answers?.[0]).toMatchObject({ questionId: "wq1" }));
    expect(body.answers?.[0].answerText).toBe(W_OPTION);
  });

  it("validates empty answers before continuing", async () => {
    renderFlow();
    await screen.findByText(W_PROMPT);
    await userEvent.click(screen.getByRole("button", { name: /Continue to spoken/i }));
    expect(await screen.findByText(/answer every written question/i)).toBeInTheDocument();
  });

  it("never renders an answer key (no correctAnswer / correctIndex)", async () => {
    renderFlow();
    await screen.findByText(W_PROMPT);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/correctIndex/i);
    expect(text).not.toMatch(/correctAnswer/i);
  });

  it("navigates written questions with Previous / Next", async () => {
    server.use(
      http.get("*/api/v1/placement/test/", () =>
        HttpResponse.json({
          written: [
            { id: "wq1", type: "written", prompt: "First question?", skill: "grammar", cefrBand: "A1", order: 1, options: ["a", "b"] },
            { id: "wq2", type: "written", prompt: "Second question?", skill: "grammar", cefrBand: "A2", order: 2, options: ["c", "d"] },
          ],
          spoken: [{ id: "sq1", type: "spoken", prompt: "x", skill: "fluency", cefrBand: "B1", order: 1, options: [] }],
        })
      )
    );
    renderFlow();
    await screen.findByText("First question?");
    await userEvent.click(screen.getByRole("button", { name: /^Next/i }));
    expect(await screen.findByText(/choose an answer to continue/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "a" }));
    await userEvent.click(screen.getByRole("button", { name: /^Next/i }));
    expect(await screen.findByText("Second question?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Previous/i }));
    expect(await screen.findByText("First question?")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "a" })).toBeChecked();
  });
});

// ── speaking interview (Sprint 2 / 2.5) ───────────────────────────────────────
describe("PlacementTestPage — speaking interview", () => {
  it("uses the injected SpeechProvider and enters the interview from the welcome", async () => {
    installFakeProvider();
    renderFlow();
    await fillWrittenAndContinue();
    expect(await screen.findByText(/Hello, and welcome/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Start interview/i }));
    expect(await screen.findByText("What is your name?")).toBeInTheDocument();
    expect(screen.getByText(/Question 1 of 2/i)).toBeInTheDocument();
  });

  it("asks the fixed questions in order", async () => {
    const ctrl = installFakeProvider();
    renderFlow();
    await fillWrittenAndContinue();
    await startInterview();
    await recordAnswer(ctrl, "My name is Sam");
    await userEvent.click(screen.getByRole("button", { name: /^Continue/i }));
    expect(await screen.findByText("How old are you?")).toBeInTheDocument();
    expect(screen.getByText(/Question 2 of 2/i)).toBeInTheDocument();
  });

  it("locks a voice transcript (read-only, records source=voice)", async () => {
    let firstBody: { source?: string; transcriptText?: string } = {};
    let n = 0;
    server.use(
      http.post("*/api/v1/placement/interview/answer/", async ({ request }) => {
        if (n++ === 0) firstBody = (await request.json()) as typeof firstBody;
        return HttpResponse.json({ interviewId: "int1", attemptId: "att1", status: "running", currentQuestionIndex: 1, startedAt: "x", finishedAt: null, answers: [] });
      })
    );
    const ctrl = installFakeProvider();
    renderFlow();
    await fillWrittenAndContinue();
    await startInterview();
    await recordAnswer(ctrl, "My name is Sam");
    expect(await screen.findByText(/Answer captured/i)).toBeInTheDocument();
    expect(screen.getByText(/voice · locked/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); // not editable
    await userEvent.click(screen.getByRole("button", { name: /^Continue/i }));
    await waitFor(() => expect(firstBody.source).toBe("voice"));
    expect(firstBody.transcriptText).toBe("My name is Sam");
  });

  it("falls back to a manual transcript when the mic is blocked (source=manual)", async () => {
    let body: { source?: string; transcriptText?: string } = {};
    server.use(
      http.post("*/api/v1/placement/interview/answer/", async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ interviewId: "int1", attemptId: "att1", status: "running", currentQuestionIndex: 1, startedAt: "x", finishedAt: null, answers: [] });
      })
    );
    const ctrl = installFakeProvider();
    renderFlow();
    await fillWrittenAndContinue();
    await startInterview();
    await userEvent.click(screen.getByRole("button", { name: /Record answer/i }));
    await ctrl.fail("permission-denied");
    expect(await screen.findByText(/Microphone access was blocked/i)).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox"), "Typed name");
    await userEvent.click(screen.getByRole("button", { name: /^Continue/i }));
    await waitFor(() => expect(body.source).toBe("manual"));
    expect(body.transcriptText).toBe("Typed name");
  });

  it("lets the student retry recording after a failure", async () => {
    const ctrl = installFakeProvider();
    renderFlow();
    await fillWrittenAndContinue();
    await startInterview();
    await userEvent.click(screen.getByRole("button", { name: /Record answer/i }));
    await ctrl.fail("no-speech");
    expect(await screen.findByText(/didn't catch that/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Retry recording/i }));
    await ctrl.result("Second try");
    expect(await screen.findByText(/Answer captured/i)).toBeInTheDocument();
    expect(screen.getByText("Second try")).toBeInTheDocument();
  });

  it("recovers from a network interruption and still lets the student continue", async () => {
    const ctrl = installFakeProvider();
    renderFlow();
    await fillWrittenAndContinue();
    await startInterview();
    await userEvent.click(screen.getByRole("button", { name: /Record answer/i }));
    await ctrl.fail("network");
    expect(await screen.findByText(/connection dropped/i)).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox"), "Typed after drop");
    await userEvent.click(screen.getByRole("button", { name: /^Continue/i }));
    expect(await screen.findByText("How old are you?")).toBeInTheDocument();
  });

  it("resumes from the last completed question after a refresh", async () => {
    // The server reports one answer already captured; the UI resumes at question 2.
    server.use(
      http.get("*/api/v1/placement/interview/session/", () =>
        HttpResponse.json({
          interviewId: "int1", attemptId: "att1", status: "running", currentQuestionIndex: 1,
          startedAt: "x", finishedAt: null,
          answers: [{ questionId: "sq1", order: 1, transcriptText: "Saved first", source: "voice" }],
        })
      )
    );
    installFakeProvider();
    renderFlow();
    await fillWrittenAndContinue();
    // No welcome screen on resume — straight to the next unanswered question.
    expect(await screen.findByText("How old are you?")).toBeInTheDocument();
    expect(screen.getByText(/Question 2 of 2/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start interview/i })).not.toBeInTheDocument();
  });

  it("finalizes and navigates to the result on the next step", async () => {
    const ctrl = installFakeProvider();
    renderFlow();
    await completeInterview(ctrl);
    expect(await screen.findByText(/Interview complete/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /See my result/i }));
    expect(await screen.findByText(/Your placement result/i)).toBeInTheDocument();
  });

  it("surfaces a one-shot error if saving is rejected", async () => {
    server.use(
      http.post("*/api/v1/placement/interview/answer/", () =>
        HttpResponse.json({ code: "spoken_attempt_used", detail: "used" }, { status: 409 })
      )
    );
    const ctrl = installFakeProvider();
    renderFlow();
    await fillWrittenAndContinue();
    await startInterview();
    await recordAnswer(ctrl, "My name is Sam");
    await userEvent.click(screen.getByRole("button", { name: /^Continue/i }));
    expect(await screen.findByText(/already used your one spoken attempt/i)).toBeInTheDocument();
  });

  it("never exposes the interviewer's system prompt", async () => {
    installFakeProvider();
    renderFlow();
    await fillWrittenAndContinue();
    await screen.findByText(/Hello, and welcome/i);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/you are an english placement interviewer/i);
  });
});

describe("Placement route guard", () => {
  it("does not render the placement test for a non-student session", async () => {
    server.use(
      http.get("*/api/v1/me/", () =>
        HttpResponse.json({ id: "a1", fullName: "Ops Admin", email: "a@e.com", role: "admin", status: "active", level: null, goalId: null, paymentStatus: null, sessionsRemaining: null, rating: null, headline: null })
      )
    );
    renderPage(
      <RequireRole roles={["student"]}>
        <PlacementTestPage />
      </RequireRole>
    );
    await waitFor(() => expect(screen.queryByText("AI placement")).not.toBeInTheDocument());
    expect(screen.queryByText(W_PROMPT)).not.toBeInTheDocument();
  });
});
