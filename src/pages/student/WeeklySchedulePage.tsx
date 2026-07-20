import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { CalendarClock, Check, Loader2, Lock, Save, Sparkles, ArrowRight, Info } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loading, ErrorState, EmptyState } from "@/components/states";
import {
  useSubscription,
  useStudentTopics,
  useStudentSchedule,
  useScheduleWindows,
  useSetStudentSchedule,
} from "@/hooks";
import type { ScheduleGenerationSummary } from "@/api/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

// Backend weekday: 0 = Monday … 6 = Sunday.
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00 – 22:00

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const cellKey = (weekday: number, hour: number) => `${weekday}-${hour}`;

interface Pick {
  weekday: number;
  hour: number;
  topicId: string;
  topicTitle: string;
  instructorName: string;
}

function LockedScreen() {
  const { tx } = useI18n();
  return (
    <DashboardLayout>
      <PageHeader title="My weekly schedule" subtitle="Set the times you want to practise each week." />
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
          <Lock size={26} className="text-amber-600" />
        </div>
        <h2 className="font-display text-xl font-bold text-foreground">{tx("Scheduling is locked")}</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
          {tx("You can build your weekly schedule once an admin approves your payment.")}
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
  const { tx } = useI18n();
  const sub = useSubscription();
  const topicsQuery = useStudentTopics();
  const scheduleQuery = useStudentSchedule();
  const save = useSetStudentSchedule();

  const topics = topicsQuery.data ?? [];
  const [topicId, setTopicId] = useState<string>("");
  const [picks, setPicks] = useState<Pick[]>([]);
  const [summary, setSummary] = useState<ScheduleGenerationSummary | null>(null);

  // Default the topic selector to the first available topic.
  useEffect(() => {
    if (!topicId && topics.length) setTopicId(topics[0].id);
  }, [topics, topicId]);

  // Seed the editable picks once from the saved schedule.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!seeded && scheduleQuery.data) {
      setPicks(
        scheduleQuery.data.schedule.map((p) => ({
          weekday: p.weekday,
          hour: Number(p.startTime.slice(0, 2)),
          topicId: p.topicId,
          topicTitle: p.topicTitle,
          instructorName: p.instructorName,
        }))
      );
      setSeeded(true);
    }
  }, [scheduleQuery.data, seeded]);

  const selectedTopic = topics.find((t) => t.id === topicId);
  const windowsQuery = useScheduleWindows(topicId);

  // Which hours are inside the selected topic's instructor availability.
  const isAllowed = useMemo(() => {
    const data = windowsQuery.data;
    return (weekday: number, hour: number): boolean => {
      if (!data) return false;
      if (data.windows.length === 0) return true; // instructor available all week
      return data.windows.some(
        (w) => w.weekday === weekday && hour >= Number(w.startTime.slice(0, 2)) && hour < Number(w.endTime.slice(0, 2))
      );
    };
  }, [windowsQuery.data]);

  const pickAt = (weekday: number, hour: number) => picks.find((p) => p.weekday === weekday && p.hour === hour);

  const toggleCell = (weekday: number, hour: number) => {
    setSummary(null);
    const existing = pickAt(weekday, hour);
    if (existing) {
      setPicks((prev) => prev.filter((p) => !(p.weekday === weekday && p.hour === hour)));
      return;
    }
    if (!selectedTopic || !isAllowed(weekday, hour)) return;
    setPicks((prev) => [
      ...prev,
      {
        weekday,
        hour,
        topicId: selectedTopic.id,
        topicTitle: selectedTopic.title,
        instructorName: selectedTopic.instructorName,
      },
    ]);
  };

  const onSave = () => {
    setSummary(null);
    save.mutate(
      picks.map((p) => ({ weekday: p.weekday, startTime: hh(p.hour), topicId: p.topicId })),
      {
        onSuccess: (res) => {
          setSummary(res.generated);
          scheduleQuery.refetch();
        },
      }
    );
  };

  if (sub.isLoading) {
    return (
      <DashboardLayout>
        <Loading label="Checking your subscription…" />
      </DashboardLayout>
    );
  }
  if (sub.data?.status !== "active") return <LockedScreen />;

  const upcoming = scheduleQuery.data?.upcoming ?? [];
  const fmtWhen = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? iso
      : d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="My weekly schedule"
        subtitle="Choose a topic, then tap the times you want to practise it each week. We create your sessions automatically."
        action={
          <Button size="sm" onClick={onSave} disabled={save.isPending}>
            {save.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {tx("Save schedule")}
          </Button>
        }
      />

      {sub.data && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Badge tone="emerald">{sub.data.sessionsRemaining} {tx("sessions left")}</Badge>
          <span className="text-xs text-muted-foreground">
            {tx("Each picked time uses one session per week until your credits run out.")}
          </span>
        </div>
      )}

      {summary && !save.isPending && (
        <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
          {tx("Saved ✓")} — {summary.created} {tx("upcoming session(s) booked")}
          {summary.outOfCredits && <span className="ml-1 text-amber-700">· {tx("you've used all your credits")}</span>}
        </p>
      )}
      {save.isError && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600">
          {tx("Could not save. One of your times may be outside the instructor's hours.")}
        </p>
      )}

      {topicsQuery.isLoading && <Loading label="Loading topics…" />}
      {topicsQuery.data && topics.length === 0 && (
        <EmptyState title="No topics available yet" description="Check back soon — instructors are preparing new topics." />
      )}

      {topics.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
          {/* Weekly grid */}
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                {tx("Topic")}
                <select
                  value={topicId}
                  onChange={(e) => setTopicId(e.target.value)}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} · {t.instructorName}
                    </option>
                  ))}
                </select>
              </label>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info size={13} /> {tx("Greyed times are outside the instructor's hours")}
              </span>
            </div>

            {windowsQuery.isLoading ? (
              <Loading label="Loading available hours…" />
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[36rem]">
                  {/* Header row */}
                  <div className="grid grid-cols-[3rem_repeat(7,1fr)] gap-1 pb-1">
                    <div />
                    {WEEKDAYS.map((d) => (
                      <div key={d} className="text-center text-[11px] font-semibold uppercase text-muted-foreground">
                        {d}
                      </div>
                    ))}
                  </div>
                  {/* Hour rows */}
                  <div className="max-h-[30rem] space-y-1 overflow-y-auto pr-1">
                    {HOURS.map((h) => (
                      <div key={h} className="grid grid-cols-[3rem_repeat(7,1fr)] gap-1">
                        <div className="flex items-center justify-end pr-1 text-[11px] font-medium text-muted-foreground">
                          {hh(h)}
                        </div>
                        {WEEKDAYS.map((_, wd) => {
                          const p = pickAt(wd, h);
                          const allowed = isAllowed(wd, h);
                          const mine = p && selectedTopic && p.topicId === selectedTopic.id;
                          return (
                            <button
                              key={wd}
                              onClick={() => toggleCell(wd, h)}
                              disabled={!p && !allowed}
                              title={p ? `${p.topicTitle} · ${p.instructorName}` : allowed ? tx("Tap to add") : tx("Unavailable")}
                              className={cn(
                                "flex h-9 items-center justify-center rounded-lg border text-[10px] font-semibold transition-all",
                                p
                                  ? mine
                                    ? "border-indigo-300 bg-indigo-500 text-white"
                                    : "border-emerald-300 bg-emerald-500 text-white"
                                  : allowed
                                    ? "border-border bg-card text-muted-foreground hover:border-indigo-300 hover:bg-indigo-50"
                                    : "cursor-not-allowed border-transparent bg-muted/50 text-muted-foreground/30"
                              )}
                            >
                              {p ? <Check size={13} /> : allowed ? "+" : ""}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {picks.length > 0 && (
              <p className="mt-4 text-xs text-muted-foreground">
                {picks.length} {tx("weekly time(s) selected")} · {tx("that's")} {picks.length} {tx("session(s) per week")}
              </p>
            )}
          </Card>

          {/* Upcoming sessions */}
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <CalendarClock size={16} className="text-indigo-600" /> {tx("Upcoming sessions")}
            </div>
            {scheduleQuery.isLoading ? (
              <Loading label="Loading…" />
            ) : upcoming.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                <Sparkles size={18} className="mx-auto mb-2 text-indigo-400" />
                {tx("Pick some times and save to create your sessions.")}
              </div>
            ) : (
              <div className="space-y-2">
                {upcoming.map((b) => (
                  <Link
                    key={b.bookingId}
                    to={`/student/session/${b.bookingId}`}
                    className="block rounded-xl border border-border p-3 transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
                  >
                    <div className="text-sm font-semibold text-foreground">{b.topicTitle}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {fmtWhen(b.scheduledAt)} · {b.instructorName}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
