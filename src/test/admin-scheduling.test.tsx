import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse, passthrough } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthProvider";
import { tokenStore } from "@/api";
import { server } from "./server";
import { AdminSchedulingRequestsPage } from "@/pages/admin/AdminSchedulingRequestsPage";

const B = "*/api/v1";

const GROUP = {
  studentId: "s1",
  studentName: "Sami Student",
  studentEmail: "sami@x.dev",
  picks: [
    {
      id: "slot1", weekday: 1, startTime: "12:00", durationMinutes: 45,
      topicId: null, topicTitle: null, instructorId: "i1", instructorName: "Sarah",
      reviewStatus: "pending", reviewNote: "", reviewedAt: null,
      instructorCandidates: [
        { id: "i1", name: "Sarah" },
        { id: "i2", name: "Omar" },
      ],
    },
  ],
};

function renderPage() {
  tokenStore.set({ access: "a", refresh: "r" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <AdminSchedulingRequestsPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Admin scheduling requests", () => {
  beforeEach(() => tokenStore.set({ access: "a", refresh: "r" }));

  it("lists pending availability and approves a student", async () => {
    let approvedStudentId: string | null = null;
    server.use(
      http.get(`${B}/me/`, () => HttpResponse.json({ id: "a1", fullName: "Admin", email: "a@x.dev", role: "admin", status: "active" })),
      http.get(`${B}/admin/schedule-requests/`, () => HttpResponse.json([GROUP])),
      http.post(`${B}/admin/schedule-requests/approve/`, async ({ request }) => {
        approvedStudentId = ((await request.json()) as { studentId: string }).studentId;
        return HttpResponse.json({ approved: 1, generated: { created: 2, skipped: 0, outOfCredits: false, bookings: [] } });
      }),
      http.get(`${B}/notifications/`, () => HttpResponse.json([])),
      http.all("*", () => passthrough())
    );

    renderPage();
    expect(await screen.findByText("Sami Student")).toBeInTheDocument();
    // Instructor candidate picker is populated.
    await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Approve all/i }));
    await waitFor(() => expect(approvedStudentId).toBe("s1"));
  });

  it("assigns a different instructor to a pick", async () => {
    let assignBody: { slotId: string; instructorId: string } | null = null;
    server.use(
      http.get(`${B}/me/`, () => HttpResponse.json({ id: "a1", fullName: "Admin", email: "a@x.dev", role: "admin", status: "active" })),
      http.get(`${B}/admin/schedule-requests/`, () => HttpResponse.json([GROUP])),
      http.post(`${B}/admin/schedule-requests/assign/`, async ({ request }) => {
        assignBody = (await request.json()) as { slotId: string; instructorId: string };
        return HttpResponse.json({ ...GROUP.picks[0], instructorId: "i2", instructorName: "Omar" });
      }),
      http.get(`${B}/notifications/`, () => HttpResponse.json([])),
      http.all("*", () => passthrough())
    );

    renderPage();
    await screen.findByText("Sami Student");
    const select = await screen.findByRole("combobox");
    await userEvent.selectOptions(select, "i2");
    await userEvent.click(screen.getByRole("button", { name: /^Assign$/i }));
    await waitFor(() => expect(assignBody).toEqual({ slotId: "slot1", instructorId: "i2" }));
  });
});
