import { CalendarClock, X, Loader2, Users } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loading, EmptyState } from "@/components/states";
import { useInstructorBookings, useCancelInstructorBooking } from "@/hooks";
import type { BookingListItem } from "@/api/types";
import { useI18n } from "@/i18n";

function fmt(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_TONE: Record<string, "indigo" | "emerald" | "red" | "muted"> = {
  upcoming: "indigo", completed: "emerald", cancelled: "red",
};

/** A session at one instructor+time: one or more students grouped together. */
type SessionGroup = {
  key: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  topicTitle: string;
  bookingIds: string[];
  studentNames: string[];
};

/** Group bookings that share the same time + status into a single session card. */
function groupBookings(bookings: BookingListItem[]): SessionGroup[] {
  const map = new Map<string, SessionGroup>();
  for (const b of bookings) {
    const key = `${b.scheduledAt}|${b.status}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        scheduledAt: b.scheduledAt,
        durationMinutes: b.durationMinutes,
        status: b.status,
        topicTitle: b.topicTitle,
        bookingIds: [],
        studentNames: [],
      };
      map.set(key, g);
    }
    g.bookingIds.push(b.id);
    if (b.studentName) g.studentNames.push(b.studentName);
  }
  return Array.from(map.values());
}

const ms = (iso: string) => new Date(iso).getTime();

/** Upcoming sessions first, soonest at the top; past/cancelled history after,
 *  most-recent first. The API returns newest-first across all statuses, which
 *  buries the next session under later-dated ones — this fixes that. */
function splitSessions(groups: SessionGroup[]): { upcoming: SessionGroup[]; history: SessionGroup[] } {
  const upcoming = groups.filter((g) => g.status === "upcoming").sort((a, b) => ms(a.scheduledAt) - ms(b.scheduledAt));
  const history = groups.filter((g) => g.status !== "upcoming").sort((a, b) => ms(b.scheduledAt) - ms(a.scheduledAt));
  return { upcoming, history };
}

export function InstructorSessionsPage() {
  const { data, isLoading } = useInstructorBookings();
  const { tx } = useI18n();
  const { upcoming, history } = splitSessions(groupBookings(data ?? []));
  const isEmpty = upcoming.length === 0 && history.length === 0;

  return (
    <DashboardLayout>
      <PageHeader title="My sessions" subtitle="Your upcoming sessions come first. Prepare each lesson in Lesson prep." />
      <div className="mx-auto max-w-3xl">
        {isLoading ? (
          <Loading label="Loading your sessions…" />
        ) : isEmpty ? (
          <EmptyState icon={<CalendarClock size={26} className="text-muted-foreground" />} title="No sessions yet" description="Sessions assigned to you will appear here." />
        ) : (
          <div className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tx("Upcoming")}</h3>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tx("No upcoming sessions.")}</p>
              ) : (
                upcoming.map((g) => <SessionRow key={g.key} g={g} tx={tx} />)
              )}
            </div>
            {history.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tx("Past sessions")}</h3>
                {history.map((g) => <SessionRow key={g.key} g={g} tx={tx} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function SessionRow({ g, tx }: { g: SessionGroup; tx: (s: string) => string }) {
  const cancel = useCancelInstructorBooking();
  const isUpcoming = g.status === "upcoming";
  const isGroup = g.bookingIds.length > 1;

  const cancelAll = () => {
    for (const id of g.bookingIds) cancel.mutate(id);
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {g.topicTitle || tx("Session")}
            {isGroup && (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
                <Users size={12} /> {tx("Group")} · {g.bookingIds.length} {tx("students")}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{fmt(g.scheduledAt)} · {g.durationMinutes} {tx("min")}</div>
          {g.studentNames.length > 0 && (
            <div className="mt-1 truncate text-xs text-muted-foreground">{g.studentNames.join("، ")}</div>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Badge tone={STATUS_TONE[g.status] ?? "muted"} className="capitalize">{tx(g.status)}</Badge>
          {isUpcoming && (
            <Button variant="ghost" size="sm" onClick={cancelAll} disabled={cancel.isPending} className="text-red-600 hover:bg-red-50">
              {cancel.isPending ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} {tx("Cancel")}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
