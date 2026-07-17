import { describe, it, expect, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthProvider";
import { RequireRole } from "@/auth/guards";
import { tokenStore } from "@/api";
import { setSpeechProvider, resetSpeechProvider } from "@/lib/speech";
import { setTutorVoiceProvider, resetTutorVoiceProvider } from "@/lib/voice";
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

/** Deterministic fake TTS: greeting/question "speech" completes immediately. */
function installFakeVoice() {
  setTutorVoiceProvider({
    isSupported: () => true,
    listVoices: () => [],
    getState: () => "idle",
    speak: (_t, h) => {
      h?.onStart?.();
      h?.onEnd?.();
    },
    stop: () => {},
    pause: () => {},
    resume: () => {},
  });
}

/** A controllable fake SpeechRecognitionProvider the tests drive directly. */
function installFakeSpeech(supported = true) {
  let handlers: SpeechHandlers | null = null;
  setSpeechProvider({
    isSupported: () => supported,
    getState: () => "idle",
    start: (h: SpeechHandlers) => {
      handlers = h;
    },
    stop: () => {},
    abort: () => {},
    cancel: () => {},
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

/** Pass the readiness screen via the explicit Start action. */
async function startFromReadiness() {
  await fillWrittenAndContinue();
  // Readiness screen appears first; Start is enabled once checks resolve.
  const start = await screen.findByRole("button", { name: /^Start interview/i });
  await userEvent.click(start);
}

/** Reach the first question — the mic auto-opens (no "Record answer" button, 2.0.1B). */
async function reachFirstQuestion() {
  await startFromReadiness();
  expect(await screen.findByText("What is your name?")).toBeInTheDocument();
  await screen.findByRole("button", { name: /Stop recording/i }); // mic opened automatically (listening)
}

/** Speak a final transcript — it auto-saves and auto-advances (no Confirm). */
async function speakAnswer(sp: ReturnType<typeof installFakeSpeech>, text: string) {
  await sp.result(text);
}

afterEach(() => {
  resetSpeechProvider();
  resetTutorVoiceProvider();
});

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
    installFakeVoice();
    installFakeSpeech();
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
});

// ── speaking interview (Sprint 2.0.1 / 2.0.1A — deterministic per-question flow) ─
describe("PlacementTestPage — speaking interview", () => {
  it("shows the readiness screen first and requires an explicit Start", async () => {
    installFakeVoice();
    installFakeSpeech();
    renderFlow();
    await fillWrittenAndContinue();
    expect(await screen.findByText(/Before we start/i)).toBeInTheDocument();
    // Readiness checks are listed; the question is NOT active yet.
    expect(screen.getByText(/Microphone permission/i)).toBeInTheDocument();
    expect(screen.getByText(/Speech recognition/i)).toBeInTheDocument();
    expect(screen.queryByText("What is your name?")).not.toBeInTheDocument();
    // Explicit Start advances into the interview (mic then opens automatically).
    await userEvent.click(await screen.findByRole("button", { name: /^Start interview/i }));
    expect(await screen.findByText("What is your name?")).toBeInTheDocument();
  });

  it("opens the mic automatically after the tutor speaks — no Record button (2.0.1B)", async () => {
    installFakeVoice();
    installFakeSpeech();
    renderFlow();
    await reachFirstQuestion();
    // No manual "Record answer"/"Confirm" buttons; the mic is already listening.
    expect(screen.queryByRole("button", { name: /Record answer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirm answer/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Stop recording/i })).toBeInTheDocument();
    expect(screen.getByText(/Question 1 of 2/i)).toBeInTheDocument();
  });

  it("auto-saves the final transcript and advances in order — no Confirm (source=voice)", async () => {
    let body: { source?: string; transcriptText?: string } = {};
    server.use(
      http.post("*/api/v1/placement/interview/answer/", async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ interviewId: "int1", attemptId: "att1", status: "running", currentQuestionIndex: 1, startedAt: "x", finishedAt: null, answers: [] });
      })
    );
    installFakeVoice();
    const sp = installFakeSpeech();
    renderFlow();
    await reachFirstQuestion();
    // Final transcript → auto-saves (no button) → advances to Q2.
    await speakAnswer(sp, "My name is Sam");
    await waitFor(() => expect(body.source).toBe("voice"));
    expect(body.transcriptText).toBe("My name is Sam");
    expect(await screen.findByText("How old are you?")).toBeInTheDocument();
    expect(screen.getByText(/Question 2 of 2/i)).toBeInTheDocument();
    // Never showed a Confirm button.
    expect(screen.queryByRole("button", { name: /Confirm answer/i })).not.toBeInTheDocument();
  });

  it("an empty transcript never advances — offers Record again (silence recovery)", async () => {
    installFakeVoice();
    const sp = installFakeSpeech();
    renderFlow();
    await reachFirstQuestion();
    await sp.result("   ");
    expect(await screen.findByText(/didn't catch that/i)).toBeInTheDocument();
    expect(screen.getByText("What is your name?")).toBeInTheDocument(); // still Q1
    // Recovery: re-record → auto-saves → advances.
    await userEvent.click(screen.getByRole("button", { name: /Try again/i }));
    await sp.result("My name is Sam");
    expect(await screen.findByText("How old are you?")).toBeInTheDocument();
  });

  it("falls back to manual typing when the mic is blocked (source=manual, auto-saves)", async () => {
    let body: { source?: string; transcriptText?: string } = {};
    server.use(
      http.post("*/api/v1/placement/interview/answer/", async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ interviewId: "int1", attemptId: "att1", status: "running", currentQuestionIndex: 1, startedAt: "x", finishedAt: null, answers: [] });
      })
    );
    installFakeVoice();
    const sp = installFakeSpeech();
    renderFlow();
    await reachFirstQuestion();
    await sp.fail("permission-denied");
    expect(await screen.findByText(/Microphone access is blocked/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Type instead/i }));
    await userEvent.type(screen.getByRole("textbox"), "Typed name");
    await userEvent.click(screen.getByRole("button", { name: /Use this answer/i }));
    // Auto-saves (no Confirm) with source=manual.
    await waitFor(() => expect(body.source).toBe("manual"));
    expect(body.transcriptText).toBe("Typed name");
  });

  it("resumes from the first unanswered question after a refresh (completed answers read-only)", async () => {
    server.use(
      http.get("*/api/v1/placement/interview/session/", () =>
        HttpResponse.json({
          interviewId: "int1", attemptId: "att1", status: "running", currentQuestionIndex: 1,
          startedAt: "x", finishedAt: null,
          answers: [{ questionId: "sq1", order: 1, transcriptText: "Saved first", source: "voice" }],
        })
      )
    );
    installFakeVoice();
    installFakeSpeech();
    renderFlow();
    // Resume still requires Start; then a "Welcome back" (no full greeting) → Q2.
    await startFromReadiness();
    expect(await screen.findByText("How old are you?")).toBeInTheDocument();
    expect(screen.getByText(/Question 2 of 2/i)).toBeInTheDocument();
    expect(screen.getByText("Saved first")).toBeInTheDocument(); // prior answer read-only
  });

  it("shows a read-only timeline; future questions are locked and not selectable", async () => {
    installFakeVoice();
    installFakeSpeech();
    renderFlow();
    await reachFirstQuestion();
    const timeline = screen.getByRole("list", { name: /interview progress/i });
    const items = within(timeline).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/Current/i);
    expect(items[1]).toHaveTextContent(/Locked/i);
    // Timeline items are not buttons/links — they cannot be clicked to skip.
    expect(within(timeline).queryByRole("button")).not.toBeInTheDocument();
    expect(within(timeline).queryByRole("link")).not.toBeInTheDocument();
  });

  it("a save failure keeps the transcript and offers a retry (answer not lost)", async () => {
    server.use(
      http.post("*/api/v1/placement/interview/answer/", () =>
        HttpResponse.json({ code: "server_error", detail: "boom" }, { status: 500 })
      )
    );
    installFakeVoice();
    const sp = installFakeSpeech();
    renderFlow();
    await reachFirstQuestion();
    // Final transcript auto-saves; the save fails → answer kept, retry offered, no advance.
    await sp.result("My name is Sam");
    expect(await screen.findByText(/transcript is safe/i)).toBeInTheDocument();
    expect(screen.getByText("My name is Sam")).toBeInTheDocument(); // retained
    expect(screen.getByRole("button", { name: /Retry save/i })).toBeInTheDocument();
    expect(screen.getByText("What is your name?")).toBeInTheDocument(); // did NOT advance
  });

  it("completes all questions and navigates to the result (fully hands-free)", async () => {
    installFakeVoice();
    const sp = installFakeSpeech();
    renderFlow();
    await reachFirstQuestion();
    await speakAnswer(sp, "My name is Sam");
    await screen.findByText("How old are you?");
    await speakAnswer(sp, "I am twenty");
    expect(await screen.findByText(/Speaking interview complete/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /See my result/i }));
    expect(await screen.findByText(/Your placement result/i)).toBeInTheDocument();
  });

  it("never exposes the interviewer's system prompt", async () => {
    installFakeVoice();
    installFakeSpeech();
    renderFlow();
    await reachFirstQuestion();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/you are an english placement interviewer/i);
    expect(text).not.toMatch(/system_message|prompt_id/i);
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
