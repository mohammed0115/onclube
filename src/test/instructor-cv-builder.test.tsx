import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse, passthrough } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthProvider";
import { tokenStore } from "@/api";
import { server } from "./server";
import { InstructorPublicProfilePage } from "@/pages/instructor/InstructorPublicProfilePage";

const B = "*/api/v1";

const OWN = {
  id: "i1", slug: "teacher-x", fullName: "Teacher X", jobTitle: "Conversation Coach",
  headline: "", country: "Sudan", flag: "🇸🇩", avatarUrl: null, rating: 5, sessionsHosted: 0,
  yearsExperience: 4, specialization: "Conversation", featured: false, foundingInstructor: false,
  verified: false, acceptStudents: true, availableFor: { ielts: false, business: false, conversation: true },
  socialLinks: {}, city: "Khartoum", nationality: "Sudanese", bio: "", coverPhotoUrl: null,
  introVideoUrl: null, languages: ["Arabic", "English"], education: [], experience: [], certifications: [],
  stats: { rating: 5, totalSessions: 0, yearsExperience: 4 },
  profileApproved: false, publicUrl: null,
  settings: { showOnLanding: true, acceptStudents: true, availableForIelts: false, availableForBusiness: false, availableForConversation: true },
};

function renderPage() {
  tokenStore.set({ access: "a", refresh: "r" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <InstructorPublicProfilePage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Instructor CV builder", () => {
  beforeEach(() => tokenStore.set({ access: "a", refresh: "r" }));

  it("loads the teacher's profile and saves professional info", async () => {
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.get(`${B}/me/`, () => HttpResponse.json({ id: "i1", fullName: "Teacher X", email: "t@x.dev", role: "instructor", status: "active" })),
      http.get(`${B}/instructor/public-profile/`, () => HttpResponse.json(OWN)),
      http.put(`${B}/instructor/public-profile/`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...OWN, ...sent });
      }),
      http.get(`${B}/notifications/`, () => HttpResponse.json([])),
      http.all("*", () => passthrough())
    );

    renderPage();

    // Sections render + the pending-approval banner shows.
    expect(await screen.findByText(/Personal & professional/i)).toBeInTheDocument();
    expect(screen.getByText("Certifications")).toBeInTheDocument();
    expect(screen.getByText(/pending admin approval/i)).toBeInTheDocument();
    expect(screen.getByText("LinkedIn")).toBeInTheDocument();

    const jobTitle = screen.getByPlaceholderText("IELTS Instructor");
    await userEvent.clear(jobTitle);
    await userEvent.type(jobTitle, "Business English Coach");
    // The first "Save" button belongs to the Personal card.
    await userEvent.click(screen.getAllByRole("button", { name: /^Save$/i })[0]);

    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent!.jobTitle).toBe("Business English Coach");
  });
});
