import { Server, Cpu } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loading, ErrorState } from "@/components/states";
import { useAdminPlatform } from "@/hooks";

const OK = new Set(["live", "redis"]);
const WARN = new Set(["stub", "heuristic", "console", "off", "in-memory"]);

function tone(status: string): "emerald" | "amber" | "red" {
  if (OK.has(status)) return "emerald";
  if (WARN.has(status)) return "amber";
  return "red";
}

export function AdminPlatformPage() {
  const query = useAdminPlatform();
  if (query.isLoading) return <DashboardLayout><Loading label="Loading platform status…" /></DashboardLayout>;
  if (query.isError || !query.data) return <DashboardLayout><ErrorState error={query.error} onRetry={() => query.refetch()} /></DashboardLayout>;
  const d = query.data;

  return (
    <DashboardLayout>
      <PageHeader title="Platform" subtitle="Provider health and the AI report queue." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2 font-display font-bold text-foreground">
            <Server size={18} className="text-sky-600" /> Providers
          </div>
          <div className="space-y-2">
            {d.providers.map((p) => (
              <div key={p.name} className="flex items-center justify-between rounded-xl border border-border px-4 py-2.5">
                <span className="text-sm font-medium text-foreground">{p.name}</span>
                <Badge tone={tone(p.status)} className="capitalize">{p.status}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2 font-display font-bold text-foreground">
            <Cpu size={18} className="text-indigo-600" /> AI report queue
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-amber-50 p-4 text-center">
              <div className="text-2xl font-bold text-amber-600">{d.aiQueue.pending}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4 text-center">
              <div className="text-2xl font-bold text-emerald-600">{d.aiQueue.ready}</div>
              <div className="text-xs text-muted-foreground">Ready</div>
            </div>
            <div className="rounded-2xl bg-red-50 p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{d.aiQueue.failed}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
          </div>
          {d.aiQueue.failed > 0 && <p className="mt-3 text-xs text-red-600">Failed reports can be regenerated from each session's report page.</p>}
        </Card>
      </div>
    </DashboardLayout>
  );
}
