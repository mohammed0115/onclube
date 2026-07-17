import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthProvider";
import { tokenStore } from "@/api";
import { server } from "./server";
import { AvailabilityPage } from "@/pages/instructor/AvailabilityPage";

const B = "*/api/v1";

function renderPage() {
  tokenStore.set({ access: "a", refresh: "r" });
  server.use(
    http.get(`${B}/me/`, () =>
      HttpResponse.json({ id: "u1", fullName: "Nora Teacher", email: "teacher@oneclub.dev", role: "instructor", status: "active" })
    )
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <AvailabilityPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Instructor availability (real API)", () => {
  beforeEach(() => tokenStore.set({ access: "a", refresh: "r" }));

  it("loads the calendar and saves toggled slots to the API", async () => {
    let sent: { slots: { startAt: string }[] } = { slots: [] };
    server.use(
      http.put(`${B}/instructor/availability/set/`, async ({ request }) => {
        sent = (await request.json()) as typeof sent;
        return HttpResponse.json([]);
      })
    );
    renderPage();
    // The time column renders hourly slots once loaded.
    expect(await screen.findByText("09:00")).toBeInTheDocument();

    // Jump to next month so every hour is in the future (past slots are disabled
    // by design — clicking one would be a no-op, which is time-of-day dependent).
    await userEvent.click(screen.getByRole("button", { name: /Next month/i }));

    // Toggle the first (now enabled) switch on, then Save.
    const switches = screen.getAllByRole("switch");
    await userEvent.click(switches[0]);
    await userEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() => expect(sent.slots.length).toBeGreaterThan(0));
    expect(await screen.findByText(/Availability published/i)).toBeInTheDocument();
  });

  it("adds a vacation time-off entry", async () => {
    let sent: { kind?: string; note?: string } = {};
    server.use(
      http.post(`${B}/instructor/availability/exceptions/`, async ({ request }) => {
        sent = (await request.json()) as typeof sent;
        return HttpResponse.json({ id: "e1", kind: sent.kind, startAt: "2026-08-01T00:00:00Z", endAt: "2026-08-05T00:00:00Z", note: sent.note ?? "" }, { status: 201 });
      })
    );
    renderPage();
    await screen.findByText("Time off");
    fireEvent.change(screen.getByLabelText(/Starts/i), { target: { value: "2026-08-01T09:00" } });
    fireEvent.change(screen.getByLabelText(/Ends/i), { target: { value: "2026-08-05T17:00" } });
    await userEvent.click(screen.getByRole("button", { name: /Add time off/i }));
    await waitFor(() => expect(sent.kind).toBe("vacation"));
  });
});
