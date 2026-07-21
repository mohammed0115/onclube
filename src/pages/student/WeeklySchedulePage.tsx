import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { CalendarClock, Check, Loader2, Lock, Save, Sparkles, ArrowRight, Info, Clock } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/states";
import { useSubscription, useStudentSchedule, useSetStudentSchedule } from "@/hooks";
import type { SetScheduleResult, ScheduleReviewStatus } from "@/api/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

// Backend weekday: 0 = Monday … 6 = Sunday.
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00 – 22:00

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

const STATUS_TONE: Record<ScheduleReviewStatus, "amber" | "emerald" | "red"> = {
  pending: "amber",
  approved: "emerald",
  rejected: "red",
};
const STATUS_LABEL: Record<ScheduleReviewStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Needs changes",
};

interface Cell {
  weekday: number;
  hour: number;
}

function LockedScreen() {
  const { tx } = useI18n();
  return (
    <DashboardLayout>
      <PageHeader title="My weekly availability" subtitle="Set the times you're free to practise each week." />
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
          <Lock size={26} className="text-amber-600" />
        </div>
        <h2 className="font-display text-xl font-bold text-foreground">{tx("Scheduling is locked")}</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
          {tx("You can set your weekly availability once an admin approves your payment.")}
        </p>
        <Button asChild className="mt-6">
          <Link to="/billing/under-review">
            {tx("Check payment status")} <ArrowRight size={16} />
          </Link>
        </Button>
      </Card>
    </DashboardLayout>
  );
}

export function WeeklySchedulePage() {
  const { tx, lang } = useI18n();
  const sub = useSubscription();
  const scheduleQuery = useStudentSchedule();
  const save = useSetStudentSchedule();

  const [cells, setCells] = useState<Cell[]>([]);
  const [result, setResult] = useState<SetScheduleResult | null>(null);

  // Seed the editable cells once from the saved availability.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!seeded && scheduleQuery.data) {
      setCells(
        scheduleQuery.data.schedule.map((p) => ({ weekday: p.weekday, hour: Number(p.startTime.slice(0, 2)) }))
      );
      setSeeded(true);
    }
  }, [scheduleQuery.data, seeded]);

  const cellAt = (weekday: number, hour: number) => cells.find((c) => c.weekday === weekday && c.hour === hour);

  const toggleCell = (weekday: number, hour: number) => {
    setResult(null);
    setCells((prev) =>
      prev.some((c) => c.weekday === weekday && c.hour === hour)
        ? prev.filter((c) => !(c.weekday === weekday && c.hour === hour))
        : [...prev, { weekday, hour }]
    );
  };

  const onSave = () => {
    setResult(null);
    save.mutate(
      cells.map((c) => ({ weekday: c.weekday, startTime: hh(c.hour) })),
      {
        onSuccess: (res) => {
          setResult(res);
          scheduleQuery.refetch();
        },
      }
    );
  };

  const upcoming = scheduleQuery.data?.upcoming ?? [];
  const savedPicks = scheduleQuery.data?.schedule ?? [];
  const fmtWhen = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? iso
      : d.toLocaleString(lang === "ar" ? "ar" : undefined, { weekday: "long", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const selectedCount = useMemo(() => cells.length, [cells]);

  if (sub.isLoading) {
    return (
      <DashboardLayout>
        <Loading label="Checking your subscription…" />
      </DashboardLayout>
    );
  }
  if (sub.data?.status !== "active") return <LockedScreen />;

  return (
    <DashboardLayout>
      <PageHeader
        title="My weekly availability"
        subtitle="Tap the times you're free each week. We assign the best available instructor and book your sessions after review — your instructor shares the lesson before each session."
        action={
          <Button size="sm" onClick={onSave} disabled={save.isPending}>
            {save.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {tx("Save availability")}
          </Button>
        }
      />

      {sub.data && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Badge tone="emerald">{sub.data.sessionsRemaining} {tx("sessions left")}</Badge>
          <span className="text-xs text-muted-foreground">
            {tx("Each chosen time uses one session per week until your credits run out.")}
          </span>
        </div>
      )}

      {result && !save.isPending && (
        <div className="mb-4 space-y-2">
          {result.pendingReview > 0 && (
            <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700">
              {tx("Saved ✓")} — {result.pendingReview} {tx("time(s) sent to the team for review. You'll be notified once an instructor is assigned.")}
            </p>
          )}
          {result.generated.created > 0 && (
            <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
              {result.generated.created} {tx("upcoming session(s) booked")}
              {result.generated.outOfCredits && <span className="ml-1 text-amber-700">· {tx("you've used all your credits")}</span>}
            </p>
          )}
        </div>
      )}
      {save.isError && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600">
          {tx("Could not save. Please try again.")}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        {/* Availability grid */}
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info size={13} /> {tx("Tap the times you can attend each week")}
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[36rem]">
              <div className="grid grid-cols-[3rem_repeat(7,1fr)] gap-1 pb-1">
                <div />
                {WEEKDAYS.map((d) => (
                  <div key={d} className="text-center text-[11px] font-semibold uppercase text-muted-foreground">
                    {tx(d)}
                  </div>
                ))}
              </div>
              <div className="max-h-[30rem] space-y-1 overflow-y-auto pr-1">
                {HOURS.map((h) => (
                  <div key={h} className="grid grid-cols-[3rem_repeat(7,1fr)] gap-1">
                    <div className="flex items-center justify-end pr-1 text-[11px] font-medium text-muted-foreground">
                      {hh(h)}
                    </div>
                    {WEEKDAYS.map((_, wd) => {
                      const on = !!cellAt(wd, h);
                      return (
                        <button
                          key={wd}
                          onClick={() => toggleCell(wd, h)}
                          title={on ? tx("Tap to remove") : tx("Tap to add")}
                          className={cn(
                            "flex h-9 items-center justify-center rounded-lg border text-[10px] font-semibold transition-all",
                            on
                              ? "border-indigo-300 bg-indigo-500 text-white"
                              : "border-border bg-card text-muted-foreground hover:border-indigo-300 hover:bg-indigo-50"
                          )}
                        >
                          {on ? <Check size={13} /> : "+"}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {selectedCount > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              {selectedCount} {tx("weekly time(s) selected")}
            </p>
          )}
        </Card>

        {/* Review status + upcoming sessions */}
        <div className="space-y-6">
          {savedPicks.length > 0 && (
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Check size={16} className="text-indigo-600" /> {tx("Review status")}
              </div>
              <div className="space-y-2">
                {savedPicks.map((p) => (
                  <div key={p.id} className="flex items-start justify-between gap-2 rounded-xl border border-border p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">
                        {tx(WEEKDAYS[p.weekday] ?? "—")} · {p.startTime}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.instructorName ? p.instructorName : tx("Assigning an instructor…")}
                      </div>
                      {p.reviewStatus === "rejected" && p.reviewNote && (
                        <div className="mt-1 text-xs text-red-600">{p.reviewNote}</div>
                      )}
                    </div>
                    <Badge tone={STATUS_TONE[p.reviewStatus]} className="flex-shrink-0">
                      {tx(STATUS_LABEL[p.reviewStatus])}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <CalendarClock size={16} className="text-indigo-600" /> {tx("Upcoming sessions")}
            </div>
            {scheduleQuery.isLoading ? (
              <Loading label="Loading…" />
            ) : upcoming.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                <Sparkles size={18} className="mx-auto mb-2 text-indigo-400" />
                {tx("Pick some times and save — your sessions appear here after review.")}
              </div>
            ) : (
              <div className="space-y-2">
                {upcoming.map((b) => (
                  <Link
                    key={b.bookingId}
                    to={`/student/session/${b.bookingId}`}
                    className="block rounded-xl border border-border p-3 transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
                  >
                    <div className="text-sm font-semibold text-foreground">
                      {b.lessonRevealed && b.lessonTitle ? b.lessonTitle : `${tx("Session with")} ${b.instructorName}`}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{fmtWhen(b.scheduledAt)}</div>
                    {b.lessonRevealed ? (
                      b.lessonQuestions.length > 0 && (
                        <ul className="mt-2 list-disc space-y-0.5 ps-4 text-xs text-slate-600">
                          {b.lessonQuestions.slice(0, 5).map((q, i) => (
                            <li key={i}>{q}</li>
                          ))}
                        </ul>
                      )
                    ) : (
                      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock size={11} />
                        {b.lessonReady
                          ? tx("Lesson ready — unlocks 1 hour before the session")
                          : tx("Your instructor will share the lesson before the session")}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
