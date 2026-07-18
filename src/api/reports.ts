import { api } from "./client";
import type { AIReportDetail } from "./types";

export const reportsApi = {
  /** Read a report by its id (student / instructor / admin who own it). */
  byId(reportId: string): Promise<AIReportDetail> {
    return api.get<AIReportDetail>(`/reports/${reportId}/`);
  },

  /** Read a session's report. The API returns 202 while still generating. */
  bySession(sessionId: string): Promise<AIReportDetail> {
    return api.get<AIReportDetail>(`/sessions/${sessionId}/report/`);
  },

  generate(sessionId: string, transcript?: unknown[]): Promise<{ reportId: string; status: string }> {
    return api.post(`/sessions/${sessionId}/report/generate/`, { transcript });
  },

  // ── instructor post-session actions (Part 5) ──
  saveNotes(sessionId: string, notes: SessionNotes): Promise<{ sessionId: string; notes: SessionNotes }> {
    return api.post(`/sessions/${sessionId}/notes/`, notes);
  },
  acceptReport(sessionId: string, note = ""): Promise<{ sessionId: string; reviewed: boolean }> {
    return api.post(`/sessions/${sessionId}/report/accept/`, { note });
  },
  regenerateReport(sessionId: string): Promise<{ reportId: string; status: string }> {
    return api.post(`/sessions/${sessionId}/report/regenerate/`, {});
  },
};

export interface SessionNotes {
  participation?: string;
  strengths?: string;
  weaknesses?: string;
  homework?: string;
  next_focus?: string;
}
