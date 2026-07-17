// Explicit turn state machine for the placement speaking interview.
//
// Pure and framework-free (no React, no I/O) so it is fully unit-testable. The
// component drives side effects (speak / listen / save / finalize) in effects
// keyed on `phase`, and dispatches events back here. Invalid transitions are
// ignored (the reducer returns the same state), which structurally prevents
// double submission, two active questions, saving before confirmation, and
// advancing before persistence.

import type { AnswerSource, InterviewAnswer, InterviewSession, InterviewStep } from "@/api/types";

export type Phase =
  | "loading"
  | "readiness"
  | "blocked_readiness"
  | "ready_to_start"
  | "greeting"
  | "resuming"
  | "tutor_speaking"
  | "ready_to_listen"
  | "listening"
  | "processing_transcript"
  | "reviewing_transcript"
  | "saving_answer"
  | "answer_saved"
  | "clarification"
  | "retrying"
  | "completed"
  | "error";

export interface Draft {
  text: string;
  source: AnswerSource;
}

export interface InterviewState {
  phase: Phase;
  questionIndex: number; // index into steps of the CURRENT question
  total: number;
  draft: Draft | null; // pending, unconfirmed transcript
  completed: InterviewAnswer[]; // server-confirmed answers (read-only)
  micError: string | null; // recognition / permission problem
  saveError: string | null; // persistence failure — draft is kept
  savePermanent: boolean; // save failure is permanent (retry is futile)
  allAnswered: boolean; // every fixed question has a saved answer
  isResume: boolean; // interview already has saved answers (resumed)
  answeredAtStart: number; // answers present when the machine initialized (for resume message)
  repeat: boolean; // the next tutor_speaking is a verbatim repeat (question only)
}

export type Action =
  | { type: "READINESS_RESULT"; blocked: boolean }
  | { type: "START" }
  | { type: "RESUME_SPOKEN" }
  | { type: "GREETING_DONE" }
  | { type: "QUESTION_SPOKEN" }
  | { type: "REPEAT" }
  | { type: "CLARIFY_START" }
  | { type: "CLARIFY_DONE" }
  | { type: "LISTEN_START" }
  | { type: "PROCESSING" }
  | { type: "LISTEN_FINAL"; text: string } // voice transcript
  | { type: "LISTEN_EMPTY"; message: string }
  | { type: "LISTEN_ERROR"; message: string }
  | { type: "MANUAL_SUBMIT"; text: string } // typed fallback
  | { type: "EDIT"; text: string }
  | { type: "RECORD_AGAIN" }
  | { type: "CONFIRM" }
  | { type: "SAVE_OK"; answer: InterviewAnswer }
  | { type: "SAVE_FAIL"; message: string; permanent?: boolean }
  | { type: "ADVANCE" }
  | { type: "FINALIZED" }
  | { type: "FATAL"; message: string };

/** Build the initial state from the server: resume at the first unanswered
 * question; render prior answers read-only; jump straight to `completed` when the
 * interview is already finalized. The frontend never infers the next question
 * independently of the persisted answers. */
export function initFromSession(steps: InterviewStep[], session: InterviewSession | null): InterviewState {
  const total = steps.length;
  const answers = session?.answers ?? [];
  const answeredIds = new Set(answers.map((a) => a.questionId));
  let firstUnanswered = steps.findIndex((s) => !answeredIds.has(s.questionId));
  if (firstUnanswered < 0) firstUnanswered = Math.max(0, total - 1);
  const allAnswered = total > 0 && answers.length >= total;
  const finalized = session?.status === "finalized";

  return {
    // Always begin at the readiness screen (explicit Start required). Already
    // finalized interviews skip straight to completed.
    phase: finalized ? "completed" : "readiness",
    questionIndex: firstUnanswered,
    total,
    draft: null,
    completed: [...answers],
    micError: null,
    saveError: null,
    savePermanent: false,
    allAnswered,
    isResume: answers.length > 0 && !finalized,
    answeredAtStart: answers.length,
    repeat: false,
  };
}

const canReview = (s: InterviewState) =>
  s.phase === "reviewing_transcript" || s.phase === "listening" || s.phase === "processing_transcript";

export function reducer(state: InterviewState, action: Action): InterviewState {
  switch (action.type) {
    case "FATAL":
      return { ...state, phase: "error", micError: action.message };

    case "READINESS_RESULT":
      // Readiness checks completed. A hard block (e.g. offline) prevents Start.
      return state.phase === "readiness"
        ? { ...state, phase: action.blocked ? "blocked_readiness" : "ready_to_start" }
        : state;

    case "START":
      // Explicit Start. Fresh → full greeting; resumed → deterministic welcome-back.
      return state.phase === "ready_to_start"
        ? { ...state, phase: state.isResume ? "resuming" : "greeting" }
        : state;

    case "RESUME_SPOKEN":
      return state.phase === "resuming" ? { ...state, phase: "tutor_speaking" } : state;

    case "GREETING_DONE":
      return state.phase === "greeting" ? { ...state, phase: "tutor_speaking" } : state;

    case "QUESTION_SPOKEN":
      return state.phase === "tutor_speaking" ? { ...state, phase: "ready_to_listen", repeat: false } : state;

    case "REPEAT":
      // Replay the EXACT question (verbatim, question-only). Waiting/recovery only.
      return state.phase === "ready_to_listen" || state.phase === "retrying"
        ? { ...state, phase: "tutor_speaking", repeat: true, micError: null }
        : state;

    case "CLARIFY_START":
      return state.phase === "ready_to_listen" || state.phase === "retrying"
        ? { ...state, phase: "clarification", micError: null }
        : state;

    case "CLARIFY_DONE":
      return state.phase === "clarification" ? { ...state, phase: "ready_to_listen" } : state;

    case "LISTEN_START":
      return state.phase === "ready_to_listen" || state.phase === "retrying"
        ? { ...state, phase: "listening", micError: null, saveError: null, savePermanent: false }
        : state;

    case "PROCESSING":
      return state.phase === "listening" ? { ...state, phase: "processing_transcript" } : state;

    case "LISTEN_FINAL": {
      const text = (action.text || "").trim();
      if (!canReview(state)) return state;
      // Empty/partial → recover (Record again). A real final transcript AUTO-SAVES
      // immediately — no Confirm step (Sprint 2.0.1B, natural conversation).
      if (!text) return { ...state, phase: "retrying", micError: "We didn't catch that. Take your time — you can try again." };
      return { ...state, phase: "saving_answer", draft: { text, source: "voice" }, micError: null, saveError: null, savePermanent: false };
    }

    case "LISTEN_EMPTY":
      return state.phase === "listening" || state.phase === "processing_transcript"
        ? { ...state, phase: "retrying", micError: action.message }
        : state;

    case "LISTEN_ERROR":
      // Any recognition/permission failure → recover, offer retry + manual entry.
      return state.phase === "listening" || state.phase === "processing_transcript" || state.phase === "ready_to_listen"
        ? { ...state, phase: "retrying", micError: action.message }
        : state;

    case "MANUAL_SUBMIT": {
      const text = (action.text || "").trim();
      if (!text) return state;
      // Manual entry (fallback) also auto-saves — no Confirm step. Allowed from
      // waiting/recovery/save-failure.
      if (state.phase === "ready_to_listen" || state.phase === "retrying" || state.phase === "reviewing_transcript") {
        return { ...state, phase: "saving_answer", draft: { text, source: "manual" }, micError: null, saveError: null, savePermanent: false };
      }
      return state;
    }

    case "EDIT":
      // Editing the transcript is ONLY allowed for manual/fallback answers.
      if (state.phase === "reviewing_transcript" && state.draft && state.draft.source === "manual") {
        return { ...state, draft: { ...state.draft, text: action.text } };
      }
      return state;

    case "RECORD_AGAIN":
      return state.phase === "reviewing_transcript"
        ? { ...state, phase: "ready_to_listen", draft: null, saveError: null, savePermanent: false }
        : state;

    case "CONFIRM":
      // Save only a non-empty, reviewed transcript. Guard blocks empty + double.
      if (state.phase === "reviewing_transcript" && state.draft && state.draft.text.trim()) {
        return { ...state, phase: "saving_answer", saveError: null, savePermanent: false };
      }
      return state;

    case "SAVE_OK": {
      if (state.phase !== "saving_answer") return state;
      const completed = [...state.completed.filter((a) => a.questionId !== action.answer.questionId), action.answer];
      const allAnswered = completed.length >= state.total;
      return { ...state, phase: "answer_saved", draft: null, saveError: null, completed, allAnswered };
    }

    case "SAVE_FAIL":
      // Keep the confirmed transcript visible. Transient failures allow a retry;
      // permanent ones (e.g. one-shot already used) do not.
      return state.phase === "saving_answer"
        ? { ...state, phase: "reviewing_transcript", saveError: action.message, savePermanent: !!action.permanent }
        : state;

    case "ADVANCE":
      // Move to the next unanswered question. Never skips: index only +1.
      if (state.phase === "answer_saved" && !state.allAnswered) {
        return { ...state, phase: "tutor_speaking", repeat: false, questionIndex: Math.min(state.questionIndex + 1, state.total - 1) };
      }
      return state;

    case "FINALIZED":
      return state.phase === "answer_saved" && state.allAnswered ? { ...state, phase: "completed" } : state;

    default:
      return state;
  }
}
