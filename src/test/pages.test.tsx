import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "./server";
import { renderPage } from "./utils";

import { PaymentApprovalPage as AdminPaymentApprovalPage } from "@/pages/admin/PaymentApprovalPage";
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { RequireRole } from "@/auth/guards";

// NOTE: chart-heavy pages (AIReport / StudentDashboard use recharts) are exercised
// at the data layer in integration.test.ts / hooks.test.tsx — recharts + jsdom is
// a known testing-env friction, so we keep DOM page tests recharts-free here.

const ACTIVE_SUB = {
  id: "sub1", planId: "p1", planName: "Regular", status: "active",
  startedAt: "x", expiresAt: "y", sessionsRemaining: 8,
};

/** Sign the layout in as a distinct admin so its profile name doesn't collide. */
function asAdmin() {
  server.use(
    http.get("*/api/v1/me/", () =>
      HttpResponse.json({ id: "a1", fullName: "Ops Admin", email: "a@e.com", role: "admin", status: "active", level: null, goalId: null, paymentStatus: null, sessionsRemaining: null, rating: null, headline: null })
    )
  );
}

describe("Admin payment approval", () => {
  it("renders the pending queue from the API", async () => {
    asAdmin();
    renderPage(<AdminPaymentApprovalPage />);
    await waitFor(() => expect(screen.getAllByText("Test Student").length).toBeGreaterThan(0));
    expect(screen.getByRole("button", { name: /Approve & activate/i })).toBeInTheDocument();
  });

  it("approve calls the approval endpoint", async () => {
    asAdmin();
    let approved = false;
    server.use(
      http.post("*/api/v1/admin/payment-proofs/:id/approve/", ({ params }) => {
        approved = true;
        return HttpResponse.json({ proofId: params.id, subscriptionId: "s", subscriptionStatus: "active", sessionsRemaining: 8, startedAt: "x", expiresAt: "y" });
      })
    );
    renderPage(<AdminPaymentApprovalPage />);
    await waitFor(() => screen.getByRole("button", { name: /Approve & activate/i }));
    await userEvent.click(screen.getByRole("button", { name: /Approve & activate/i }));
    await waitFor(() => expect(approved).toBe(true));
  });

  it("renders an error state with retry when the queue fails", async () => {
    asAdmin();
    server.use(http.get("*/api/v1/admin/payment-proofs/", () => HttpResponse.json({ code: "error", detail: "boom" }, { status: 500 })));
    renderPage(<AdminPaymentApprovalPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument());
  });
});

describe("Admin dashboard", () => {
  it("renders real stats", async () => {
    asAdmin();
    renderPage(<AdminDashboardPage />);
    await waitFor(() => expect(screen.getByText(/Payments awaiting approval/i)).toBeInTheDocument());
    expect(screen.getByText(/220 SDG/)).toBeInTheDocument();
  });
});

describe("Role guard", () => {
  it("does not render an admin-only child for a student session", async () => {
    // /me returns a student; RequireRole admin must redirect (child hidden).
    renderPage(
      <RequireRole roles={["admin"]}>
        <div>secret admin area</div>
      </RequireRole>
    );
    await waitFor(() => expect(screen.queryByText("secret admin area")).not.toBeInTheDocument());
  });
});
