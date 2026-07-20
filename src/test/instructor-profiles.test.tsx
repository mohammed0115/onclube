import { describe, it, expect } from "vitest";
import { http, HttpResponse, passthrough } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "./server";
import { LandingPage } from "@/pages/public/LandingPage";
import { PublicInstructorPage } from "@/pages/public/PublicInstructorPage";

const B = "*/api/v1";

function renderAt(ui: React.ReactNode, path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Dynamic instructor profiles", () => {
  it("landing page renders instructors from the API (no hardcoded data)", async () => {
    // server.ts default handler returns Hasaballah as a founding instructor.
    renderAt(<LandingPage />);
    expect(await screen.findByText("Hasaballah Hamadain")).toBeInTheDocument();
    // Founding badge appears.
    expect(screen.getAllByText(/Founding/i).length).toBeGreaterThan(0);
  });

  it("public profile page shows the full profile by slug", async () => {
    server.use(
      http.get(`${B}/instructors/john-doe/`, () =>
        HttpResponse.json({
          id: "i9", slug: "john-doe", fullName: "John Doe", jobTitle: "IELTS Instructor",
          headline: "IELTS speaking specialist", country: "UK", flag: "🇬🇧", avatarUrl: null,
          rating: 4.8, sessionsHosted: 200, yearsExperience: 10, specialization: "IELTS",
          featured: false, foundingInstructor: false, verified: true, acceptStudents: true,
          availableFor: { ielts: true, business: false, conversation: true },
          socialLinks: { linkedin: "https://linkedin.com/in/johndoe" },
          city: "London", nationality: "British", bio: "Ten years teaching IELTS.",
          coverPhotoUrl: null, introVideoUrl: null, languages: ["English", "French"],
          education: [{ degree: "MA TESOL", institution: "UCL", country: "UK", startYear: 2010, endYear: 2012 }],
          experience: [{ company: "British Council", position: "Examiner", description: "IELTS examiner.", from: "2013", to: "Present" }],
          certifications: [{ title: "CELTA", issuer: "Cambridge", issueDate: "2011", credentialUrl: "" }],
          stats: { rating: 4.8, totalSessions: 200, yearsExperience: 10 },
        })
      ),
      http.all("*", () => passthrough())
    );
    renderAt(
      <Routes>
        <Route path="/instructors/:slug" element={<PublicInstructorPage />} />
      </Routes>,
      "/instructors/john-doe"
    );
    expect(await screen.findByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("Ten years teaching IELTS.")).toBeInTheDocument();
    expect(screen.getByText("MA TESOL")).toBeInTheDocument();
    expect(screen.getByText("CELTA")).toBeInTheDocument();
    expect(screen.getByText(/Examiner/)).toBeInTheDocument();
  });
});
