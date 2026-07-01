import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft, ChevronRight, Mic, PenLine, Sparkles } from "lucide-react";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AIBadge } from "@/components/ai";
import { Loading, ErrorState } from "@/components/states";
import {
  usePlacementTest,
  usePlacementStatus,
  useStartPlacementAttempt,
  useSaveWrittenAnswers,
  useSaveSpokenTranscripts,
  useSubmitPlacement,
} from "@/hooks";
import { ApiError } from "@/api";
import type { PlacementQuestionItem } from "@/api/types";
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
  const statusQuery = usePlacementStatus();
  const start = useStartPlacementAttempt();
  const saveWritten = useSaveWrittenAnswers();
  const saveSpoken = useSaveSpokenTranscripts();
  const submit = useSubmitPlacement();

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("written");
  const [written, setWritten] = useState<Record<string, string>>({});
  const [spoken, setSpoken] = useState<Record<string, string>>({});
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
    const answers = test.written.map((q) => ({ questionId: q.id, answerText: (written[q.id] ?? "").trim() }));
    if (answers.some((a) => !a.answerText)) {
      setError("Please answer every written question.");
      return;
    }
    try {
      await saveWritten.mutateAsync({ attemptId, answers });
      setSection("spoken");
    } catch (e) {
      setError(messageForError(e));
    }
  };

  const onSubmit = async () => {
    setError(null);
    const transcripts = test.spoken.map((q) => ({
      questionId: q.id,
      transcriptText: (spoken[q.id] ?? "").trim(),
    }));
    if (transcripts.some((t) => !t.transcriptText)) {
      setError("Please add a transcript for every spoken question.");
      return;
    }
    try {
      await saveSpoken.mutateAsync({ attemptId, transcripts });
      await submit.mutateAsync();
      navigate("/onboarding/placement-result");
    } catch (e) {
      setError(messageForError(e));
    }
  };

  const busy = saveWritten.isPending || saveSpoken.isPending || submit.isPending;

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
          <p className="mb-5 text-sm text-muted-foreground">
            Answer each question in a sentence or two. You can revise these before moving on.
          </p>
          {test.written.map((q, i) => (
            <QuestionCard key={q.id} index={i} question={q}>
              <Textarea
                aria-label={q.prompt}
                rows={3}
                placeholder="Type your answer…"
                value={written[q.id] ?? ""}
                onChange={(e) => setWritten((w) => ({ ...w, [q.id]: e.target.value }))}
              />
            </QuestionCard>
          ))}
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <div className="flex gap-3">
            <Button onClick={onSaveWritten} disabled={busy} className="flex-1" size="lg">
              {saveWritten.isPending ? "Saving…" : "Continue to spoken"} <ChevronRight size={18} />
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            These are fixed spoken prompts. For now, type what you would say — your{" "}
            <span className="font-medium text-foreground">voice answer transcript</span>.
          </p>
          <p className="mb-5 text-xs text-muted-foreground">
            Microphone &amp; speech-to-text arrive in a later phase; scoring is on the transcript text only.
          </p>
          {test.spoken.map((q, i) => (
            <QuestionCard key={q.id} index={i} question={q}>
              <label className="mb-1.5 block text-xs font-semibold text-indigo-600">
                Voice answer transcript
              </label>
              <Textarea
                aria-label={`Voice answer transcript: ${q.prompt}`}
                rows={3}
                placeholder="Type your spoken answer as text…"
                value={spoken[q.id] ?? ""}
                onChange={(e) => setSpoken((s) => ({ ...s, [q.id]: e.target.value }))}
              />
            </QuestionCard>
          ))}
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setSection("written")} disabled={busy} className="flex-1" size="lg">
              <ChevronLeft size={18} /> Back
            </Button>
            <Button onClick={onSubmit} disabled={busy} className="flex-1" size="lg">
              {busy ? "Submitting…" : "Submit & see result"} <ChevronRight size={18} />
            </Button>
          </div>
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

function QuestionCard({
  index,
  question,
  children,
}: {
  index: number;
  question: PlacementQuestionItem;
  children: React.ReactNode;
}) {
  return (
    <Card className="mb-4 rounded-3xl p-6">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="font-display text-base font-bold text-foreground">
          {index + 1}. {question.prompt}
        </h3>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {question.skill}
        </span>
      </div>
      {children}
    </Card>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50/60 px-4 py-3 text-sm text-red-700">
      {children}
    </div>
  );
}
