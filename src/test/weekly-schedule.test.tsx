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

describe("Student weekly schedule", () => {
  beforeEach(() => tokenStore.set({ access: "a", refresh: "r" }));

  it("lets the student pick a recurring time and saves it, generating bookings", async () => {
    let sent: { picks: { weekday: number; startTime: string; topicId: string }[] } = { picks: [] };
    // Handler order matters: the http.all("*") passthrough MUST come last so it
    // never shadows the specific GET/PUT handlers for the same paths.
    server.use(
      http.get(`${B}/me/`, () =>
        HttpResponse.json({ id: "s1", fullName: "Sara Student", email: "s@oneclub.dev", role: "student", status: "active" })
      ),
      http.get(`${B}/student/subscription/`, () =>
        HttpResponse.json({ id: "sub1", planId: "p1", planName: "Regular", status: "active", startedAt: null, expiresAt: null, sessionsRemaining: 6 })
      ),
      http.get(`${B}/student/topics/`, () =>
        HttpResponse.json([
          { id: "t1", title: "Money", category: "Daily", level: "B1", description: null, instructorId: "i1", instructorName: "Nora", instructorHeadline: null, samplePrompts: [], subtopics: [], mode: "preview" },
        ])
      ),
      // Instructor available Monday..Sunday 08:00–20:00 (weekday 0..6).
      http.get(`${B}/student/schedule/windows/`, () =>
        HttpResponse.json({
          instructorId: "i1",
          instructorName: "Nora",
          windows: Array.from({ length: 7 }, (_, wd) => ({ weekday: wd, startTime: "08:00", endTime: "20:00" })),
        })
      ),
      http.put(`${B}/student/schedule/`, async ({ request }) => {
        sent = (await request.json()) as typeof sent;
        return HttpResponse.json({
          schedule: sent.picks.map((p, i) => ({
            id: `pick${i}`, weekday: p.weekday, startTime: p.startTime, durationMinutes: 45,
            topicId: p.topicId, topicTitle: "Money", instructorId: "i1", instructorName: "Nora",
          })),
          generated: { created: 2, skipped: 0, outOfCredits: false, bookings: [] },
        });
      }),
      http.get(`${B}/student/schedule/`, () => HttpResponse.json({ schedule: [], upcoming: [] })),
      http.get(`${B}/notifications/`, () => HttpResponse.json([])),
      http.all("*", () => passthrough())
    );

    const { container } = renderPage();

    // Wait for the instructor's available hours to load → addable cells appear.
    await waitFor(
      () => expect(container.querySelectorAll('button[title="Tap to add"]').length).toBeGreaterThan(0),
      { timeout: 4000 }
    );

    // Pick the first addable ("+") cell, then save.
    const addable = container.querySelectorAll<HTMLButtonElement>('button[title="Tap to add"]');
    await userEvent.click(addable[0]);
    await userEvent.click(screen.getByRole("button", { name: /Save schedule/i }));

    await waitFor(() => expect(sent.picks.length).toBe(1));
    expect(sent.picks[0].topicId).toBe("t1");
    expect(sent.picks[0].startTime).toMatch(/^\d{2}:00$/);
    expect(await screen.findByText(/upcoming session\(s\) booked/i)).toBeInTheDocument();
  });
});
