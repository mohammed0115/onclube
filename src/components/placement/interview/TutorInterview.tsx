import { useEffect, useReducer, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Loader2,
  Volume2,
  Check,
  RefreshCw,
  HelpCircle,
  Repeat,
  Pencil,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loading, ErrorState } from "@/components/states";
import {
  useSpeakingInterview,
  useInterviewSession,
  useSaveInterviewAnswer,
  useFinalizeInterview,
} from "@/hooks";
import { getSpeechProvider, type SpeechErrorKind } from "@/lib/speech";
import { getTutorVoiceProvider } from "@/lib/voice";
import { ApiError } from "@/api";
import { cn } from "@/lib/utils";
import { initFromSession, reducer, type InterviewState } from "./machine";
import { ReadinessScreen } from "./ReadinessScreen";
import { Timeline } from "./Timeline";
import type { InterviewAnswer, InterviewSession, SpeakingInterview } from "@/api/types";

const MIC_MESSAGES: Record<SpeechErrorKind, string> = {
  "not-supported": "Voice input isn't available in this browser — you can type your answer instead.",
  "permission-denied": "Microphone access is blocked. Allow it in your browser, or type your answer.",
  "mic-unavailable": "We couldn't reach your microphone. Please try again or type your answer.",
  "no-speech": "We didn't catch that. Take your time — you can try again.",
  network: "Your connection dropped while recording. Try again.",
  aborted: "Recording was cancelled. Try again when you're ready.",
  unknown: "Something interrupted the recording. Try again, or type your answer.",
};

interface Props {
  onFinished: () => void;
  finishedCtaLabel?: string;
}

/** Canonical placement speaking interview: the AI Tutor asks the five fixed
 * questions one at a time, the student records, reviews the transcript, confirms,
 * and only then it is saved. Resumes from the first unanswered question. No
 * scoring happens here. */
export function TutorInterview({ onFinished, finishedCtaLabel = "See my result" }: Props) {
  const scriptQuery = useSpeakingInterview();
  const sessionQuery = useInterviewSession();
  const saveAnswer = useSaveInterviewAnswer();
  const finalize = useFinalizeInterview();

  if (scriptQuery.isLoading || sessionQuery.isLoading)
    return <Loading label="Preparing your interview…" />;
  if (scriptQuery.isError)
    return <ErrorState error={scriptQuery.error} onRetry={() => scriptQuery.refetch()} />;
  if (sessionQuery.isError)
    return <ErrorState error={sessionQuery.error} onRetry={() => sessionQuery.refetch()} />;

  return (
    <InterviewMachine
      script={scriptQuery.data!}
      session={sessionQuery.data ?? null}
      save={(input) => saveAnswer.mutateAsync(input)}
      finalize={() => finalize.mutateAsync()}
      onFinished={onFinished}
      finishedCtaLabel={finishedCtaLabel}
    />
  );
}

function InterviewMachine({
  script,
  session,
  save,
  finalize,
  onFinished,
  finishedCtaLabel,
}: {
  script: SpeakingInterview;
  session: InterviewSession | null;
  save: (input: { questionId: string; transcriptText: string; source: "voice" | "manual" }) => Promise<unknown>;
  finalize: () => Promise<unknown>;
  onFinished: () => void;
  finishedCtaLabel: string;
}) {
  const steps = script.steps;
  const [state, dispatch] = useReducer(reducer, initFromSession(steps, session));
  const [manualText, setManualText] = useState("");
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [finalizeError, setFinalizeError] = useState(false);

  const voice = getTutorVoiceProvider();
  const recognizer = getSpeechProvider();
  const speechSupported = recognizer.isSupported();

  const step = steps[state.questionIndex];
  // Each auto side-effect gets a fresh epoch; stale callbacks are ignored (guards
  // against React StrictMode double-invocation and cancelled TTS).
  const epochRef = useRef(0);

  // Recording timer.
  useEffect(() => {
    if (state.phase !== "listening") {
      setRecordSeconds(0);
      return;
    }
    const t = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state.phase]);

  // ── side-effect orchestration, keyed on phase (+ question) ──────────────────
  useEffect(() => {
    const myEpoch = ++epochRef.current;
    const fresh = () => myEpoch === epochRef.current;

    if (state.phase === "greeting") {
      // Fresh interview → full greeting + instructions.
      voice.speak(`${script.greeting} ${script.instructions}`, {
        onEnd: () => fresh() && dispatch({ type: "GREETING_DONE" }),
        onError: () => fresh() && dispatch({ type: "GREETING_DONE" }),
      });
    } else if (state.phase === "resuming") {
      // Resumed interview → deterministic "Welcome back" line (NOT the full greeting).
      const idx = Math.min(Math.max(state.answeredAtStart - 1, 0), Math.max(script.resumeMessages.length - 1, 0));
      const resumeLine = script.resumeMessages[idx] ?? "Welcome back. Let's continue.";
      voice.speak(resumeLine, {
        onEnd: () => fresh() && dispatch({ type: "RESUME_SPOKEN" }),
        onError: () => fresh() && dispatch({ type: "RESUME_SPOKEN" }),
      });
    } else if (state.phase === "tutor_speaking") {
      // A repeat replays the EXACT question (verbatim, no preamble); otherwise the
      // neutral preamble + the fixed question.
      const text = state.repeat ? step.prompt : `${step.preamble} ${step.prompt}`;
      voice.speak(text, {
        onEnd: () => fresh() && dispatch({ type: "QUESTION_SPOKEN" }),
        onError: () => fresh() && dispatch({ type: "QUESTION_SPOKEN" }),
      });
    } else if (state.phase === "clarification") {
      voice.speak(step.clarification, {
        onEnd: () => fresh() && dispatch({ type: "CLARIFY_DONE" }),
        onError: () => fresh() && dispatch({ type: "CLARIFY_DONE" }),
      });
    } else if (state.phase === "ready_to_listen") {
      // Natural conversation (2.0.1B): the moment the tutor finishes, the mic opens
      // automatically — no "Record answer" button. (Only when voice is supported;
      // otherwise the manual-entry fallback is shown.)
      if (speechSupported) dispatch({ type: "LISTEN_START" });
    } else if (state.phase === "listening") {
      recognizer.start({
        onResult: (transcript) => {
          if (!fresh()) return;
          dispatch({ type: "PROCESSING" });
          dispatch({ type: "LISTEN_FINAL", text: transcript ?? "" });
        },
        onError: (kind) => {
          if (!fresh()) return;
          dispatch({ type: "LISTEN_ERROR", message: MIC_MESSAGES[kind] });
        },
        onEnd: () => {},
      });
    } else if (state.phase === "saving_answer") {
      const draft = state.draft!;
      save({ questionId: step.questionId, transcriptText: draft.text, source: draft.source })
        .then(() => {
          if (!fresh()) return;
          const answer: InterviewAnswer = {
            questionId: step.questionId,
            order: step.order,
            transcriptText: draft.text,
            source: draft.source,
          };
          dispatch({ type: "SAVE_OK", answer });
        })
        .catch((e) => {
          if (!fresh()) return;
          const code = e instanceof ApiError ? e.code : undefined;
          const permanentMap: Record<string, string> = {
            spoken_attempt_used: "You've already used your one spoken interview. Ask an admin to reset it to try again.",
            transcript_locked: "This answer was already saved by voice and can't be changed.",
            placement_attempt_not_found: "Your placement session expired. Please restart the placement.",
          };
          if (code && permanentMap[code]) {
            dispatch({ type: "SAVE_FAIL", message: permanentMap[code], permanent: true });
          } else {
            dispatch({ type: "SAVE_FAIL", message: "Couldn't save your answer. Your transcript is safe — please retry." });
          }
        });
    } else if (state.phase === "answer_saved") {
      if (state.allAnswered) {
        setFinalizeError(false);
        finalize()
          .then(() => fresh() && dispatch({ type: "FINALIZED" }))
          .catch(() => fresh() && setFinalizeError(true));
      } else {
        dispatch({ type: "ADVANCE" });
      }
    }

    return () => {
      // Leaving an auto phase invalidates its pending callbacks.
      epochRef.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.questionIndex]);

  // ── readiness gate (explicit Start required before any capture) ─────────────
  if (state.phase === "readiness" || state.phase === "ready_to_start" || state.phase === "blocked_readiness") {
    return (
      <div className="mx-auto w-full max-w-lg">
        <ReadinessScreen phase={state.phase} isResume={state.isResume} dispatch={dispatch} />
        <ScriptFooter script={script} />
      </div>
    );
  }

  // ── derived UI ──────────────────────────────────────────────────────────────
  const number = state.questionIndex + 1;
  const answeredCount = state.completed.length;
  const busySpeaking =
    state.phase === "greeting" || state.phase === "tutor_speaking" || state.phase === "clarification" || state.phase === "resuming";
  const status = statusLabel(state.phase);

  return (
    <div className="mx-auto w-full max-w-lg">
      {/* Progress */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Question {number} of {state.total}</span>
          <span>{answeredCount}/{state.total} answered</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={answeredCount} aria-valuemin={0} aria-valuemax={state.total}>
          <div className="h-full rounded-full bg-indigo-600 transition-all duration-300" style={{ width: `${(number / state.total) * 100}%` }} />
        </div>
      </div>

      {/* Five-question timeline (read-only; derives from server-confirmed answers) */}
      {state.phase !== "completed" && (
        <Timeline steps={steps} completed={state.completed} currentIndex={state.questionIndex} />
      )}

      {/* Tutor avatar + live status */}
      <div className="mb-4 flex items-center gap-3">
        <div className={cn("relative flex h-12 w-12 items-center justify-center rounded-full text-white", state.phase === "listening" ? "bg-rose-500" : busySpeaking ? "bg-indigo-600" : "bg-indigo-500")}>
          {state.phase === "listening" ? <Mic size={20} /> : busySpeaking ? <Volume2 size={20} /> : <Volume2 size={20} />}
          {(busySpeaking || state.phase === "listening") && <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-20" aria-hidden />}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">AI Tutor</p>
          <p className="text-xs text-muted-foreground" aria-live="polite">{status}</p>
        </div>
      </div>

      {/* Current question card */}
      {state.phase !== "completed" && state.phase !== "error" && step && (
        <Card className="mb-4 rounded-3xl p-6">
          <p className="mb-1 text-xs font-medium text-indigo-600">{step.preamble}</p>
          <h3 className="font-display text-lg font-bold text-foreground">{step.prompt}</h3>

          {/* Repeat + Explain — always available while on a question */}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => dispatch({ type: "REPEAT" })}
              disabled={!(state.phase === "ready_to_listen" || state.phase === "retrying")}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-indigo-600 disabled:opacity-40"
            >
              <Repeat size={13} /> Repeat question
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "CLARIFY_START" })}
              disabled={!(state.phase === "ready_to_listen" || state.phase === "retrying")}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-indigo-600 disabled:opacity-40"
            >
              <HelpCircle size={13} /> Explain question
            </button>
          </div>

          {/* ── phase-specific body ── */}
          <div className="mt-5" aria-live="polite">
            {busySpeaking && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={15} className="animate-spin" /> The tutor is speaking…
              </p>
            )}

            {state.phase === "ready_to_listen" && (
              <div className="flex flex-col items-center gap-3">
                {speechSupported ? (
                  // Mic opens automatically (2.0.1B) — this is a brief transitional state.
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mic size={15} className="text-indigo-600" /> Opening your microphone…
                  </p>
                ) : (
                  <ManualEntry onSubmit={(t) => dispatch({ type: "MANUAL_SUBMIT", text: t })} value={manualText} setValue={setManualText} />
                )}
              </div>
            )}

            {state.phase === "listening" && (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700" role="status">
                  <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500" /></span>
                  Listening… {fmt(recordSeconds)}
                </div>
                <Button variant="soft" onClick={() => recognizer.stop()} aria-label="Stop recording">
                  <MicOff size={16} /> Stop recording
                </Button>
              </div>
            )}

            {state.phase === "processing_transcript" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" /> Processing your answer…</p>
            )}

            {/* reviewing_transcript is reached ONLY when auto-save failed — the answer
                is kept locally and can be retried. No Confirm step in the happy path. */}
            {state.phase === "reviewing_transcript" && state.draft && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-600">
                  <AlertCircle size={14} /> Couldn't save — your answer is safe below
                </p>
                {state.draft.source === "manual" ? (
                  <Textarea aria-label="Your answer" rows={3} value={state.draft.text} onChange={(e) => dispatch({ type: "EDIT", text: e.target.value })} />
                ) : (
                  <p aria-label="Your recorded answer" className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">{state.draft.text}</p>
                )}

                {state.saveError && (
                  <p role="alert" className="mt-3 flex items-center gap-1.5 text-sm text-red-600"><AlertCircle size={14} /> {state.saveError}</p>
                )}

                {/* Permanent failures (e.g. one-shot already used) drop the futile
                    "Retry save", but ALWAYS keep "Record again" so the learner is
                    never dead-ended. */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {!state.savePermanent && (
                    <Button onClick={() => dispatch({ type: "CONFIRM" })} disabled={!state.draft.text.trim()} className="flex-1">
                      <Check size={16} /> {state.saveError ? "Retry save" : "Confirm answer"}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => dispatch({ type: "RECORD_AGAIN" })} className="flex-1">
                    <RefreshCw size={15} /> Record again
                  </Button>
                </div>
              </div>
            )}

            {state.phase === "saving_answer" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" /> Saving your answer…</p>
            )}

            {state.phase === "answer_saved" && (
              <p className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 size={15} /> Answer saved.{" "}
                {finalizeError && (
                  <button className="ml-1 underline" onClick={() => dispatch({ type: "FINALIZED" })}>Retry finish</button>
                )}
              </p>
            )}

            {state.phase === "retrying" && (
              <div className="flex flex-col items-center gap-3">
                <p role="alert" className="flex items-center gap-1.5 text-sm text-amber-700"><AlertCircle size={14} /> {state.micError}</p>
                <div className="flex w-full gap-2">
                  {speechSupported && (
                    <Button className="flex-1" onClick={() => dispatch({ type: "LISTEN_START" })}><Mic size={16} /> Try again</Button>
                  )}
                  <ManualEntryButton value={manualText} setValue={setManualText} onSubmit={(t) => dispatch({ type: "MANUAL_SUBMIT", text: t })} className="flex-1" />
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Completed answers (read-only transcripts) */}
      {answeredCount > 0 && state.phase !== "completed" && (
        <div className="mb-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your answers so far</p>
          {steps
            .map((s) => ({ s, a: state.completed.find((x) => x.questionId === s.questionId) }))
            .filter((r) => r.a)
            .map(({ s, a }) => (
              <div key={s.questionId} className="rounded-2xl border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-foreground">{s.prompt}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{a!.transcriptText}</p>
              </div>
            ))}
        </div>
      )}

      <ScriptFooter script={script} />

      {/* Completed */}
      {state.phase === "completed" && (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100"><CheckCircle2 size={32} className="text-emerald-600" /></div>
          <h3 className="mb-2 font-display text-xl font-bold text-foreground">Speaking interview complete</h3>
          <p className="mb-6 text-sm text-muted-foreground">{script.closing}</p>
          <Button size="lg" className="w-full" onClick={onFinished}>{finishedCtaLabel} <ChevronRight size={18} /></Button>
        </div>
      )}

      {state.phase === "error" && (
        <ErrorState error={new Error(state.micError ?? "Something went wrong.")} onRetry={() => window.location.reload()} />
      )}
    </div>
  );
}

// ── small helpers ──────────────────────────────────────────────────────────────
/** Visible, auditable script identity. */
function ScriptFooter({ script }: { script: SpeakingInterview }) {
  return (
    <p className="mt-3 text-center text-[10px] text-muted-foreground/70">
      OneClub interview script {script.scriptId} · v{script.scriptVersion} · {script.language}
    </p>
  );
}

function statusLabel(phase: InterviewState["phase"]): string {
  switch (phase) {
    case "greeting":
    case "resuming":
    case "tutor_speaking":
    case "clarification":
      return "Speaking…";
    case "ready_to_listen":
      return "Your turn — record your answer";
    case "listening":
      return "Listening to you…";
    case "processing_transcript":
      return "Processing…";
    case "reviewing_transcript":
      return "Review your answer";
    case "saving_answer":
      return "Saving…";
    case "answer_saved":
      return "Answer saved";
    case "retrying":
      return "Let's try that again";
    case "completed":
      return "Interview complete";
    default:
      return "";
  }
}

function fmt(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function ManualEntry({ onSubmit, value, setValue }: { onSubmit: (t: string) => void; value: string; setValue: (v: string) => void }) {
  return (
    <div className="w-full">
      <Textarea aria-label="Type your answer" rows={2} placeholder="Type your answer…" value={value} onChange={(e) => setValue(e.target.value)} />
      <Button variant="soft" size="sm" className="mt-2 w-full" disabled={!value.trim()} onClick={() => { onSubmit(value); setValue(""); }}>
        <Pencil size={14} /> Use this answer
      </Button>
    </div>
  );
}

function ManualEntryButton({ onSubmit, value, setValue, className }: { onSubmit: (t: string) => void; value: string; setValue: (v: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  if (open) return <div className={className}><ManualEntry onSubmit={(t) => { onSubmit(t); setOpen(false); }} value={value} setValue={setValue} /></div>;
  return (
    <Button variant="ghost" className={className} onClick={() => setOpen(true)}><Pencil size={15} /> Type instead</Button>
  );
}
