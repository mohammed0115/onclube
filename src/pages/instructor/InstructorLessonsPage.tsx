import { useEffect, useState } from "react";
import { BookOpen, Check, Loader2, Save } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loading, EmptyState } from "@/components/states";
import { useInstructorLessons, usePrepareLesson } from "@/hooks";
import type { InstructorLessonSession } from "@/api/types";
import { useI18n } from "@/i18n";

function LessonCard({ session }: { session: InstructorLessonSession }) {
  const { tx } = useI18n();
  const prepare = usePrepareLesson();
  const [title, setTitle] = useState(session.lessonTitle);
  const [questions, setQuestions] = useState(session.lessonQuestions.join("\n"));
  const [saved, setSaved] = useState(false);

  // Keep local fields in sync if the query refetches.
  useEffect(() => {
    setTitle(session.lessonTitle);
    setQuestions(session.lessonQuestions.join("\n"));
  }, [session.lessonTitle, session.lessonQuestions]);

  const when = (() => {
    const d = new Date(session.scheduledAt);
    return isNaN(d.getTime())
      ? session.scheduledAt
      : d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  })();

  const onSave = () => {
    setSaved(false);
    prepare.mutate(
      { bookingId: session.bookingId, title, questions: questions.split("\n").map((q) => q.trim()).filter(Boolean) },
      { onSuccess: () => setSaved(true) }
    );
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-display text-sm font-bold text-foreground">{session.studentName}</div>
          <div className="text-xs text-muted-foreground">{when} · {session.durationMinutes} {tx("min")}</div>
        </div>
        {session.lessonPrepared ? (
          <Badge tone="emerald" className="gap-1"><Check size={12} /> {tx("Prepared")}</Badge>
        ) : (
          <Badge tone="amber">{tx("Not prepared")}</Badge>
        )}
      </div>

      <label className="mb-1 block text-xs font-semibold text-foreground">{tx("Lesson title")}</label>
      <input
        value={title}
        onChange={(e) => { setTitle(e.target.value); setSaved(false); }}
        placeholder={tx("e.g. Job interviews")}
        className="mb-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
      />

      <label className="mb-1 block text-xs font-semibold text-foreground">{tx("Discussion questions (one per line)")}</label>
      <textarea
        value={questions}
        onChange={(e) => { setQuestions(e.target.value); setSaved(false); }}
        rows={4}
        placeholder={tx("Tell me about yourself.\nWhat are your strengths?")}
        className="mb-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
      />

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={onSave} disabled={prepare.isPending}>
          {prepare.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {tx("Save lesson")}
        </Button>
        {saved && <span className="text-xs font-medium text-emerald-600">{tx("Saved ✓ — shared with the student 1 hour before")}</span>}
      </div>
    </Card>
  );
}

export function InstructorLessonsPage() {
  const { data, isLoading } = useInstructorLessons();
  const sessions = data ?? [];

  return (
    <DashboardLayout>
      <PageHeader
        title="Lesson prep"
        subtitle="Write the title and questions for each upcoming session. Students see them 1 hour before."
      />
      {isLoading ? (
        <Loading label="Loading sessions…" />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={26} className="text-muted-foreground" />}
          title="No upcoming sessions"
          description="Assigned sessions will appear here for you to prepare."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {sessions.map((s) => (
            <LessonCard key={s.bookingId} session={s} />
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
