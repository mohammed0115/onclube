import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse, passthrough } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthProvider";
import { tokenStore } from "@/api";
import { server } from "./server";
import { ProgressPage } from "@/pages/student/ProgressPage";

const B = "*/api/v1";

const PROGRESS = {
  sessionsCount: 2,
  overall: {
    current: 75,
    previous: 70,
    delta: 5,
    series: [
      { label: "S1", score: 70, date: "2026-07-13T18:00:00Z", topic: "Money" },
      { label: "S2", score: 75, date: "2026-07-19T18:00:00Z", topic: "Travel" },
    ],
  },
  skills: [
    { label: "Grammar", color: "#7C3AED", current: 45, previous: 40, delta: 5, series: [{ label: "S1", value: 40 }, { label: "S2", value: 45 }] },
    { label: "Fluency", color: "#10B981", current: 71, previous: 72, delta: -1, series: [{ label: "S1", value: 72 }, { label: "S2", value: 71 }] },
  ],
  message: "You improved by 5 points since your last session. Keep it up! 🎉",
};

function renderPage() {
  tokenStore.set({ access: "a", refresh: "r" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <ProgressPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Student progress dashboard", () => {
  beforeEach(() => tokenStore.set({ access: "a", refresh: "r" }));

  it("shows the overall score, the session-over-session delta, and per-skill cards", async () => {
    server.use(
      http.get(`${B}/me/`, () =>
        HttpResponse.json({ id: "s1", fullName: "Sara", email: "s@oneclub.dev", role: "student", status: "active" })
      ),
      http.get(`${B}/student/progress/`, () => HttpResponse.json(PROGRESS)),
      http.get(`${B}/notifications/`, () => HttpResponse.json([])),
      http.all("*", () => passthrough())
    );

    renderPage();

    // Overall score + encouraging message.
    await waitFor(() => expect(screen.getByText("75")).toBeInTheDocument());
    expect(screen.getByText(/improved by 5 points/i)).toBeInTheDocument();

    // Per-skill cards render both tracked skills.
    expect(screen.getByText("Grammar")).toBeInTheDocument();
    expect(screen.getByText("Fluency")).toBeInTheDocument();
    // Grammar current value.
    expect(screen.getByText("45")).toBeInTheDocument();
  });

  it("shows an empty state when the student has no sessions yet", async () => {
    server.use(
      http.get(`${B}/me/`, () =>
        HttpResponse.json({ id: "s1", fullName: "Sara", email: "s@oneclub.dev", role: "student", status: "active" })
      ),
      http.get(`${B}/student/progress/`, () =>
        HttpResponse.json({ sessionsCount: 0, overall: { current: null, previous: null, delta: null, series: [] }, skills: [], message: "Complete your first session to start tracking your progress." })
      ),
      http.get(`${B}/notifications/`, () => HttpResponse.json([])),
      http.all("*", () => passthrough())
    );

    renderPage();
    await waitFor(() => expect(screen.getByText(/No sessions yet/i)).toBeInTheDocument());
  });
});
