import { describe, it, expect } from "vitest";
import { initFromSession, reducer, type InterviewState } from "./machine";
import type { InterviewSession, InterviewStep } from "@/api/types";

const STEPS: InterviewStep[] = [
  { questionId: "q1", order: 1, prompt: "What is your name?", preamble: "First.", clarification: "Your name?" },
  { questionId: "q2", order: 2, prompt: "How old are you?", preamble: "Next.", clarification: "Your age?" },
  { questionId: "q3", order: 3, prompt: "Where are you from?", preamble: "Next.", clarification: "Your country?" },
];

const session = (over: Partial<InterviewSession> = {}): InterviewSession => ({
  interviewId: "i", attemptId: "a", status: "created", currentQuestionIndex: 0,
  startedAt: null, finishedAt: null, answers: [], ...over,
});

const answer = (questionId: string, order: number, source: "voice" | "manual" = "voice") => ({
  questionId, order, transcriptText: `answer ${order}`, source,
});

// Walk to a phase for transition tests.
function at(phase: InterviewState["phase"], over: Partial<InterviewState> = {}): InterviewState {
  return {
    phase, questionIndex: 0, total: 3, draft: null, completed: [], micError: null, saveError: null,
    savePermanent: false, allAnswered: false, isResume: false, answeredAtStart: 0, repeat: false, ...over,
  };
}

describe("interview machine — initFromSession (resume)", () => {
  it("starts at the readiness screen for a fresh interview (explicit Start required)", () => {
    const s = initFromSession(STEPS, session());
    expect(s.phase).toBe("readiness");
    expect(s.questionIndex).toBe(0);
    expect(s.total).toBe(3);
    expect(s.completed).toHaveLength(0);
    expect(s.isResume).toBe(false);
  });

  it("marks a partially-answered interview as a resume", () => {
    const s = initFromSession(STEPS, session({ status: "running", answers: [answer("q1", 1)] }));
    expect(s.isResume).toBe(true);
    expect(s.answeredAtStart).toBe(1);
    expect(s.phase).toBe("readiness");
  });

  it("resumes at the first UNANSWERED question and keeps completed answers read-only", () => {
    const s = initFromSession(STEPS, session({ status: "running", answers: [answer("q1", 1)] }));
    expect(s.questionIndex).toBe(1); // q2 is first unanswered
    expect(s.completed.map((a) => a.questionId)).toEqual(["q1"]);
    expect(s.allAnswered).toBe(false);
  });

  it("jumps straight to completed when already finalized", () => {
    const s = initFromSession(STEPS, session({ status: "finalized", answers: [answer("q1", 1), answer("q2", 2), answer("q3", 3)] }));
    expect(s.phase).toBe("completed");
    expect(s.allAnswered).toBe(true);
  });

  it("does not restart from question one when answers already exist", () => {
    const s = initFromSession(STEPS, session({ status: "running", answers: [answer("q1", 1), answer("q2", 2)] }));
    expect(s.questionIndex).toBe(2);
  });
});

describe("interview machine — readiness & start", () => {
  it("readiness → ready_to_start when not blocked; → blocked_readiness when blocked", () => {
    expect(reducer(at("readiness"), { type: "READINESS_RESULT", blocked: false }).phase).toBe("ready_to_start");
    expect(reducer(at("readiness"), { type: "READINESS_RESULT", blocked: true }).phase).toBe("blocked_readiness");
  });

  it("START from ready_to_start → greeting (fresh) or resuming (resume)", () => {
    expect(reducer(at("ready_to_start", { isResume: false }), { type: "START" }).phase).toBe("greeting");
    expect(reducer(at("ready_to_start", { isResume: true }), { type: "START" }).phase).toBe("resuming");
  });

  it("cannot START while readiness is blocked", () => {
    const blocked = at("blocked_readiness");
    expect(reducer(blocked, { type: "START" })).toBe(blocked);
  });

  it("resuming → tutor_speaking (no full greeting on resume)", () => {
    expect(reducer(at("resuming"), { type: "RESUME_SPOKEN" }).phase).toBe("tutor_speaking");
  });

  it("REPEAT re-speaks the exact question (question-only, repeat flag set)", () => {
    const s = reducer(at("ready_to_listen"), { type: "REPEAT" });
    expect(s.phase).toBe("tutor_speaking");
    expect(s.repeat).toBe(true);
    // and QUESTION_SPOKEN clears the repeat flag.
    expect(reducer(s, { type: "QUESTION_SPOKEN" }).repeat).toBe(false);
  });
});

describe("interview machine — turn transitions", () => {
  it("greeting → tutor_speaking → ready_to_listen", () => {
    let s = at("greeting");
    s = reducer(s, { type: "GREETING_DONE" });
    expect(s.phase).toBe("tutor_speaking");
    s = reducer(s, { type: "QUESTION_SPOKEN" });
    expect(s.phase).toBe("ready_to_listen");
  });

  it("a voice final transcript AUTO-SAVES immediately (no confirm step, 2.0.1B)", () => {
    let s = at("listening");
    s = reducer(s, { type: "LISTEN_FINAL", text: "My name is Sam" });
    expect(s.phase).toBe("saving_answer");
    expect(s.draft).toEqual({ text: "My name is Sam", source: "voice" });
  });

  it("a manual (typed) answer also auto-saves — no confirm", () => {
    const s = reducer(at("ready_to_listen"), { type: "MANUAL_SUBMIT", text: "typed answer" });
    expect(s.phase).toBe("saving_answer");
    expect(s.draft).toEqual({ text: "typed answer", source: "manual" });
  });

  it("an empty transcript never advances — it routes to retrying", () => {
    const s = reducer(at("listening"), { type: "LISTEN_FINAL", text: "   " });
    expect(s.phase).toBe("retrying");
    expect(s.draft).toBeNull();
  });

  it("CONFIRM (retry-save) re-saves from a save-failure state, with a transcript", () => {
    // reviewing_transcript is now only reached after a save failure.
    const failed = reducer(at("saving_answer", { draft: { text: "hi", source: "voice" } }), { type: "SAVE_FAIL", message: "net" });
    expect(failed.phase).toBe("reviewing_transcript");
    expect(reducer(failed, { type: "CONFIRM" }).phase).toBe("saving_answer");
  });

  it("SAVE_OK records the answer, then ADVANCE moves to the next question (never skips)", () => {
    let s = at("saving_answer", { draft: { text: "hi", source: "voice" } });
    s = reducer(s, { type: "SAVE_OK", answer: answer("q1", 1) });
    expect(s.phase).toBe("answer_saved");
    expect(s.completed).toHaveLength(1);
    expect(s.allAnswered).toBe(false);
    s = reducer(s, { type: "ADVANCE" });
    expect(s.phase).toBe("tutor_speaking");
    expect(s.questionIndex).toBe(1);
  });

  it("SAVE_FAIL keeps the transcript for retry (does not advance)", () => {
    const s = reducer(at("saving_answer", { draft: { text: "hi", source: "voice" } }), { type: "SAVE_FAIL", message: "net" });
    expect(s.phase).toBe("reviewing_transcript");
    expect(s.saveError).toBe("net");
    expect(s.draft).toEqual({ text: "hi", source: "voice" });
  });

  it("a permanent save failure is cleared by re-recording (never sticky / dead-ended)", () => {
    let s = reducer(at("saving_answer", { draft: { text: "x", source: "voice" } }), { type: "SAVE_FAIL", message: "used up", permanent: true });
    expect(s.savePermanent).toBe(true);
    // Record again → start listening → new final transcript: the permanent flag is gone.
    s = reducer(s, { type: "RECORD_AGAIN" });
    expect(s.savePermanent).toBe(false);
    s = reducer(s, { type: "LISTEN_START" });
    s = reducer(s, { type: "LISTEN_FINAL", text: "new answer" });
    expect(s.phase).toBe("saving_answer"); // auto-saves the fresh answer
    expect(s.savePermanent).toBe(false);
    expect(s.saveError).toBeNull();
  });

  it("finalizes only after every question is answered", () => {
    let s = at("saving_answer", { questionIndex: 2, completed: [answer("q1", 1), answer("q2", 2)], draft: { text: "hi", source: "voice" } });
    s = reducer(s, { type: "SAVE_OK", answer: answer("q3", 3) });
    expect(s.allAnswered).toBe(true);
    expect(reducer(s, { type: "ADVANCE" }).phase).toBe("answer_saved"); // ADVANCE is a no-op when all answered
    expect(reducer(s, { type: "FINALIZED" }).phase).toBe("completed");
  });

  it("never converts a voice answer to manual: EDIT is ignored for voice drafts", () => {
    const s = reducer(at("reviewing_transcript", { draft: { text: "voice text", source: "voice" } }), { type: "EDIT", text: "hacked" });
    expect(s.draft).toEqual({ text: "voice text", source: "voice" });
  });

  it("allows editing only manual drafts", () => {
    const s = reducer(at("reviewing_transcript", { draft: { text: "typed", source: "manual" } }), { type: "EDIT", text: "typed more" });
    expect(s.draft).toEqual({ text: "typed more", source: "manual" });
  });

  it("RECORD_AGAIN clears the unconfirmed draft and returns to ready_to_listen", () => {
    const s = reducer(at("reviewing_transcript", { draft: { text: "x", source: "voice" } }), { type: "RECORD_AGAIN" });
    expect(s.phase).toBe("ready_to_listen");
    expect(s.draft).toBeNull();
  });

  it("REPEAT and CLARIFY only fire while waiting/recovering", () => {
    expect(reducer(at("ready_to_listen"), { type: "REPEAT" }).phase).toBe("tutor_speaking");
    expect(reducer(at("retrying"), { type: "CLARIFY_START" }).phase).toBe("clarification");
    expect(reducer(at("listening"), { type: "REPEAT" }).phase).toBe("listening"); // ignored mid-recording
  });

  it("ignores double submission (SAVE_OK only from saving_answer)", () => {
    const s = at("answer_saved", { completed: [answer("q1", 1)] });
    const again = reducer(s, { type: "SAVE_OK", answer: answer("q1", 1) });
    expect(again).toBe(s); // unchanged
  });
});
