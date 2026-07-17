import { ShieldCheck } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Loading, EmptyState } from "@/components/states";
import { useAuditLog } from "@/hooks";

function when(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AdminAuditPage() {
  const { data, isLoading } = useAuditLog();
  const entries = data ?? [];

  return (
    <DashboardLayout>
      <PageHeader title="Audit log" subtitle="Every manual admin action is recorded (append-only)." />
      <div className="mx-auto max-w-3xl">
        {isLoading ? (
          <Loading label="Loading audit log…" />
        ) : entries.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={26} className="text-muted-foreground" />} title="No actions recorded yet" />
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="divide-y divide-border">
              {entries.map((e) => (
                <div key={e.id} className="flex items-start gap-3 p-4">
                  <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-indigo-500" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-foreground">
                      <span className="font-semibold">{e.admin}</span>{" "}
                      <span className="font-medium text-indigo-600">{e.action.replace(/_/g, " ")}</span>
                      {e.reason && <span className="text-muted-foreground"> · {e.reason}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{e.targetTable} · {when(e.when)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
