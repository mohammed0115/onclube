import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthProvider";
import { tokenStore } from "@/api";
import { server } from "./server";
import { InstructorProfilePage } from "@/pages/instructor/InstructorProfilePage";

const B = "*/api/v1";

function renderPage() {
  tokenStore.set({ access: "a", refresh: "r" });
  server.use(
    http.get(`${B}/me/`, () =>
      HttpResponse.json({ id: "u1", fullName: "Sarah Mitchell", email: "sarah@oneclub.local", role: "instructor", status: "active" })
    )
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <InstructorProfilePage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Instructor profile page", () => {
  beforeEach(() => tokenStore.set({ access: "a", refresh: "r" }));

  it("loads the profile and shows the teaching fields", async () => {
    renderPage();
    expect(await screen.findByDisplayValue("Sarah Mitchell")).toBeInTheDocument();
    expect(screen.getByText(/sessions hosted/i)).toBeInTheDocument();
  });

  it("saves an edited headline", async () => {
    let sent: Record<string, unknown> = {};
    server.use(
      http.patch(`${B}/instructor/profile/`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: "i1", fullName: "Sarah Mitchell", email: "sarah@oneclub.local", headline: sent.headline,
          bio: "", country: "", specialty: "", languages: [], interests: [], yearsExperience: 0,
          avatarUrl: "", introVideoUrl: "", rating: 4.8, sessionsHosted: 12,
        });
      })
    );
    renderPage();
    const headline = await screen.findByLabelText(/Headline/i);
    await userEvent.clear(headline);
    await userEvent.type(headline, "IELTS specialist");
    await userEvent.click(screen.getByRole("button", { name: /Save profile/i }));
    await waitFor(() => expect(sent.headline).toBe("IELTS specialist"));
  });

  it("changes the password", async () => {
    let body: { currentPassword?: string; newPassword?: string } = {};
    server.use(
      http.post(`${B}/me/password/`, async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ changed: true });
      })
    );
    renderPage();
    await screen.findByDisplayValue("Sarah Mitchell");
    await userEvent.type(screen.getByLabelText(/Current password/i), "OldPass123!");
    await userEvent.type(screen.getByLabelText(/New password/i), "BrandNewPw456!");
    await userEvent.click(screen.getByRole("button", { name: /Update password/i }));
    await waitFor(() => expect(body.newPassword).toBe("BrandNewPw456!"));
  });
});
