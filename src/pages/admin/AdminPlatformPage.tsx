import { useEffect, useState } from "react";
import { Server, Cpu, Users, Loader2, Save } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loading, ErrorState } from "@/components/states";
import { useAdminPlatform, useGroupCapacity, useSetGroupCapacity } from "@/hooks";
import { useI18n } from "@/i18n";

const OK = new Set(["live", "redis"]);
const WARN = new Set(["stub", "heuristic", "console", "off", "in-memory"]);

function tone(status: string): "emerald" | "amber" | "red" {
  if (OK.has(status)) return "emerald";
  if (WARN.has(status)) return "amber";
  return "red";
}

export function AdminPlatformPage() {
  const { tx } = useI18n();
  const query = useAdminPlatform();
  if (query.isLoading) return <DashboardLayout><Loading label="Loading platform status…" /></DashboardLayout>;
  if (query.isError || !query.data) return <DashboardLayout><ErrorState error={query.error} onRetry={() => query.refetch()} /></DashboardLayout>;
  const d = query.data;

  return (
    <DashboardLayout>
      <PageHeader title="Platform" subtitle="Provider health, the AI report queue, and session settings." />

      <div className="mb-6"><GroupCapacityCard /></div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2 font-display font-bold text-foreground">
            <Server size={18} className="text-sky-600" /> {tx("Providers")}
          </div>
          <div className="space-y-2">
            {d.providers.map((p) => (
              <div key={p.name} className="flex items-center justify-between rounded-xl border border-border px-4 py-2.5">
                <span className="text-sm font-medium text-foreground">{p.name}</span>
                <Badge tone={tone(p.status)} className="capitalize">{tx(p.status)}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2 font-display font-bold text-foreground">
            <Cpu size={18} className="text-indigo-600" /> {tx("AI report queue")}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-amber-50 p-4 text-center">
              <div className="text-2xl font-bold text-amber-600">{d.aiQueue.pending}</div>
              <div className="text-xs text-muted-foreground">{tx("Pending")}</div>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4 text-center">
              <div className="text-2xl font-bold text-emerald-600">{d.aiQueue.ready}</div>
              <div className="text-xs text-muted-foreground">{tx("Ready")}</div>
            </div>
            <div className="rounded-2xl bg-red-50 p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{d.aiQueue.failed}</div>
              <div className="text-xs text-muted-foreground">{tx("Failed")}</div>
            </div>
          </div>
          {d.aiQueue.failed > 0 && <p className="mt-3 text-xs text-red-600">{tx("Failed reports can be regenerated from each session's report page.")}</p>}
        </Card>
      </div>
    </DashboardLayout>
  );
}

/** Admin control: how many students may share one instructor+time (group session). */
function GroupCapacityCard() {
  const { tx } = useI18n();
  const q = useGroupCapacity();
  const save = useSetGroupCapacity();
  const [value, setValue] = useState<number>(1);
  const [saved, setSaved] = useState(false);
  const [overCapacity, setOverCapacity] = useState(0);

  useEffect(() => {
    if (q.data) setValue(q.data.groupCapacity);
  }, [q.data]);

  const onSave = () => {
    setSaved(false);
    setOverCapacity(0);
    save.mutate(Math.max(1, Math.floor(value) || 1), {
      onSuccess: (res) => { setSaved(true); setOverCapacity(res.groupsOverCapacity ?? 0); },
    });
  };

  return (
    <Card className="p-6">
      <div className="mb-1 flex items-center gap-2 font-display font-bold text-foreground">
        <Users size={18} className="text-indigo-600" /> {tx("Group session size")}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        {tx("Maximum students who can share one instructor at the same time. 1 = one-to-one sessions.")}
      </p>
      {q.isLoading ? (
        <Loading label="Loading…" />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="number"
            min={1}
            max={50}
            value={value}
            onChange={(e) => { setValue(Number(e.target.value)); setSaved(false); }}
            className="w-24 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
          <Button size="sm" onClick={onSave} disabled={save.isPending}>
            {save.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {tx("Save")}
          </Button>
          {saved && <span className="text-xs font-medium text-emerald-600">{tx("Saved ✓")}</span>}
          {save.isError && <span className="text-xs text-red-600">{tx("Could not save. Please try again.")}</span>}
        </div>
      )}
      {saved && overCapacity > 0 && (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-xs font-medium text-amber-700">
          {overCapacity} {tx("already-booked group(s) exceed the new size. They will run as booked; the new limit applies to future bookings only.")}
        </p>
      )}
    </Card>
  );
}
