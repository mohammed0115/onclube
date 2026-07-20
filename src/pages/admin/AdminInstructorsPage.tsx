import { useState } from "react";
import { Link } from "react-router";
import { Award, BadgeCheck, Star, ExternalLink, Check, X } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loading, ErrorState, EmptyState } from "@/components/states";
import {
  useAdminInstructors, useAdminApproveInstructor, useAdminFeatureInstructor,
  useAdminVisibilityInstructor, useAdminFoundingInstructor, useAdminDisplayOrderInstructor,
} from "@/hooks";
import type { AdminInstructor } from "@/api/types";
import { initialsOf, accentFor } from "@/lib/instructor";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Row({ ins }: { ins: AdminInstructor }) {
  const { tx } = useI18n();
  const approve = useAdminApproveInstructor();
  const feature = useAdminFeatureInstructor();
  const visibility = useAdminVisibilityInstructor();
  const founding = useAdminFoundingInstructor();
  const order = useAdminDisplayOrderInstructor();
  const [ord, setOrd] = useState(String(ins.displayOrder));

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-3">
          {ins.avatarUrl ? (
            <img src={ins.avatarUrl} alt={ins.fullName} className="h-12 w-12 rounded-xl object-cover" />
          ) : (
            <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white", accentFor(ins.slug ?? ins.id))}>
              {initialsOf(ins.fullName)}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-semibold text-foreground">{ins.fullName}</span>
              {ins.profileApproved && <BadgeCheck size={15} className="text-blue-500" />}
              {ins.foundingInstructor && <Award size={14} className="text-amber-500" />}
            </div>
            <div className="truncate text-xs text-muted-foreground">{ins.jobTitle || "—"} · {ins.email}</div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-0.5"><Star size={11} className="fill-amber-400 text-amber-400" /> {ins.rating.toFixed(1)}</span>
              <span>· {ins.sessionsHosted} {tx("sessions")}</span>
              {ins.slug && ins.profileApproved && (
                <Link to={`/instructors/${ins.slug}`} target="_blank" className="inline-flex items-center gap-0.5 text-indigo-600 hover:underline">
                  {tx("View")} <ExternalLink size={10} />
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:w-[26rem] sm:grid-cols-2">
          <button
            onClick={() => approve.mutate([ins.id, !ins.profileApproved])}
            className={cn(
              "flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold",
              ins.profileApproved ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
            )}
          >
            {ins.profileApproved ? <Check size={13} /> : <X size={13} />} {ins.profileApproved ? tx("Approved") : tx("Approve")}
          </button>
          <div className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1">
            <span className="text-[11px] text-muted-foreground">{tx("Order")}</span>
            <input
              type="number"
              value={ord}
              onChange={(e) => setOrd(e.target.value)}
              onBlur={() => Number(ord) !== ins.displayOrder && order.mutate([ins.id, Number(ord) || 0])}
              className="w-full bg-transparent text-sm text-foreground outline-none"
            />
          </div>
          <Toggle label={tx("Featured")} checked={ins.featured} onChange={(v) => feature.mutate([ins.id, v])} />
          <Toggle label={tx("On landing")} checked={ins.showOnLanding} onChange={(v) => visibility.mutate([ins.id, v])} />
          <Toggle label={tx("Founding 🏅")} checked={ins.foundingInstructor} onChange={(v) => founding.mutate([ins.id, v])} />
        </div>
      </div>
    </Card>
  );
}

export function AdminInstructorsPage() {
  const { tx } = useI18n();
  const { data, isLoading, isError, error, refetch } = useAdminInstructors();
  return (
    <DashboardLayout>
      <PageHeader title="Instructors" subtitle="Approve, feature, order, and control who appears on the landing page." />
      {isLoading && <Loading label="Loading instructors…" />}
      {isError && <ErrorState error={error} onRetry={() => refetch()} />}
      {data && data.length === 0 && <EmptyState title="No instructors yet" description="Approved teachers will appear here." />}
      {data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((ins) => <Row key={ins.id} ins={ins} />)}
        </div>
      )}
    </DashboardLayout>
  );
}
