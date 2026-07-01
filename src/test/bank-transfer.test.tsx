import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { server } from "./server";
import { renderPage } from "./utils";

import { BankTransferPage } from "@/pages/billing/BankTransferPage";

const FULL = {
  providerKey: "bank_of_khartoum",
  providerName: "Bank of Khartoum",
  transferMethod: "Bankak",
  bankName: "Bank of Khartoum",
  accountName: "OneClub Education",
  accountNumber: "1234567890",
  iban: null as string | null,
  instructions: "Open Bankak and transfer.",
  currency: "SDG",
  isActive: true,
  displayOrder: 1,
};

describe("Bank Transfer page", () => {
  it("fetches the provider from the bank-account API (no hardcoded bank)", async () => {
    renderPage(<BankTransferPage />);
    // Provider + transfer method + currency all come from the API.
    await waitFor(() => expect(screen.getAllByText("Bank of Khartoum").length).toBeGreaterThan(0));
    expect(screen.getByText("Bankak")).toBeInTheDocument();
    expect(screen.getByText("SDG")).toBeInTheDocument();
    expect(screen.getByText("1234567890")).toBeInTheDocument();
    // The retired hardcoded provider must never appear.
    expect(document.body.textContent ?? "").not.toMatch(/Al Rajhi/i);
  });

  it("reflects a different configured provider", async () => {
    server.use(
      http.get("*/api/v1/billing/bank-account/", () =>
        HttpResponse.json({
          ...FULL,
          providerName: "Faisal Islamic Bank",
          bankName: "Faisal Islamic Bank",
          transferMethod: "Fawry",
          iban: "SD00 1234",
        })
      )
    );
    renderPage(<BankTransferPage />);
    await waitFor(() => expect(screen.getAllByText("Faisal Islamic Bank").length).toBeGreaterThan(0));
    expect(screen.getByText("Fawry")).toBeInTheDocument();
    expect(screen.getByText("SD00 1234")).toBeInTheDocument(); // IBAN shown when present
  });

  it("omits the IBAN row when it is not configured", async () => {
    renderPage(<BankTransferPage />); // default handler returns iban: null
    await waitFor(() => expect(screen.getAllByText("Bank of Khartoum").length).toBeGreaterThan(0));
    expect(screen.queryByText("IBAN")).not.toBeInTheDocument();
  });

  it("shows an error + retry when the config fails to load", async () => {
    server.use(
      http.get("*/api/v1/billing/bank-account/", () =>
        HttpResponse.json({ code: "error", detail: "boom" }, { status: 500 })
      )
    );
    renderPage(<BankTransferPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument());
  });
});
