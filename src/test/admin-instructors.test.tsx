import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse, passthrough } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthProvider";
import { tokenStore } from "@/api";
import { server } from "./server";
import { AdminInstructorsPage } from "@/pages/admin/AdminInstructorsPage";

const B = "*/api/v1";

const INSTRUCTOR = {
  id: "i1", slug: "hasaballah", fullName: "Hasaballah Hamadain", email: "h@x.dev",
  jobTitle: "Conversation Coach", headline: "", country: "Sudan", flag: "🇸🇩", avatarUrl: null,
  rating: 5, sessionsHosted: 12, yearsExperience: 8, specialization: "Conversation",
  featured: false, foundingInstructor: false, verified: true, acceptStudents: true,
  availableFor: { ielts: true, business: true, conversation: true }, socialLinks: {},
  showOnLanding: true, profileApproved: true, displayOrder: 0,
};

function renderPage() {
  tokenStore.set({ access: "a", refresh: "r" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <AdminInstructorsPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Admin instructors management", () => {
  beforeEach(() => tokenStore.set({ access: "a", refresh: "r" }));

  it("lists instructors and toggles the founding badge", async () => {
    let foundingSent: boolean | null = null;
    server.use(
      http.get(`${B}/me/`, () => HttpResponse.json({ id: "a1", fullName: "Admin", email: "a@x.dev", role: "admin", status: "active" })),
      http.get(`${B}/admin/instructors/`, () => HttpResponse.json([INSTRUCTOR])),
      http.patch(`${B}/admin/instructors/i1/founding/`, async ({ request }) => {
        foundingSent = ((await request.json()) as { founding: boolean }).founding;
        return HttpResponse.json({ ...INSTRUCTOR, foundingInstructor: foundingSent });
      }),
      http.get(`${B}/notifications/`, () => HttpResponse.json([])),
      http.all("*", () => passthrough())
    );

    renderPage();
    expect(await screen.findByText("Hasaballah Hamadain")).toBeInTheDocument();
    expect(screen.getByText(/Approved/i)).toBeInTheDocument();

    // Toggle the Founding switch.
    const foundingRow = screen.getByText(/Founding/i).closest("div")!;
    const sw = foundingRow.querySelector('[role="switch"]') as HTMLElement;
    await userEvent.click(sw);
    await waitFor(() => expect(foundingSent).toBe(true));
  });
});
