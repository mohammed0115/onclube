import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loading, EmptyState } from "@/components/states";
import { useAdminSessions } from "@/hooks";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

const STATUSES = ["all", "scheduled", "live", "completed", "cancelled", "expired"] as const;
const TONE: Record<string, "indigo" | "emerald" | "red" | "amber" | "muted"> = {
  scheduled: "indigo", live: "amber", completed: "emerald", cancelled: "red", expired: "muted",
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AdminSessionsPage() {
  const { tx } = useI18n();
  const { data, isLoading } = useAdminSessions();
  const [filter, setFilter] = useState<string>("all");
  const all = data ?? [];
  const shown = useMemo(() => (filter === "all" ? all : all.filter((s) => s.status === filter)), [all, filter]);

  return (
    <DashboardLayout>
      <PageHeader title="Sessions monitor" subtitle="Every live session across the platform." />

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((st) => (
          <button
            key={st}
            onClick={() => setFilter(st)}
            className={cn("rounded-xl border px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
              filter === st ? "border-primary bg-blue-50 text-blue-700" : "border-border text-muted-foreground hover:bg-muted")}
          >
            {tx(st)} {st !== "all" && `(${all.filter((s) => s.status === st).length})`}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Loading label="Loading sessions…" />
      ) : shown.length === 0 ? (
        <EmptyState icon={<CalendarClock size={26} className="text-muted-foreground" />} title="No sessions" />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y divide-border">
            {shown.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">{s.topicTitle}</div>
                  <div className="text-xs text-muted-foreground">{s.studentName} · {s.instructorName} · {fmt(s.scheduledAt)}</div>
                </div>
                <Badge tone={TONE[s.status] ?? "muted"} className="capitalize">{tx(s.status)}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </DashboardLayout>
  );
}
