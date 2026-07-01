import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthProvider";
import { RequireRole } from "@/auth/guards";
import { tokenStore } from "@/api";
import { server } from "./server";
import { renderPage } from "./utils";

import { PlacementTestPage } from "@/pages/onboarding/PlacementTestPage";
import { PlacementResultPage } from "@/pages/onboarding/PlacementResultPage";
import * as mockData from "@/data/mockData";

const W_PROMPT = "Describe your typical morning routine.";
const S_PROMPT = "Why are you learning English?";

/** Render the onboarding placement routes together so redirects resolve. */
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
  const written = await screen.findByLabelText(W_PROMPT);
  await userEvent.type(written, "I wake up early and make coffee.");
  await userEvent.click(screen.getByRole("button", { name: /Continue to spoken/i }));
}

async function fillSpoken() {
  const spoken = await screen.findByLabelText(`Voice answer transcript: ${S_PROMPT}`);
  await userEvent.type(spoken, "Because I want to travel and meet new people.");
}

describe("PlacementTestPage", () => {
  it("loads written and spoken questions from the API (no mock data)", async () => {
    renderFlow();
    expect(await screen.findByLabelText(W_PROMPT)).toBeInTheDocument();
    await fillWrittenAndContinue();
    expect(await screen.findByLabelText(`Voice answer transcript: ${S_PROMPT}`)).toBeInTheDocument();
    // The spoken section is clearly labelled as a transcript.
    expect(screen.getAllByText(/Voice answer transcript/i).length).toBeGreaterThan(0);
  });

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
    expect(body.answers?.[0].answerText).toContain("coffee");
    expect(body.attemptId).toBe("att1");
  });

  it("submits spoken transcripts to the API", async () => {
    let body: { transcripts?: { questionId: string; transcriptText: string }[] } = {};
    server.use(
      http.post("*/api/v1/placement/spoken-transcripts/", async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ id: "att1", status: "in_progress", version: 1, goalId: null, startedAt: "x", submittedAt: null, assessedAt: null, fallbackUsed: false, providerName: null });
      })
    );
    renderFlow();
    await fillWrittenAndContinue();
    await fillSpoken();
    await userEvent.click(screen.getByRole("button", { name: /Submit & see result/i }));
    await waitFor(() => expect(body.transcripts?.[0]).toMatchObject({ questionId: "sq1" }));
    expect(body.transcripts?.[0].transcriptText).toContain("travel");
  });

  it("renders the one-shot spoken error", async () => {
    server.use(
      http.post("*/api/v1/placement/spoken-transcripts/", () =>
        HttpResponse.json({ code: "spoken_attempt_used", detail: "used" }, { status: 409 })
      )
    );
    renderFlow();
    await fillWrittenAndContinue();
    await fillSpoken();
    await userEvent.click(screen.getByRole("button", { name: /Submit & see result/i }));
    expect(await screen.findByText(/already used your one spoken attempt/i)).toBeInTheDocument();
  });

  it("renders the placement_incomplete error on submit", async () => {
    server.use(
      http.post("*/api/v1/placement/submit/", () =>
        HttpResponse.json({ code: "placement_incomplete", detail: "incomplete" }, { status: 409 })
      )
    );
    renderFlow();
    await fillWrittenAndContinue();
    await fillSpoken();
    await userEvent.click(screen.getByRole("button", { name: /Submit & see result/i }));
    expect(await screen.findByText(/answer every question in both sections/i)).toBeInTheDocument();
  });

  it("validates empty answers before calling the API", async () => {
    renderFlow();
    await screen.findByLabelText(W_PROMPT);
    await userEvent.click(screen.getByRole("button", { name: /Continue to spoken/i }));
    expect(await screen.findByText(/answer every written question/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(`Voice answer transcript: ${S_PROMPT}`)).not.toBeInTheDocument();
  });

  it("redirects to the result page on a successful submit", async () => {
    renderFlow();
    await fillWrittenAndContinue();
    await fillSpoken();
    await userEvent.click(screen.getByRole("button", { name: /Submit & see result/i }));
    expect(await screen.findByText(/Your estimated level/i)).toBeInTheDocument();
    expect(screen.getByText("B1")).toBeInTheDocument();
  });

  it("never renders an answer key (no correctAnswer / correctIndex)", async () => {
    renderFlow();
    await screen.findByLabelText(W_PROMPT);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/correctIndex/i);
    expect(text).not.toMatch(/correctAnswer/i);
  });
});

describe("PlacementResultPage", () => {
  it("renders the real API result with every score dimension", async () => {
    renderPage(<PlacementResultPage />);
    expect(await screen.findByText(/Your estimated level/i)).toBeInTheDocument();
    expect(screen.getByText("B1")).toBeInTheDocument();
    expect(screen.getByText("Grammar")).toBeInTheDocument();
    expect(screen.getByText("Confidence")).toBeInTheDocument();
    expect(screen.getByText("Spoken")).toBeInTheDocument();
    expect(screen.getByText(/balanced/i)).toBeInTheDocument();
    expect(screen.getByText(/heuristic/i)).toBeInTheDocument();
  });

  it("never renders a pronunciation field", async () => {
    renderPage(<PlacementResultPage />);
    await screen.findByText(/Your estimated level/i);
    expect(document.body.textContent ?? "").not.toMatch(/pronunciation/i);
  });

  it("shows an empty state when no result exists yet", async () => {
    server.use(
      http.get("*/api/v1/placement/result/", () =>
        HttpResponse.json({ code: "placement_result_not_found", detail: "none" }, { status: 404 })
      )
    );
    renderPage(<PlacementResultPage />);
    expect(await screen.findByText(/No placement result yet/i)).toBeInTheDocument();
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
    expect(screen.queryByLabelText(W_PROMPT)).not.toBeInTheDocument();
  });
});
