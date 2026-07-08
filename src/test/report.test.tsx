import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "./server";
import { renderPage } from "./utils";
import { AIReportPage } from "@/pages/student/AIReportPage";

const B = "*/api/v1";
const ROUTE = { route: "/student/report/r1", path: "/student/report/:id" };

function renderReport() {
  return renderPage(<AIReportPage />, ROUTE);
}

describe("AI Session Report page (Sprint 9)", () => {
  it("renders the validated report content", async () => {
    renderReport();
    expect(await screen.findByTestId("overall-summary")).toHaveTextContent(/productive session/i);
    expect(screen.getByTestId("confidence-score")).toHaveTextContent("72");
    // Per-skill feedback.
    expect(screen.getByText("Grammar")).toBeInTheDocument();
    expect(screen.getByText(/Watch past-tense endings/i)).toBeInTheDocument();
    expect(screen.getByText("Vocabulary")).toBeInTheDocument();
    expect(screen.getByText("Fluency")).toBeInTheDocument();
    expect(screen.getByText("Pronunciation")).toBeInTheDocument();
    // Lists.
    expect(screen.getByText("Stayed engaged")).toBeInTheDocument();
    expect(screen.getByText("Tense slips")).toBeInTheDocument();
    expect(screen.getByText("Write five past-tense sentences.")).toBeInTheDocument();
    expect(screen.getByTestId("next-lesson-focus")).toHaveTextContent(/past-tense narration/i);
  });

  it("shows a loading state while fetching", () => {
    renderReport();
    expect(screen.getByText(/Loading your report/i)).toBeInTheDocument();
  });

  it("shows an error state with retry, and recovers on retry", async () => {
    let calls = 0;
    server.use(
      http.get(`${B}/reports/:id/`, ({ params }) => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ code: "error", detail: "boom" }, { status: 500 });
        return HttpResponse.json({
          id: params.id, sessionId: "s1", bookingId: "b1", topicTitle: "T", instructorName: "I",
          sessionDate: "2026-06-30T18:00:00Z", durationMinutes: 30, status: "ready", overallScore: 60,
          skills: [], mistakes: [], recommendations: [], vocabulary: [], instructorNote: null,
          content: {
            overallSummary: "Recovered summary.", grammarFeedback: "g", vocabularyFeedback: "v",
            fluencyFeedback: "f", pronunciationFeedback: "p", strengths: [], weaknesses: [],
            recommendedTopics: [], homework: [], nextLessonFocus: "focus", confidenceScore: 60,
          },
        });
      })
    );
    renderReport();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(await screen.findByTestId("overall-summary")).toHaveTextContent("Recovered summary.");
  });

  it("shows an empty/pending state when the report is not ready", async () => {
    server.use(
      http.get(`${B}/reports/:id/`, ({ params }) =>
        HttpResponse.json({
          id: params.id, sessionId: "s1", bookingId: "b1", topicTitle: "T", instructorName: "I",
          sessionDate: "2026-06-30T18:00:00Z", durationMinutes: 30, status: "pending", overallScore: null,
          skills: [], mistakes: [], recommendations: [], vocabulary: [], instructorNote: null, content: null,
        })
      )
    );
    renderReport();
    expect(await screen.findByText(/being prepared/i)).toBeInTheDocument();
  });

  it("renders ONLY validated DTO fields — no prompt / provider / raw output leaks", async () => {
    renderReport();
    await screen.findByTestId("overall-summary");
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const banned of ["prompt", "apikey", "api_key", "providername", "provider_name", "systemmessage", "chain of thought", "raw output"]) {
      expect(text).not.toContain(banned);
    }
  });
});
