import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/cards";
import { Loading, ErrorState } from "@/components/states";
import { useAdminBusiness } from "@/hooks";
import { useI18n } from "@/i18n";

export function AdminBusinessPage() {
  const { tx } = useI18n();
  const query = useAdminBusiness();
  if (query.isLoading) return <DashboardLayout><Loading label="Loading business overview…" /></DashboardLayout>;
  if (query.isError || !query.data) return <DashboardLayout><ErrorState error={query.error} onRetry={() => query.refetch()} /></DashboardLayout>;
  const d = query.data;
  const maxRev = Math.max(1, ...d.trend.map((t) => t.revenue));

  return (
    <DashboardLayout>
      <PageHeader title="Business" subtitle="Revenue, subscriptions and teaching output." />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon="Wallet" value={`${d.totalRevenue}`} label={`${d.currency} total revenue`} tone="bg-emerald-100 text-emerald-600" />
        <StatCard icon="Users" value={`${d.activeSubscriptions}`} label="Active subscriptions" tone="bg-indigo-100 text-indigo-600" />
        <StatCard icon="CheckCircle" value={`${d.completedSessions}`} label="Completed sessions" tone="bg-sky-100 text-sky-600" />
        <StatCard icon="Clock" value={`${d.teacherHours}h`} label="Teaching hours" tone="bg-teal-100 text-teal-600" />
      </div>

      {/* Engagement & retention (Product Bible §2.7) */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard icon="Users" value={`${d.activeStudents}`} label="Active students" tone="bg-blue-100 text-blue-600" />
        <StatCard icon="TrendingUp" value={`${d.renewalRate}%`} label="Renewal rate" tone="bg-emerald-100 text-emerald-600" />
        <StatCard icon="TrendingDown" value={`${d.churnRate}%`} label="Churn rate" tone="bg-rose-100 text-rose-600" />
        <StatCard icon="Calendar" value={`${d.teacherUtilization}%`} label="Teacher utilization" tone="bg-amber-100 text-amber-600" />
        <StatCard icon="Award" value={`${d.avgProgress}`} label="Avg progress score" tone="bg-violet-100 text-violet-600" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="mb-4 font-display font-bold text-foreground">{tx("Revenue by month")}</h3>
          {d.trend.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tx("No revenue yet.")}</p>
          ) : (
            <div className="space-y-2">
              {d.trend.map((t) => (
                <div key={t.month} className="flex items-center gap-3">
                  <span className="w-16 text-xs text-muted-foreground">{t.month}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(t.revenue / maxRev) * 100}%` }} />
                  </div>
                  <span className="w-20 text-right text-xs font-medium text-foreground">{t.revenue} {d.currency}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="mb-4 font-display font-bold text-foreground">{tx("Revenue by plan")}</h3>
          {d.plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tx("No plan revenue yet.")}</p>
          ) : (
            <div className="space-y-2">
              {d.plans.map((p) => (
                <div key={p.name} className="flex items-center justify-between rounded-xl border border-border px-4 py-2.5">
                  <span className="text-sm font-medium text-foreground">{p.name}</span>
                  <span className="text-sm font-semibold text-emerald-600">{p.revenue} {d.currency}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
