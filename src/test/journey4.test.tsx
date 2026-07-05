import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthProvider";
import { tokenStore } from "@/api";
import { server } from "./server";

import { BookingCalendarPage } from "@/pages/student/BookingCalendarPage";
import { BookingSummaryPage } from "@/pages/student/BookingSummaryPage";
import { BookingSuccessPage } from "@/pages/student/BookingSuccessPage";

const B = "*/api/v1";

function renderBooking(route = "/student/book/t1") {
  tokenStore.set({ access: "access-1", refresh: "refresh-1" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <Routes>
            <Route path="/student/book/:topicId" element={<BookingCalendarPage />} />
            <Route path="/student/book/:topicId/confirm/:slotId" element={<BookingSummaryPage />} />
            <Route path="/student/book/success/:bookingId" element={<BookingSuccessPage />} />
            <Route path="/student/questions/:id" element={<div>QUESTIONS STUB</div>} />
            <Route path="/student" element={<div>DASHBOARD STUB</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Booking — weekly calendar", () => {
  it("renders the weekly calendar; only available slots are selectable", async () => {
    renderBooking();
    expect(await screen.findByText(/Choose a time/i)).toBeInTheDocument();
    // 7 weekday columns (Mon–Sun).
    expect(screen.getAllByText(/^(mon|tue|wed|thu|fri|sat|sun)$/i)).toHaveLength(7);
    // The available slot is a button; the booked slot is not.
    expect(screen.getByRole("button", { name: /Book tuesday/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Book wednesday/i })).not.toBeInTheDocument();
  });

  it("shows a loading state", () => {
    renderBooking();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error state with retry when the calendar fails", async () => {
    server.use(
      http.get(`${B}/student/calendar/`, () =>
        HttpResponse.json({ code: "error", detail: "boom" }, { status: 500 })
      )
    );
    renderBooking();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
  });

  it("walks calendar → summary → confirm → success with questions unlocked", async () => {
    renderBooking();
    await userEvent.click(await screen.findByRole("button", { name: /Book tuesday/i }));

    // Summary / review step.
    expect(await screen.findByText(/Review your booking/i)).toBeInTheDocument();
    expect(screen.getByText("Job Interview Practice")).toBeInTheDocument();
    expect(screen.getByText(/1 session credit/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Confirm booking/i }));

    // Success step: questions unlocked.
    expect(await screen.findByText(/Booking confirmed/i)).toBeInTheDocument();
    expect(screen.getByText(/questions are unlocked/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /View your questions/i });
    expect(link).toHaveAttribute("href", "/student/questions/t1");
  });

  it("surfaces a slot-unavailable error at confirmation", async () => {
    server.use(
      http.post(`${B}/student/bookings/`, () =>
        HttpResponse.json({ code: "slot_unavailable", detail: "taken" }, { status: 409 })
      )
    );
    renderBooking("/student/book/t1/confirm/slot1?at=2026-06-30T18:00:00Z");
    await userEvent.click(await screen.findByRole("button", { name: /Confirm booking/i }));
    expect(await screen.findByText(/just taken/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to calendar/i })).toBeInTheDocument();
  });
});
