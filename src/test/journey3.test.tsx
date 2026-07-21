import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthProvider";
import { tokenStore } from "@/api";
import { server, state } from "./server";
import { renderPage } from "./utils";

import { PaymentUnderReviewPage } from "@/pages/billing/PaymentUnderReviewPage";
import { PaymentApprovalPage } from "@/pages/admin/PaymentApprovalPage";
import { BankTransferPage } from "@/pages/billing/BankTransferPage";
import { SELECTED_PLAN_KEY } from "@/pages/billing/PricingPage";

const B = "*/api/v1";

function proofResponse(over: Record<string, unknown> = {}) {
  return {
    id: "pp1", planName: "Regular", amount: 220, currency: "SDG",
    transactionNumber: "TRX-1", transferDatetime: "2026-06-25T10:00:00Z",
    receiptName: "receipt.jpg", status: "pending_review", submittedAt: "2026-06-25T10:01:00Z",
    retainUntil: null, senderName: null, receiverName: null, reviewedAt: null, reviewNote: null,
    receiptUrl: "https://files.local/receipts/pp1.jpg", studentId: null, studentName: null, ...over,
  };
}

function renderReview() {
  tokenStore.set({ access: "access-1", refresh: "refresh-1" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/billing/under-review"]}>
        <AuthProvider>
          <Routes>
            <Route path="/billing/under-review" element={<PaymentUnderReviewPage />} />
            <Route path="/billing/pricing" element={<div>PRICING STUB</div>} />
            <Route path="/student/schedule" element={<div>SCHEDULE STUB</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ── student: under-review states ──────────────────────────────────────────────
describe("PaymentUnderReviewPage", () => {
  it("shows the pending state while awaiting review", async () => {
    renderReview();
    expect(await screen.findByText(/Payment under review/i)).toBeInTheDocument();
  });

  it("shows approved and continues to booking", async () => {
    state.approved = true; // subscription becomes active
    renderReview();
    expect(await screen.findByText(/You’re approved/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: /Set your availability/i }));
    expect(await screen.findByText("SCHEDULE STUB")).toBeInTheDocument();
  });

  it("shows the rejected state with the review note and a re-submit action", async () => {
    server.use(
      http.get(`${B}/billing/payment-proof/latest/`, () =>
        HttpResponse.json(proofResponse({ status: "rejected", reviewNote: "Amount does not match the plan." }))
      )
    );
    renderReview();
    expect(await screen.findByText(/Payment not approved/i)).toBeInTheDocument();
    expect(screen.getByText(/Amount does not match the plan/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Re-submit payment proof/i }));
    expect(await screen.findByText("PRICING STUB")).toBeInTheDocument();
  });

  it("shows the needs-more-info state with the review note", async () => {
    server.use(
      http.get(`${B}/billing/payment-proof/latest/`, () =>
        HttpResponse.json(proofResponse({ status: "needs_info", reviewNote: "Please add the sender name." }))
      )
    );
    renderReview();
    expect(await screen.findByText(/More information needed/i)).toBeInTheDocument();
    expect(screen.getByText(/Please add the sender name/i)).toBeInTheDocument();
  });

  it("shows an error state with retry when the status fails to load", async () => {
    server.use(
      http.get(`${B}/billing/payment-proof/latest/`, () =>
        HttpResponse.json({ code: "error", detail: "boom" }, { status: 500 })
      ),
      http.get(`${B}/student/subscription/`, () =>
        HttpResponse.json({ code: "error", detail: "boom" }, { status: 500 })
      )
    );
    renderReview();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
  });
});

// ── admin: proof detail + actions ─────────────────────────────────────────────
describe("PaymentApprovalPage", () => {
  it("shows the proof detail: transaction ref, sender, and receipt link", async () => {
    renderPage(<PaymentApprovalPage />);
    expect(await screen.findByText("TRX-1")).toBeInTheDocument();
    expect(screen.getAllByText("Test Student").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /View receipt/i })).toHaveAttribute(
      "href",
      "https://files.local/receipts/pp1.jpg"
    );
  });

  it("requires a note before requesting more information", async () => {
    renderPage(<PaymentApprovalPage />);
    await screen.findByText("TRX-1");
    const requestBtn = screen.getByRole("button", { name: /Request info/i });
    expect(requestBtn).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Note to the student/i), "Receipt is blurry.");
    expect(requestBtn).not.toBeDisabled();
  });

  it("sends the note when requesting more information", async () => {
    let body: { note?: string } = {};
    server.use(
      http.post(`${B}/admin/payment-proofs/:id/request-info/`, async ({ request, params }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ proofId: params.id, status: "needs_info", reviewedById: "adm1" });
      })
    );
    renderPage(<PaymentApprovalPage />);
    await screen.findByText("TRX-1");
    await userEvent.type(screen.getByLabelText(/Note to the student/i), "Please re-upload.");
    await userEvent.click(screen.getByRole("button", { name: /Request info/i }));
    await waitFor(() => expect(body.note).toBe("Please re-upload."));
  });

  it("sends the note when rejecting", async () => {
    let body: { note?: string } = {};
    server.use(
      http.post(`${B}/admin/payment-proofs/:id/reject/`, async ({ request, params }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ proofId: params.id, status: "rejected", reviewedById: "adm1" });
      })
    );
    renderPage(<PaymentApprovalPage />);
    await screen.findByText("TRX-1");
    await userEvent.type(screen.getByLabelText(/Note to the student/i), "Wrong amount.");
    await userEvent.click(screen.getByRole("button", { name: /^Reject$/i }));
    await waitFor(() => expect(body.note).toBe("Wrong amount."));
  });
});

// ── student: bank transfer uses the real selected plan (no mock) ──────────────
describe("BankTransferPage", () => {
  it("renders the selected plan from the API (no mock data)", async () => {
    sessionStorage.setItem(SELECTED_PLAN_KEY, "p1");
    renderPage(<BankTransferPage />);
    expect(await screen.findByText(/Regular plan/i)).toBeInTheDocument();
    expect(screen.getByText(/8 live sessions/i)).toBeInTheDocument();
  });
});
