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

  it("loads the weekly grid and saves recurring windows to the API", async () => {
    let sent: { windows: { weekday: number; startTime: string; endTime: string }[] } = { windows: [] };
    server.use(
      http.get(`${B}/instructor/recurring-availability/`, () => HttpResponse.json([])),
      http.put(`${B}/instructor/recurring-availability/`, async ({ request }) => {
        sent = (await request.json()) as typeof sent;
        return HttpResponse.json(sent.windows);
      })
    );
    const { container } = renderPage();

    // The weekly grid renders addable cells once loaded.
    await waitFor(
      () => expect(container.querySelectorAll('button[title="Tap to add"]').length).toBeGreaterThan(0),
      { timeout: 4000 }
    );
    const addable = container.querySelectorAll<HTMLButtonElement>('button[title="Tap to add"]');
    await userEvent.click(addable[0]);
    await userEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() => expect(sent.windows.length).toBeGreaterThan(0));
    expect(sent.windows[0]).toHaveProperty("weekday");
    expect(sent.windows[0]).toHaveProperty("startTime");
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
