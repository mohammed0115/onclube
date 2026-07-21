import { CalendarClock, X, Loader2 } from "lucide-react";
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

export function InstructorSessionsPage() {
  const { data, isLoading } = useInstructorBookings();
  const { tx } = useI18n();
  const bookings = data ?? [];

  return (
    <DashboardLayout>
      <PageHeader title="My sessions" subtitle="Your booked sessions. Prepare each lesson in Lesson prep." />
      <div className="mx-auto max-w-3xl">
        {isLoading ? (
          <Loading label="Loading your sessions…" />
        ) : bookings.length === 0 ? (
          <EmptyState icon={<CalendarClock size={26} className="text-muted-foreground" />} title="No sessions yet" description="Sessions assigned to you will appear here." />
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => <SessionRow key={b.id} b={b} tx={tx} />)}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function SessionRow({ b, tx }: { b: BookingListItem; tx: (s: string) => string }) {
  const cancel = useCancelInstructorBooking();
  const isUpcoming = b.status === "upcoming";

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-foreground">{b.topicTitle || tx("Session")}</div>
          <div className="text-xs text-muted-foreground">{fmt(b.scheduledAt)} · {b.durationMinutes} {tx("min")}</div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[b.status] ?? "muted"} className="capitalize">{tx(b.status)}</Badge>
          {isUpcoming && (
            <Button variant="ghost" size="sm" onClick={() => cancel.mutate(b.id)} disabled={cancel.isPending} className="text-red-600 hover:bg-red-50">
              {cancel.isPending ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} {tx("Cancel")}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
