import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ForgotPasswordPage } from "@/pages/public/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/public/ResetPasswordPage";

function renderAt(route: string, mode: "reset" | "set" = "reset") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage mode={mode} />} />
          <Route path="/login" element={<div>LOGIN</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Password recovery", () => {
  it("requests a reset link and shows the check-email confirmation", async () => {
    renderAt("/forgot-password");
    await userEvent.type(screen.getByLabelText(/Email/i), "me@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Send reset link/i }));
    expect(await screen.findByText(/Check your email/i)).toBeInTheDocument();
    expect(screen.getByText(/me@example.com/)).toBeInTheDocument();
  });

  it("confirms a new password from a valid uid+token link", async () => {
    renderAt("/reset-password?uid=abc&token=xyz");
    await userEvent.type(screen.getByLabelText(/New password/i), "BrandNewPw456!");
    await userEvent.click(screen.getByRole("button", { name: /Update password/i }));
    expect(await screen.findByText(/Password updated/i)).toBeInTheDocument();
  });

  it("rejects a link with a missing token", async () => {
    renderAt("/reset-password?uid=abc");
    expect(await screen.findByText(/link is missing or invalid/i)).toBeInTheDocument();
  });

  it("uses invite wording in set mode", async () => {
    renderAt("/reset-password?uid=abc&token=xyz", "set");
    expect(await screen.findByRole("button", { name: /Set password/i })).toBeInTheDocument();
  });
});
