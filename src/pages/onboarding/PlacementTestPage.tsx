import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Check, ChevronLeft, ChevronRight, Mic, PenLine, Sparkles } from "lucide-react";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AIBadge } from "@/components/ai";
import { Loading, ErrorState } from "@/components/states";
import { SpeakingInterview } from "@/components/placement/SpeakingInterview";
import {
  usePlacementTest,
  useSpeakingInterview,
  useInterviewSession,
  useSaveInterviewAnswer,
  useFinalizeInterview,
  usePlacementStatus,
  useStartPlacementAttempt,
  useSaveWrittenAnswers,
  useSubmitPlacement,
} from "@/hooks";
import { ApiError } from "@/api";
import { cn } from "@/lib/utils";

type Section = "written" | "spoken";

function messageForError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "spoken_attempt_used":
        return "You've already used your one spoken attempt. Ask an admin to reset it if you need another try.";
      case "placement_incomplete":
        return "Please answer every question in both sections before submitting.";
      case "invalid_placement_question":
        return "One of these questions is no longer available. Please reload the page.";
      case "placement_attempt_not_found":
        return "Your placement session expired. Please start again.";
      default:
        return typeof err.detail === "string" ? err.detail : err.message;
    }
  }
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

export function PlacementTestPage() {
  const navigate = useNavigate();
  const testQuery = usePlacementTest();
  const interviewQuery = useSpeakingInterview();
  const statusQuery = usePlacementStatus();
  const start = useStartPlacementAttempt();
  const saveWritten = useSaveWrittenAnswers();
  const submit = useSubmitPlacement();

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("written");
  // The interview session (resume state) is only needed once we reach the spoken step.
  const sessionQuery = useInterviewSession(section === "spoken" && !!attemptId);
  const saveInterviewAnswer = useSaveInterviewAnswer();
  const finalizeInterview = useFinalizeInterview();
  const [written, setWritten] = useState<Record<string, string>>({});
  const [writtenIndex, setWrittenIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const assessed = statusQuery.data?.assessed ?? false;

  // Start (or reuse) an attempt once the questions load — unless already assessed.
  useEffect(() => {
    if (!testQuery.data || assessed || startedRef.current) return;
    startedRef.current = true;
    start.mutate(undefined, {
      onSuccess: (a) => setAttemptId(a.id),
      onError: () => {
        startedRef.current = false;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testQuery.data, assessed]);

  if (testQuery.isLoading)
    return (
      <Shell>
        <Loading label="Preparing your placement…" />
      </Shell>
    );
  if (testQuery.isError)
    return (
      <Shell>
        <ErrorState error={testQuery.error} onRetry={() => testQuery.refetch()} />
      </Shell>
    );

  const test = testQuery.data!;

  // Already assessed → don't let the student redo it; offer the result.
  if (assessed) {
    return (
      <Shell>
        <Card className="rounded-3xl p-8 text-center">
          <h3 className="mb-2 font-display text-xl font-bold text-foreground">Placement complete</h3>
          <p className="mb-6 text-sm text-muted-foreground">
            You've already finished your placement interview.
          </p>
          <Button size="lg" className="w-full" onClick={() => navigate("/onboarding/placement-result")}>
            View my result <ChevronRight size={18} />
          </Button>
        </Card>
      </Shell>
    );
  }

  if (start.isPending || !attemptId)
    return (
      <Shell>
        <Loading label="Starting your attempt…" />
      </Shell>
    );
  if (start.isError)
    return (
      <Shell>
        <ErrorState
          error={start.error}
          onRetry={() => {
            startedRef.current = false;
            start.mutate(undefined, { onSuccess: (a) => setAttemptId(a.id) });
          }}
        />
      </Shell>
    );

  const onSaveWritten = async () => {
    setError(null);
    const answers = test.written.map((q) => ({ questionId: q.id, answerText: written[q.id] ?? "" }));
    const firstUnanswered = answers.findIndex((a) => !a.answerText);
    if (firstUnanswered >= 0) {
      setError("Please answer every written question.");
      setWrittenIndex(firstUnanswered); // take the student straight to it
      return;
    }
    try {
      await saveWritten.mutateAsync({ attemptId, answers });
      setSection("spoken");
    } catch (e) {
      setError(messageForError(e));
    }
  };

  // The interview's finish screen offers the existing next step (result).
  const onSeeResult = async () => {
    setError(null);
    try {
      await submit.mutateAsync();
      navigate("/onboarding/placement-result");
    } catch (e) {
      setError(messageForError(e));
    }
  };

  const busy = saveWritten.isPending || submit.isPending;

  // Written MCQ: one question at a time with prev/next.
  const totalWritten = test.written.length;
  const safeIndex = Math.min(writtenIndex, Math.max(0, totalWritten - 1));
  const currentWritten = test.written[safeIndex];
  const writtenAnsweredCount = test.written.filter((q) => written[q.id]).length;
  const isLastWritten = safeIndex >= totalWritten - 1;

  const selectWritten = (qid: string, option: string) => {
    setError(null);
    setWritten((w) => ({ ...w, [qid]: option }));
  };
  const goPrevWritten = () => {
    setError(null);
    setWrittenIndex((i) => Math.max(0, i - 1));
  };
  const goNextWritten = () => {
    if (!written[currentWritten.id]) {
      setError("Please choose an answer to continue.");
      return;
    }
    setError(null);
    setWrittenIndex((i) => Math.min(totalWritten - 1, i + 1));
  };

  return (
    <Shell>
      {/* Section indicator — one flow, two sections. */}
      <div className="mb-6 flex items-center gap-2">
        <SectionPill active={section === "written"} done={section === "spoken"} icon={<PenLine size={14} />} label="Written" />
        <div className="h-px flex-1 bg-border" />
        <SectionPill active={section === "spoken"} done={false} icon={<Mic size={14} />} label="Spoken" />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100">
          <Sparkles size={14} className="text-purple-600" />
        </div>
        <AIBadge label="AI placement" />
      </div>

      {section === "written" ? (
        <>
          {/* Progress indicator */}
          <div className="mb-5">
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>
                Question {safeIndex + 1} of {totalWritten}
              </span>
              <span>
                {writtenAnsweredCount}/{totalWritten} answered
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={writtenAnsweredCount}
              aria-valuemin={0}
              aria-valuemax={totalWritten}
            >
              <div
                className="h-full rounded-full bg-indigo-600 transition-all duration-300 ease-out"
                style={{ width: `${((safeIndex + 1) / totalWritten) * 100}%` }}
              />
            </div>
          </div>

          <p className="mb-4 text-sm text-muted-foreground">
            Choose the best word to complete each sentence. You can go back and change your answers.
          </p>

          <Card className="mb-4 rounded-3xl p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="font-display text-lg font-bold text-foreground">{currentWritten.prompt}</h3>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {currentWritten.skill}
              </span>
            </div>
            <fieldset
              role="radiogroup"
              aria-label={currentWritten.prompt}
              className="space-y-2.5"
              key={currentWritten.id}
            >
              {currentWritten.options.map((opt) => {
                const selected = written[currentWritten.id] === opt;
                return (
                  <label
                    key={opt}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors",
                      "focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-1",
                      selected
                        ? "border-indigo-600 bg-indigo-50 text-indigo-900"
                        : "border-border bg-background hover:border-indigo-300 hover:bg-muted/50"
                    )}
                  >
                    <input
                      type="radio"
                      name={`written-${currentWritten.id}`}
                      value={opt}
                      checked={selected}
                      onChange={() => selectWritten(currentWritten.id, opt)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                        selected ? "border-indigo-600 bg-indigo-600 text-white" : "border-muted-foreground/40"
                      )}
                    >
                      {selected && <Check size={12} strokeWidth={3} />}
                    </span>
                    <span className="font-medium">{opt}</span>
                  </label>
                );
              })}
            </fieldset>
          </Card>

          {error && <ErrorBanner>{error}</ErrorBanner>}

          <div className="flex gap-3">
            <Button
              variant="ghost"
              onClick={goPrevWritten}
              disabled={safeIndex === 0 || busy}
              className="flex-1"
              size="lg"
            >
              <ChevronLeft size={18} /> Previous
            </Button>
            {isLastWritten ? (
              <Button onClick={onSaveWritten} disabled={busy} className="flex-1" size="lg">
                {saveWritten.isPending ? "Saving…" : "Continue to spoken"} <ChevronRight size={18} />
              </Button>
            ) : (
              <Button onClick={goNextWritten} disabled={busy} className="flex-1" size="lg">
                Next <ChevronRight size={18} />
              </Button>
            )}
          </div>
        </>
      ) : interviewQuery.isLoading || sessionQuery.isLoading || !sessionQuery.data ? (
        <Loading label="Preparing your interview…" />
      ) : interviewQuery.isError ? (
        <ErrorState error={interviewQuery.error} onRetry={() => interviewQuery.refetch()} />
      ) : sessionQuery.isError ? (
        <ErrorState error={sessionQuery.error} onRetry={() => sessionQuery.refetch()} />
      ) : (
        <>
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <SpeakingInterview
            interview={interviewQuery.data!}
            session={sessionQuery.data}
            onAnswer={(input) =>
              saveInterviewAnswer.mutateAsync(input).catch((e) => {
                throw new Error(messageForError(e));
              })
            }
            onFinalize={() =>
              finalizeInterview.mutateAsync().catch((e) => {
                throw new Error(messageForError(e));
              })
            }
            onFinished={onSeeResult}
            finishedCtaLabel="See my result"
          />
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingLayout step={2} total={3}>
      <div className="mx-auto max-w-xl pt-4">{children}</div>
    </OnboardingLayout>
  );
}

function SectionPill({
  active,
  done,
  icon,
  label,
}: {
  active: boolean;
  done: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
        active ? "bg-indigo-600 text-white" : done ? "bg-indigo-100 text-indigo-700" : "bg-muted text-muted-foreground"
      )}
    >
      {icon} {label}
    </div>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50/60 px-4 py-3 text-sm text-red-700">
      {children}
    </div>
  );
}
