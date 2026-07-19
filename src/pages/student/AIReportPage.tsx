import { useParams, Link } from "react-router";
import {
  Sparkles,
  ArrowRight,
  Calendar,
  Clock,
  BookOpen,
  MessageSquareQuote,
  ThumbsUp,
  AlertCircle,
  Lightbulb,
  Target,
  GraduationCap,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AIBadge } from "@/components/ai";
import { useReport, useRateSession, useSaveSessionNotes, useAcceptReport, useReportRegen } from "@/hooks";
import { useAuth } from "@/auth/AuthProvider";
import { Loading, ErrorState, EmptyState } from "@/components/states";
import type { SessionReportContent } from "@/api/types";
import { useState } from "react";
import { Star } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

// Pure presentation: renders the validated report DTO. No AI, no calculations.

function FeedbackCard({ title, body, icon }: { title: string; body: string; icon: React.ReactNode }) {
  const { tx } = useI18n();
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon} {tx(title)}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </Card>
  );
}

function BulletList({ title, items, icon, tone }: { title: string; items: string[]; icon: React.ReactNode; tone: string }) {
  const { tx } = useI18n();
  if (items.length === 0) return null;
  return (
    <Card className="p-5">
      <div className={`mb-3 flex items-center gap-2 text-sm font-semibold ${tone}`}>
        {icon} {tx(title)}
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current opacity-40" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function AIReportPage() {
  const { id = "" } = useParams();
  const query = useReport(id);

  if (query.isLoading) {
    return (
      <DashboardLayout>
        <Loading label="Loading your report…" />
      </DashboardLayout>
    );
  }
  if (query.isError || !query.data) {
    return (
      <DashboardLayout>
        <ErrorState error={query.error} onRetry={() => query.refetch()} title="Couldn’t load your report" />
      </DashboardLayout>
    );
  }

  const r = query.data;
  const content: SessionReportContent | null = r.content;

  // Still generating (pending) or no content yet → gentle waiting state.
  if (r.status !== "ready" || !content) {
    return (
      <DashboardLayout>
        <PageHeader title="Session report" subtitle={`${r.topicTitle} · with ${r.instructorName}`} back="/student" />
        <EmptyState
          title="Your report is being prepared"
          description="Your tutor report is being written from the session. This usually takes a moment — check back shortly."
          icon={<Sparkles size={26} className="text-purple-500" />}
          action={
            <Button variant="ghost" size="sm" onClick={() => query.refetch()}>
              Refresh
            </Button>
          }
        />
      </DashboardLayout>
    );
  }

  const date = new Date(r.sessionDate);
  const dateLabel = isNaN(date.getTime())
    ? r.sessionDate
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <DashboardLayout>
      <PageHeader
        title="Session report"
        subtitle={`${r.topicTitle} · with ${r.instructorName}`}
        back="/student"
        action={<AIBadge label="AI-generated" />}
      />

      {/* Hero: summary + confidence */}
      <div className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-600 p-6 text-white sm:p-8">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 flex items-center gap-3 text-xs text-indigo-100">
              <span className="flex items-center gap-1">
                <Calendar size={13} /> {dateLabel}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={13} /> {r.durationMinutes} min
              </span>
            </div>
            <h2 className="font-display text-xl font-extrabold">Session summary</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-indigo-50" data-testid="overall-summary">
              {content.overallSummary}
            </p>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-5xl font-extrabold" data-testid="confidence-score">
              {content.confidenceScore}
            </div>
            <div className="text-xs uppercase tracking-wide text-indigo-100">Confidence</div>
          </div>
        </div>
      </div>

      {/* Per-skill feedback */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FeedbackCard title="Grammar" body={content.grammarFeedback} icon={<BookOpen size={16} className="text-indigo-500" />} />
        <FeedbackCard title="Vocabulary" body={content.vocabularyFeedback} icon={<Sparkles size={16} className="text-purple-500" />} />
        <FeedbackCard title="Fluency" body={content.fluencyFeedback} icon={<MessageSquareQuote size={16} className="text-sky-500" />} />
        <FeedbackCard title="Pronunciation" body={content.pronunciationFeedback} icon={<GraduationCap size={16} className="text-emerald-500" />} />
      </div>

      {/* Strengths / weaknesses / topics / homework */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BulletList title="Strengths" items={content.strengths} icon={<ThumbsUp size={16} />} tone="text-emerald-600" />
        <BulletList title="To work on" items={content.weaknesses} icon={<AlertCircle size={16} />} tone="text-amber-600" />
        <BulletList title="Recommended topics" items={content.recommendedTopics} icon={<Lightbulb size={16} />} tone="text-indigo-600" />
        <BulletList title="Homework" items={content.homework} icon={<BookOpen size={16} />} tone="text-purple-600" />
      </div>

      {/* Next lesson focus */}
      <Card className="mt-6 border-indigo-100 bg-indigo-50/40 p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-700">
          <Target size={16} /> Focus for your next lesson
        </div>
        <p className="text-sm leading-relaxed text-foreground" data-testid="next-lesson-focus">
          {content.nextLessonFocus}
        </p>
      </Card>

      <InstructorReportControls sessionId={r.sessionId} />

      {r.bookingId && <RateSessionCard bookingId={r.bookingId} instructorName={r.instructorName} />}

      <Button asChild className="mt-6 w-full sm:w-auto">
        <Link to="/student/book">
          Book a follow-up session <ArrowRight size={16} />
        </Link>
      </Button>
    </DashboardLayout>
  );
}

/** Instructor/admin post-session tools: structured notes + accept / regenerate. */
function InstructorReportControls({ sessionId }: { sessionId: string }) {
  const { id = "" } = useParams();
  const { role } = useAuth();
  const save = useSaveSessionNotes(id);
  const accept = useAcceptReport(id);
  const regen = useReportRegen(id);
  const [notes, setNotes] = useState({ participation: "", strengths: "", weaknesses: "", homework: "", next_focus: "" });
  const set = (k: keyof typeof notes) => (e: { target: { value: string } }) => setNotes((n) => ({ ...n, [k]: e.target.value }));

  if (role !== "instructor" && role !== "admin") return null;

  const FIELDS: [keyof typeof notes, string][] = [
    ["participation", "Participation"], ["strengths", "Strengths"], ["weaknesses", "Weaknesses"],
    ["homework", "Homework"], ["next_focus", "Next focus"],
  ];

  return (
    <Card className="mt-6 p-6">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
        <GraduationCap size={16} className="text-indigo-600" /> Instructor tools
      </div>
      <p className="mb-4 text-xs text-muted-foreground">Your post-session notes and AI-report review.</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([k, label]) => (
          <label key={k} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {label}
            <Textarea rows={2} value={notes[k]} onChange={set(k)} />
          </label>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => save.mutate({ sessionId, notes })} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save notes"}
        </Button>
        <Button size="sm" variant="soft" onClick={() => accept.mutate({ sessionId })} disabled={accept.isPending}>
          {accept.isSuccess ? "Accepted ✓" : "Accept report"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => regen.mutate(sessionId)} disabled={regen.isPending}>
          {regen.isPending ? "Regenerating…" : "Regenerate"}
        </Button>
      </div>
      {save.isSuccess && <p className="mt-2 text-xs text-emerald-600">Notes saved ✓</p>}
    </Card>
  );
}

/** Lets the student rate the session (1–5) — feeds the instructor's rating. */
function RateSessionCard({ bookingId, instructorName }: { bookingId: string; instructorName: string }) {
  const rate = useRateSession();
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);

  if (done)
    return (
      <Card className="mt-6 border-emerald-100 bg-emerald-50/50 p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
          <Star size={16} className="fill-emerald-500 text-emerald-500" /> Thanks for rating your session!
        </p>
      </Card>
    );

  const submit = async () => {
    if (stars < 1) return;
    await rate.mutateAsync({ bookingId, stars, comment: comment.trim() });
    setDone(true);
  };

  return (
    <Card className="mt-6 p-5">
      <h3 className="mb-1 font-display font-bold text-foreground">Rate your session</h3>
      <p className="mb-3 text-sm text-muted-foreground">How was your session with {instructorName}?</p>
      <div className="mb-3 flex items-center gap-1" role="radiogroup" aria-label="Session rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            aria-pressed={stars === n}
            onClick={() => setStars(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <Star size={28} className={cn("transition-colors", (hover || stars) >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
          </button>
        ))}
      </div>
      <Textarea rows={2} placeholder="Add a comment (optional)…" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Session comment" />
      {rate.isError && <p role="alert" className="mt-2 text-sm text-red-600">Couldn't save your rating. Please try again.</p>}
      <Button className="mt-3" size="sm" disabled={stars < 1 || rate.isPending} onClick={submit}>
        {rate.isPending ? "Submitting…" : "Submit rating"}
      </Button>
    </Card>
  );
}
