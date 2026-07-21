import { useState } from "react";
import { CalendarClock, X, RefreshCw, Check, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loading, EmptyState } from "@/components/states";
import {
  useInstructorBookings,
  useInstructorAvailability,
  useCancelInstructorBooking,
  useRescheduleInstructorBooking,
} from "@/hooks";
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
  const bookings = data ?? [];

  return (
    <DashboardLayout>
      <PageHeader title="My sessions" subtitle="Cancel or reschedule your booked sessions." />
      <div className="mx-auto max-w-3xl">
        {isLoading ? (
          <Loading label="Loading your sessions…" />
        ) : bookings.length === 0 ? (
          <EmptyState icon={<CalendarClock size={26} className="text-muted-foreground" />} title="No sessions yet" description="Bookings from students will appear here." />
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => <SessionRow key={b.id} b={b} />)}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function SessionRow({ b }: { b: BookingListItem }) {
  const cancel = useCancelInstructorBooking();
  const reschedule = useRescheduleInstructorBooking();
  const { data: slots } = useInstructorAvailability();
  const { tx } = useI18n();
  const [picking, setPicking] = useState(false);
  const [slotId, setSlotId] = useState("");

  const openSlots = (slots ?? []).filter((s) => s.status === "open" && new Date(s.startAt) > new Date());
  const isUpcoming = b.status === "upcoming";

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-foreground">{b.topicTitle || tx("Session")}</div>
          <div className="text-xs text-muted-foreground">{fmt(b.scheduledAt)} · {b.durationMinutes} {tx("min")}</div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[b.status] ?? "muted"} className="capitalize">{b.status}</Badge>
          {isUpcoming && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setPicking((v) => !v)} disabled={reschedule.isPending}>
                <RefreshCw size={14} /> {tx("Reschedule")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => cancel.mutate(b.id)} disabled={cancel.isPending} className="text-red-600 hover:bg-red-50">
                {cancel.isPending ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} {tx("Cancel")}
              </Button>
            </>
          )}
        </div>
      </div>

      {picking && isUpcoming && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-3">
          <select value={slotId} onChange={(e) => setSlotId(e.target.value)} className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
            <option value="">{tx("Pick a new open slot…")}</option>
            {openSlots.map((s) => <option key={s.id} value={s.id}>{fmt(s.startAt)}</option>)}
          </select>
          <Button size="sm" disabled={!slotId || reschedule.isPending} onClick={() => reschedule.mutate({ id: b.id, newSlotId: slotId }, { onSuccess: () => setPicking(false) })}>
            {reschedule.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {tx("Move")}
          </Button>
        </div>
      )}
      {openSlots.length === 0 && picking && <p className="mt-2 text-xs text-muted-foreground">{tx("No open slots — add availability first.")}</p>}
    </Card>
  );
}
