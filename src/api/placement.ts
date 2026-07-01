import { api } from "./client";
import type {
  PlacementAssessment,
  PlacementAttempt,
  PlacementAttemptStatus,
  PlacementResetAudit,
  PlacementSpokenTranscriptInput,
  PlacementTest,
  PlacementWrittenAnswerInput,
} from "./types";

/**
 * Placement API (Phase 8F) — AI-led written + spoken interview.
 * Responses never carry an answer key or a pronunciation field.
 */
export const placementApi = {
  /** Active fixed known questions, split written / spoken (no answer key). */
  test(): Promise<PlacementTest> {
    return api.get<PlacementTest>("/placement/test/");
  },

  /** Create or reuse the student's one active attempt. */
  start(): Promise<PlacementAttempt> {
    return api.post<PlacementAttempt>("/placement/start/");
  },

  /** Progress for the current/latest attempt. */
  status(): Promise<PlacementAttemptStatus> {
    return api.get<PlacementAttemptStatus>("/placement/status/");
  },

  /** Save (or overwrite) written answers. */
  saveWritten(attemptId: string, answers: PlacementWrittenAnswerInput[]): Promise<PlacementAttempt> {
    return api.post<PlacementAttempt>("/placement/written-answers/", { attemptId, answers });
  },

  /** Save spoken transcript text (one-shot; text only — no audio, no STT). */
  saveSpoken(
    attemptId: string,
    transcripts: PlacementSpokenTranscriptInput[]
  ): Promise<PlacementAttempt> {
    return api.post<PlacementAttempt>("/placement/spoken-transcripts/", { attemptId, transcripts });
  },

  /** Run the deterministic assessment over the completed attempt. */
  submit(): Promise<PlacementAssessment> {
    return api.post<PlacementAssessment>("/placement/submit/");
  },

  /** The current student's latest assessed result (owner only). */
  result(): Promise<PlacementAssessment> {
    return api.get<PlacementAssessment>("/placement/result/");
  },

  /** Admin-only: reset a student's one-shot spoken attempt (reason required). */
  resetSpoken(studentId: string, reason: string): Promise<PlacementResetAudit> {
    return api.post<PlacementResetAudit>(`/admin/placement/${studentId}/reset-spoken/`, { reason });
  },
};
