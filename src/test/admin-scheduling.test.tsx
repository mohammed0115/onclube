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
      topicId: "t1", topicTitle: "Job Interview", instructorId: "i1", instructorName: "Sarah",
      reviewStatus: "pending", reviewNote: "", reviewedAt: null,
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

  it("lists pending schedules and approves a student", async () => {
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
    expect(screen.getByText("Job Interview")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Approve all/i }));
    await waitFor(() => expect(approvedStudentId).toBe("s1"));
  });
});
