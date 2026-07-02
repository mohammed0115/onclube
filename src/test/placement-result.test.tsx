import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthProvider";
import { tokenStore } from "@/api";
import { server } from "./server";
import { PlacementResultPage } from "@/pages/onboarding/PlacementResultPage";

const RESULT = {
  cefrLevel: "B1",
  overallConversationScore: 64,
  grammarScore: 70,
  vocabularyScore: 66,
  fluencyScore: 61,
  confidenceScore: 58,
  writtenScore: 68,
  spokenScore: 62,
  spokenCapped: false,
  spokenCeiling: "C1",
  strengths: ["grammar"],
  weaknesses: ["confidence"],
  recommendedFocus: ["Practise speaking aloud every day"],
  recommendedConversationTopics: ["everyday_essentials", "job_interviews"],
  recommendedInstructorDifficulty: "balanced",
  fallbackUsed: true,
  providerName: "heuristic",
};

function resultHandler(over: Record<string, unknown> = {}, status = 200) {
  return http.get("*/api/v1/placement/result/", () =>
    status === 200 ? HttpResponse.json({ ...RESULT, ...over }) : HttpResponse.json(over, { status })
  );
}

function renderResult(route = "/onboarding/placement-result") {
  tokenStore.set({ access: "access-1", refresh: "refresh-1" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <Routes>
            <Route path="/onboarding/placement-result" element={<PlacementResultPage />} />
            <Route path="/billing/pricing" element={<div>PRICING PAGE STUB</div>} />
            <Route path="/onboarding/placement-test" element={<div>PLACEMENT TEST STUB</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PlacementResultPage", () => {
  // 1. success
  it("renders the result: level, skills, strengths, weaknesses, recommendations, difficulty", async () => {
    renderResult();
    expect(await screen.findByText(/Your placement result/i)).toBeInTheDocument();
    expect(screen.getAllByText("B1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Intermediate").length).toBeGreaterThan(0);
    for (const skill of ["Grammar", "Vocabulary", "Fluency", "Confidence", "Written", "Spoken"]) {
      expect(screen.getByText(skill)).toBeInTheDocument();
    }
    expect(screen.getByText(/Your strongest skills/i)).toBeInTheDocument();
    expect(screen.getByText(/Areas needing improvement/i)).toBeInTheDocument();
    expect(screen.getByText(/Recommended learning focus/i)).toBeInTheDocument();
    expect(screen.getAllByText(/balanced/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Continue to plans/i })).toBeInTheDocument();
  });

  // 2. loading (skeleton)
  it("shows a skeleton while loading", () => {
    renderResult();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-label", "Loading your result");
  });

  // 3. error state
  it("shows an error state on server error", async () => {
    server.use(resultHandler({ code: "error", detail: "Server error." }, 500));
    renderResult();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
  });

  // 4. retry flow
  it("retries and renders the result after a failure", async () => {
    let failed = false;
    server.use(
      http.get("*/api/v1/placement/result/", () => {
        if (!failed) {
          failed = true;
          return HttpResponse.json({ code: "error", detail: "boom" }, { status: 500 });
        }
        return HttpResponse.json(RESULT);
      })
    );
    renderResult();
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(await screen.findByText(/Your placement result/i)).toBeInTheDocument();
  });

  // 5. empty strengths
  it("handles empty strengths", async () => {
    server.use(resultHandler({ strengths: [] }));
    renderResult();
    expect(await screen.findByText(/Keep practising to build clear strengths/i)).toBeInTheDocument();
  });

  // 6. empty weaknesses
  it("handles empty weaknesses", async () => {
    server.use(resultHandler({ weaknesses: [] }));
    renderResult();
    expect(await screen.findByText(/No major gaps/i)).toBeInTheDocument();
  });

  // 7. empty recommendations
  it("handles empty recommendations", async () => {
    server.use(resultHandler({ recommendedFocus: [], recommendedConversationTopics: [] }));
    renderResult();
    expect(await screen.findByText(/tailor recommendations as you practise/i)).toBeInTheDocument();
  });

  // 8. missing assessment → empty state
  it("shows an empty state when no result exists yet", async () => {
    server.use(resultHandler({ code: "placement_result_not_found", detail: "none" }, 404));
    renderResult();
    expect(await screen.findByText(/No placement result yet/i)).toBeInTheDocument();
  });

  // 9. accessibility (roles + labelled progress bars + heading)
  it("is accessible: labelled progress bars and a page heading", async () => {
    renderResult();
    await screen.findByText(/Your placement result/i);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(6);
    for (const bar of bars) {
      expect(bar).toHaveAttribute("aria-valuenow");
      expect(bar).toHaveAttribute("aria-label");
    }
  });

  // 10. no prompt / provider / raw AI leakage
  it("never leaks provider name, prompt, or raw AI internals", async () => {
    renderResult();
    await screen.findByText(/Your placement result/i);
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const banned of ["heuristic", "openai", "provider", "prompt", "fallback", "raw", "system message"]) {
      expect(text).not.toContain(banned);
    }
  });

  // 11. continue button navigation → subscription journey
  it("continues to the subscription journey", async () => {
    renderResult();
    await screen.findByText(/Your placement result/i);
    await userEvent.click(screen.getByRole("button", { name: /Continue to plans/i }));
    expect(await screen.findByText("PRICING PAGE STUB")).toBeInTheDocument();
  });

  // 12. DTO-only rendering (no frontend calculation)
  it("renders DTO scores verbatim (no frontend calculation)", async () => {
    server.use(resultHandler({ grammarScore: 41, overallConversationScore: 37, confidenceScore: 12 }));
    renderResult();
    await screen.findByText(/Your placement result/i);
    // Exact DTO values are shown — not a recomputed average.
    expect(screen.getByText("41")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText(/37\/100/)).toBeInTheDocument();
  });

  it("never renders a pronunciation field", async () => {
    renderResult();
    await screen.findByText(/Your placement result/i);
    expect((document.body.textContent ?? "").toLowerCase()).not.toContain("pronunciation");
  });
});
