import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loading, EmptyState } from "@/components/states";
import { useAdminBookings, useAdminCancelBooking } from "@/hooks";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

// Booking statuses surfaced by the admin list (matches the backend booking status).
const STATUSES = ["all", "upcoming", "completed", "cancelled"] as const;
const TONE: Record<string, "indigo" | "emerald" | "red" | "amber" | "muted"> = {
  upcoming: "indigo", completed: "emerald", cancelled: "red", expired: "muted",
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AdminBookingsPage() {
  const { tx } = useI18n();
  const { data, isLoading } = useAdminBookings();
  const cancel = useAdminCancelBooking();
  const [filter, setFilter] = useState<string>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const all = data ?? [];
  const shown = useMemo(
    () => (filter === "all" ? all : all.filter((b) => b.status === filter)),
    [all, filter],
  );

  const onCancel = (id: string) => {
    if (!window.confirm(tx("Cancel this booking? The student is notified and the credit is refunded."))) return;
    setPendingId(id);
    cancel.mutate({ id, forceCredit: true }, { onSettled: () => setPendingId(null) });
  };

  return (
    <DashboardLayout>
      <PageHeader title="Bookings" subtitle="Search, review and cancel bookings across the platform." />

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((st) => (
          <button
            key={st}
            onClick={() => setFilter(st)}
            className={cn(
              "rounded-xl border px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
              filter === st ? "border-primary bg-blue-50 text-blue-700" : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {tx(st)} {st !== "all" && `(${all.filter((b) => b.status === st).length})`}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Loading label="Loading bookings…" />
      ) : shown.length === 0 ? (
        <EmptyState icon={<CalendarClock size={26} className="text-muted-foreground" />} title="No bookings" />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y divide-border">
            {shown.map((b) => {
              const cancellable = b.status === "upcoming";
              return (
                <div key={b.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{b.topicTitle}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {b.studentName} · {b.instructorName} · {fmt(b.scheduledAt)} · {b.durationMinutes} {tx("min")}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {b.creditRefunded && (
                      <span className="text-[11px] font-medium text-emerald-600">{tx("Credit refunded")}</span>
                    )}
                    <Badge tone={TONE[b.status] ?? "muted"} className="capitalize">{tx(b.status)}</Badge>
                    {cancellable && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onCancel(b.id)}
                        disabled={pendingId === b.id}
                      >
                        {pendingId === b.id ? tx("Cancelling…") : tx("Cancel")}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </DashboardLayout>
  );
}
