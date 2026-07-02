import { useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  Lock,
  Mic,
  MicOff,
  RefreshCw,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getSpeechProvider, type SpeechErrorKind } from "@/lib/speech";
import type {
  AnswerSource,
  InterviewAnswerInput,
  InterviewSession,
  SpeakingInterview as Interview,
} from "@/api/types";

type Stage = "welcome" | "interview" | "finished";
type RecordState = "idle" | "listening" | "captured" | "failed";
type AvatarState = "speaking" | "listening" | "thinking";

const MIC_ERROR_MESSAGES: Record<SpeechErrorKind, string> = {
  "not-supported": "Speech recognition isn't available in this browser — please type your answer below.",
  "permission-denied": "Microphone access was blocked. Allow it in your browser, or type your answer below.",
  "mic-unavailable": "We couldn't reach your microphone. Please type your answer below.",
  "no-speech": "We didn't catch that. Record again, or type your answer below.",
  network: "Your connection dropped during recording. Try again, or type your answer below.",
  aborted: "Recording was cancelled. Try again, or type your answer below.",
  unknown: "Something interrupted the recording. Try again, or type your answer below.",
};

interface SpeakingInterviewProps {
  interview: Interview;
  /** Resume state: lifecycle status, resume index, and captured answers so far. */
  session: InterviewSession;
  /** Persist ONE answer (with source). Resolve with the updated session. */
  onAnswer: (input: InterviewAnswerInput) => Promise<InterviewSession>;
  /** Finalize once every question is answered. */
  onFinalize: () => Promise<InterviewSession>;
  /** Optional next step shown on the finish screen (e.g. view result). */
  onFinished?: () => void;
  finishedCtaLabel?: string;
}

export function SpeakingInterview({
  interview,
  session,
  onAnswer,
  onFinalize,
  onFinished,
  finishedCtaLabel = "Continue",
}: SpeakingInterviewProps) {
  const steps = interview.steps;
  const total = steps.length;
  const savedByQuestion = new Map(session.answers.map((a) => [a.questionId, a]));

  const clampedStart = Math.min(session.currentQuestionIndex, Math.max(0, total - 1));

  // Per-question working state, initialized from any saved answer (resume).
  const stateForIndex = (i: number): { text: string; source: AnswerSource; rec: RecordState } => {
    const q = steps[i];
    const saved = q ? savedByQuestion.get(q.questionId) : undefined;
    if (!saved) return { text: "", source: "manual", rec: "idle" };
    return { text: saved.transcriptText, source: saved.source, rec: saved.source === "voice" ? "captured" : "failed" };
  };

  const initialStage: Stage =
    session.status === "finalized"
      ? "finished"
      : session.status === "created" && session.answers.length === 0
      ? "welcome"
      : "interview";

  const initial = stateForIndex(clampedStart);
  const [stage, setStage] = useState<Stage>(initialStage);
  const [index, setIndex] = useState(clampedStart);
  const [text, setText] = useState(initial.text);
  const [source, setSource] = useState<AnswerSource>(initial.source);
  const [recordState, setRecordState] = useState<RecordState>(initial.rec);
  const [micError, setMicError] = useState<string | null>(null);
  const [showClarify, setShowClarify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = steps[index];
  const isLast = index >= total - 1;

  const avatarState: AvatarState = busy
    ? "thinking"
    : recordState === "listening"
    ? "listening"
    : "speaking";

  const startRecording = () => {
    setMicError(null);
    setRecordState("listening");
    getSpeechProvider().start({
      onResult: (transcript) => {
        const clean = (transcript ?? "").trim();
        if (!clean) {
          setRecordState("failed");
          setSource("manual");
          setMicError(MIC_ERROR_MESSAGES["no-speech"]);
          return;
        }
        setText(clean);
        setSource("voice"); // recognition succeeded → locked
        setRecordState("captured");
      },
      onError: (kind) => {
        setRecordState("failed");
        setSource("manual"); // fallback → student may type
        setMicError(MIC_ERROR_MESSAGES[kind]);
      },
      onEnd: () => setRecordState((s) => (s === "listening" ? "failed" : s)),
    });
  };

  const stopRecording = () => getSpeechProvider().stop();

  const goToQuestion = (i: number) => {
    const st = stateForIndex(i);
    setIndex(i);
    setText(st.text);
    setSource(st.source);
    setRecordState(st.rec);
    setMicError(null);
    setShowClarify(false);
    setError(null);
  };

  const submitCurrent = async () => {
    const clean = text.trim();
    if (!clean) {
      // Always let the student proceed: reveal the manual fallback and ask.
      setRecordState("failed");
      setSource("manual");
      setMicError("Please record or type your answer to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAnswer({ questionId: step.questionId, transcriptText: clean, source });
      if (isLast) {
        await onFinalize();
        setStage("finished");
      } else {
        goToQuestion(index + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // ── welcome ─────────────────────────────────────────────────────────────────
  if (stage === "welcome") {
    return (
      <div>
        <InterviewerAvatar state="speaking" />
        <Card className="mt-4 rounded-3xl p-6">
          <h3 className="mb-2 font-display text-lg font-bold text-foreground">{interview.greeting}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{interview.instructions}</p>
        </Card>
        <Button size="lg" className="mt-5 w-full" onClick={() => setStage("interview")}>
          Start interview <ChevronRight size={18} />
        </Button>
      </div>
    );
  }

  // ── finished ────────────────────────────────────────────────────────────────
  if (stage === "finished") {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 size={32} className="text-emerald-600" />
        </div>
        <h3 className="mb-2 font-display text-xl font-bold text-foreground">Interview complete</h3>
        <p className="mb-1 text-sm text-muted-foreground">{interview.closing}</p>
        <p className="mb-6 text-xs text-muted-foreground">Your transcript has been finalized and saved.</p>
        {onFinished && (
          <Button size="lg" className="w-full" onClick={onFinished}>
            {finishedCtaLabel} <ChevronRight size={18} />
          </Button>
        )}
      </div>
    );
  }

  // ── interview ───────────────────────────────────────────────────────────────
  const listening = recordState === "listening";
  const captured = recordState === "captured";
  const failed = recordState === "failed";

  return (
    <div>
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Question {index + 1} of {total}</span>
          <span>{avatarStatusLabel(avatarState)}</span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={index + 1}
          aria-valuemin={1}
          aria-valuemax={total}
        >
          <div
            className="h-full rounded-full bg-indigo-600 transition-all duration-300 ease-out"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      <InterviewerAvatar state={avatarState} />

      <Card className="mt-4 rounded-3xl p-6">
        <p className="mb-1 text-xs font-medium text-indigo-600">{step.preamble}</p>
        <h3 className="font-display text-lg font-bold text-foreground">{step.prompt}</h3>

        <button
          type="button"
          onClick={() => setShowClarify((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-indigo-600"
        >
          <Volume2 size={13} /> Repeat / rephrase the question
        </button>
        {showClarify && (
          <p className="mt-1.5 rounded-xl bg-muted/60 px-3 py-2 text-sm text-foreground">{step.clarification}</p>
        )}

        <div className="mt-4" aria-live="polite">
          {listening && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
              </span>
              Recording… speak your answer now.
            </div>
          )}
          {captured && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <CheckCircle2 size={14} /> Answer captured
                <span className="ml-1 inline-flex items-center gap-1 text-muted-foreground">
                  <Lock size={11} /> voice · locked
                </span>
              </p>
              <p
                aria-label={`Your answer to: ${step.prompt}`}
                className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground"
              >
                {text}
              </p>
            </div>
          )}
          {failed && (
            <div>
              {micError && (
                <p role="alert" className="mb-2 text-sm text-red-700">
                  {micError}
                </p>
              )}
              <Textarea
                aria-label={`Your answer to: ${step.prompt}`}
                rows={3}
                placeholder="Type your answer…"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setSource("manual");
                }}
              />
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {recordState === "idle" && (
            <Button variant="soft" onClick={startRecording}>
              <Mic size={16} /> Record answer
            </Button>
          )}
          {listening && (
            <Button variant="soft" onClick={stopRecording}>
              <MicOff size={16} /> Stop recording
            </Button>
          )}
          {(captured || failed) && (
            <Button variant="ghost" onClick={startRecording}>
              <RefreshCw size={15} /> Retry recording
            </Button>
          )}
        </div>
      </Card>

      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-red-100 bg-red-50/60 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <Button size="lg" className="mt-4 w-full" onClick={submitCurrent} disabled={busy}>
        {busy ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Saving…
          </>
        ) : isLast ? (
          <>Finish interview <ChevronRight size={18} /></>
        ) : (
          <>Continue <ChevronRight size={18} /></>
        )}
      </Button>
    </div>
  );
}

function avatarStatusLabel(state: AvatarState): string {
  if (state === "listening") return "Listening…";
  if (state === "thinking") return "Thinking…";
  return "Interviewer speaking";
}

function InterviewerAvatar({ state }: { state: AvatarState }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "relative flex h-12 w-12 items-center justify-center rounded-full text-white transition-colors",
          state === "listening" ? "bg-red-500" : state === "thinking" ? "bg-amber-500" : "bg-indigo-600"
        )}
      >
        {state === "listening" ? (
          <Mic size={20} />
        ) : state === "thinking" ? (
          <Loader2 size={20} className="animate-spin" />
        ) : (
          <Volume2 size={20} />
        )}
        {state === "speaking" && <span className="absolute inset-0 rounded-full ring-2 ring-indigo-300/60" aria-hidden />}
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Interviewer</p>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {avatarStatusLabel(state)}
        </p>
      </div>
    </div>
  );
}
