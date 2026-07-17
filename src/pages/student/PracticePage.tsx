import { useMemo, useState } from "react";
import { BookMarked, MessageSquareText, GraduationCap, RefreshCw, Check, ArrowRight, Sparkles } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/states";
import { usePractice, useStudentDashboard, useReport } from "@/hooks";
import { cn } from "@/lib/utils";

/** Between-session practice hub: homework from your last report, vocabulary
 * flashcards, and conversation phrases to rehearse aloud. */
export function PracticePage() {
  const practice = usePractice();
  const dash = useStudentDashboard();
  const latestReportId = dash.data?.recentSessions.find((b) => b.reportId)?.reportId ?? null;
  const report = useReport(latestReportId ?? "");
  const homework: string[] = (report.data?.content?.homework as string[] | undefined) ?? [];

  return (
    <DashboardLayout>
      <PageHeader title="Practice" subtitle="Keep improving between your live sessions." />

      <div className="mx-auto max-w-3xl space-y-6">
        {/* Homework from the latest AI report */}
        <Card className="p-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <GraduationCap size={16} className="text-indigo-600" /> Homework from your last session
          </div>
          {latestReportId && homework.length > 0 ? (
            <HomeworkChecklist items={homework} />
          ) : (
            <p className="text-sm text-muted-foreground">
              After your next session, your AI tutor's recommended drills will appear here to work through.
            </p>
          )}
        </Card>

        {practice.isLoading ? (
          <Loading label="Loading practice material…" />
        ) : (
          <>
            <Flashcards words={practice.data?.vocabulary ?? []} />
            <PracticePhrases phrases={practice.data?.phrases ?? []} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function HomeworkChecklist({ items }: { items: string[] }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setDone((s) => {
      const n = new Set(s);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  return (
    <div className="space-y-2">
      <p className="mb-1 text-xs text-muted-foreground">{done.size}/{items.length} done</p>
      {items.map((h, i) => (
        <button
          key={i}
          onClick={() => toggle(i)}
          className="flex w-full items-start gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted/40"
        >
          <span className={cn("mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border", done.has(i) ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/40")}>
            {done.has(i) && <Check size={13} strokeWidth={3} />}
          </span>
          <span className={cn("text-sm", done.has(i) ? "text-muted-foreground line-through" : "text-foreground")}>{h}</span>
        </button>
      ))}
    </div>
  );
}

function Flashcards({ words }: { words: string[] }) {
  const [i, setI] = useState(0);
  const [known, setKnown] = useState<Set<string>>(new Set());
  const word = words[i];

  if (words.length === 0) return null;

  const next = (learned: boolean) => {
    if (learned) setKnown((s) => new Set(s).add(word));
    setI((n) => (n + 1) % words.length);
  };

  return (
    <Card className="p-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <BookMarked size={16} className="text-purple-600" /> Vocabulary
        </div>
        <span className="text-xs text-muted-foreground">{known.size}/{words.length} marked known</span>
      </div>
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-purple-50/50 py-10">
        <span className="font-display text-2xl font-bold text-foreground">{word}</span>
        <span className="text-xs text-muted-foreground">Try to use it in a sentence out loud.</span>
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={() => next(false)}>
          <RefreshCw size={15} /> Review again
        </Button>
        <Button className="flex-1" onClick={() => next(true)}>
          <Check size={15} /> I know it
        </Button>
      </div>
    </Card>
  );
}

function PracticePhrases({ phrases }: { phrases: string[] }) {
  const shuffled = useMemo(() => phrases, [phrases]);
  const [i, setI] = useState(0);
  if (shuffled.length === 0) return null;
  return (
    <Card className="p-6">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <MessageSquareText size={16} className="text-sky-600" /> Speaking practice
      </div>
      <div className="flex items-center gap-2 rounded-2xl bg-sky-50/60 px-5 py-6">
        <Sparkles size={16} className="flex-shrink-0 text-sky-500" />
        <p className="text-base font-medium text-foreground">{shuffled[i]}</p>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Answer this out loud as if you were in a session.</p>
      <Button variant="soft" size="sm" className="mt-3" onClick={() => setI((n) => (n + 1) % shuffled.length)}>
        Next phrase <ArrowRight size={15} />
      </Button>
    </Card>
  );
}
