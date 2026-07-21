import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse, passthrough } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthProvider";
import { tokenStore } from "@/api";
import { server } from "./server";
import { AITutorPage } from "@/pages/student/AITutorPage";

const B = "*/api/v1";

const me = () =>
  http.get(`${B}/me/`, () =>
    HttpResponse.json({ id: "s1", fullName: "Sara", email: "s@oneclub.dev", role: "student", status: "active" })
  );
const noise = () => [http.get(`${B}/notifications/`, () => HttpResponse.json([])), http.all("*", () => passthrough())];

function renderPage() {
  tokenStore.set({ access: "a", refresh: "r" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <AITutorPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AI Tutor", () => {
  beforeEach(() => tokenStore.set({ access: "a", refresh: "r" }));

  it("shows the subscribe gate with AI-tutor plans when not subscribed", async () => {
    server.use(
      me(),
      http.get(`${B}/student/ai-tutor/status/`, () =>
        HttpResponse.json({ subscribed: false, subscription: null, sessionMinutes: 5, activeSession: null })
      ),
      http.get(`${B}/billing/plans/`, () =>
        HttpResponse.json([
          { id: "ai1", code: "ai-tutor-month", kind: "ai_tutor", name: "AI Tutor · Monthly", emoji: "✨", price: 60000, currency: "SDG", cadence: "/ month", description: "", sessionsPerMonth: 0, features: [], recommended: true },
        ])
      ),
      ...noise()
    );
    renderPage();
    await waitFor(() => expect(screen.getByText(/Subscribe to unlock/i)).toBeInTheDocument());
    expect(await screen.findByText("AI Tutor · Monthly")).toBeInTheDocument();
    expect(screen.getByText("60,000")).toBeInTheDocument();
  });

  it("starts a 5-minute practice and shows the tutor's opening message", async () => {
    const future = new Date(Date.now() + 300_000).toISOString();
    server.use(
      me(),
      http.get(`${B}/student/ai-tutor/status/`, () =>
        HttpResponse.json({ subscribed: true, subscription: { expiresAt: future }, sessionMinutes: 5, activeSession: null })
      ),
      http.post(`${B}/student/ai-tutor/start/`, () =>
        HttpResponse.json(
          {
            sessionId: "sess1",
            topic: "Travel",
            status: "active",
            startedAt: new Date().toISOString(),
            expiresAt: future,
            remainingSeconds: 300,
            messages: [{ role: "tutor", text: "Hi! Let's talk about travel. Where would you love to go?", at: "" }],
          },
          { status: 201 }
        )
      ),
      ...noise()
    );
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: /Start practice/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /Start practice/i }));
    // The tutor's line appears in the voice-stage caption (and the transcript).
    await waitFor(() => expect(screen.getAllByText(/Where would you love to go/i).length).toBeGreaterThan(0));
    // A typed-reply fallback is available (jsdom has no speech recognition).
    expect(screen.getByPlaceholderText(/Type your reply/i)).toBeInTheDocument();
  });
});
