import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse, passthrough } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthProvider";
import { tokenStore } from "@/api";
import { server } from "./server";
import { WeeklySchedulePage } from "@/pages/student/WeeklySchedulePage";

const B = "*/api/v1";

function renderPage() {
  tokenStore.set({ access: "a", refresh: "r" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <WeeklySchedulePage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Student weekly availability", () => {
  beforeEach(() => tokenStore.set({ access: "a", refresh: "r" }));

  it("lets the student pick available times (no topic) and sends them for review", async () => {
    let sent: { picks: { weekday: number; startTime: string }[] } = { picks: [] };
    server.use(
      http.get(`${B}/me/`, () =>
        HttpResponse.json({ id: "s1", fullName: "Sara Student", email: "s@oneclub.dev", role: "student", status: "active" })
      ),
      http.get(`${B}/student/subscription/`, () =>
        HttpResponse.json({ id: "sub1", planId: "p1", planName: "Regular", status: "active", startedAt: null, expiresAt: null, sessionsRemaining: 6 })
      ),
      http.put(`${B}/student/schedule/`, async ({ request }) => {
        sent = (await request.json()) as typeof sent;
        return HttpResponse.json({
          schedule: sent.picks.map((p, i) => ({
            id: `pick${i}`, weekday: p.weekday, startTime: p.startTime, durationMinutes: 45,
            topicId: null, topicTitle: null, instructorId: "i1", instructorName: "Nora",
            reviewStatus: "pending", reviewNote: "", reviewedAt: null,
          })),
          generated: { created: 0, skipped: 0, outOfCredits: false, bookings: [] },
          pendingReview: 1,
        });
      }),
      http.get(`${B}/student/schedule/`, () => HttpResponse.json({ schedule: [], upcoming: [] })),
      http.get(`${B}/notifications/`, () => HttpResponse.json([])),
      http.all("*", () => passthrough())
    );

    const { container } = renderPage();

    // Every cell is selectable (no topic gating) — pick the first and save.
    await waitFor(
      () => expect(container.querySelectorAll('button[title="Tap to add"]').length).toBeGreaterThan(0),
      { timeout: 4000 }
    );
    const addable = container.querySelectorAll<HTMLButtonElement>('button[title="Tap to add"]');
    await userEvent.click(addable[0]);
    await userEvent.click(screen.getByRole("button", { name: /Save availability/i }));

    await waitFor(() => expect(sent.picks.length).toBe(1));
    expect(sent.picks[0]).not.toHaveProperty("topicId");
    expect(sent.picks[0].startTime).toMatch(/^\d{2}:00$/);
    expect(await screen.findByText(/sent to the team for review/i)).toBeInTheDocument();
  });
});
