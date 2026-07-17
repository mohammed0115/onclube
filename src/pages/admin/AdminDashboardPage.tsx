import { Link } from "react-router";
import { ArrowRight, Wallet, Clock, AlertTriangle, Activity, ShieldCheck, GraduationCap, BarChart3, Server, Users } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/cards";
import { PaymentStatusBadge } from "@/components/payment";
import { useAdminDashboard } from "@/hooks";
import { Loading, ErrorState } from "@/components/states";
import { cn } from "@/lib/utils";
import type { PaymentStatus } from "@/types";

function badgeStatus(status: string): PaymentStatus {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  return "pending";
}

function when(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const ALERT_TONE = {
  error: "border-red-200 bg-red-50 text-red-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
} as const;

// The five operational areas of the platform (Operations Center).
const AREAS = [
  { icon: Activity, label: "Operations", desc: "Payments, sessions & alerts", tone: "text-indigo-600 bg-indigo-50", to: "/admin/payments" },
  { icon: GraduationCap, label: "Academics", desc: "Students, teachers & content", tone: "text-purple-600 bg-purple-50", to: "/admin" },
  { icon: BarChart3, label: "Business", desc: "Subscriptions, revenue & plans", tone: "text-emerald-600 bg-emerald-50", to: "/admin/payments" },
  { icon: Server, label: "Platform", desc: "Providers, health & jobs", tone: "text-sky-600 bg-sky-50", to: "/admin" },
  { icon: ShieldCheck, label: "Administration", desc: "Users, roles & audit log", tone: "text-slate-600 bg-slate-100", to: "/admin" },
];

export function AdminDashboardPage() {
  const query = useAdminDashboard();

  if (query.isLoading) {
    return <DashboardLayout><Loading label="Loading operations center…" /></DashboardLayout>;
  }
  if (query.isError || !query.data) {
    return <DashboardLayout><ErrorState error={query.error} onRetry={() => query.refetch()} /></DashboardLayout>;
  }

  const d = query.data;
  const healthy = (d.systemStatus ?? "healthy") === "healthy";

  return (
    <DashboardLayout>
      <PageHeader
        title="Operations Center"
        subtitle="Run the platform: approvals, sessions, and today's activity at a glance."
        action={
          <Button asChild size="sm">
            <Link to="/admin/payments">Review payments <ArrowRight size={15} /></Link>
          </Button>
        }
      />

      {/* Today's overview */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard icon="Users" value={`${d.totalStudents}`} label="Students" tone="bg-indigo-100 text-indigo-600" />
        <StatCard icon="GraduationCap" value={`${d.instructors}`} label="Teachers" tone="bg-purple-100 text-purple-600" />
        <StatCard icon="CalendarClock" value={`${d.sessionsToday}`} label="Sessions today" tone="bg-sky-100 text-sky-600" />
        <StatCard icon="Clock" value={`${d.pendingPayments}`} label="Pending payments" tone="bg-amber-100 text-amber-600" />
        <StatCard icon="FileClock" value={`${d.reportsWaiting}`} label="Reports waiting" tone="bg-rose-100 text-rose-600" />
        <StatCard icon={healthy ? "ShieldCheck" : "ShieldAlert"} value={healthy ? "Healthy" : "Issues"} label="System status" tone={healthy ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"} />
      </div>

      {/* Critical alerts — problems come to the admin, not the other way around */}
      <Card className="mb-6 p-6">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-500" />
          <h3 className="font-display font-bold text-foreground">Critical alerts</h3>
        </div>
        {d.alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">All clear — no issues need your attention. 🎉</p>
        ) : (
          <div className="space-y-2">
            {d.alerts.map((a, i) => {
              const body = (
                <div className={cn("flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm font-medium", ALERT_TONE[a.severity])}>
                  <span>{a.message}</span>
                  {a.to && <ArrowRight size={15} />}
                </div>
              );
              return a.to ? <Link key={i} to={a.to} className="block">{body}</Link> : <div key={i}>{body}</div>;
            })}
          </div>
        )}
      </Card>

      {/* Operations-center areas */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {AREAS.map((a) => (
          <Link key={a.label} to={a.to} className="group rounded-2xl border border-border bg-card p-4 transition-all hover:border-indigo-200 hover:shadow-sm">
            <div className={cn("mb-2 flex h-9 w-9 items-center justify-center rounded-xl", a.tone)}>
              <a.icon size={18} />
            </div>
            <div className="text-sm font-semibold text-foreground">{a.label}</div>
            <div className="text-xs text-muted-foreground">{a.desc}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Payment approval queue */}
        <Card className="p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet size={18} className="text-indigo-600" />
              <h3 className="font-display font-bold text-foreground">Payments awaiting approval</h3>
            </div>
            <Link to="/admin/payments" className="text-xs font-semibold text-indigo-600 hover:underline">Open queue</Link>
          </div>
          <div className="space-y-3">
            {d.pendingProofs.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white">
                    {p.studentName.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{p.studentName}</div>
                    <div className="text-xs text-muted-foreground">{p.planName} · {p.amount} {p.currency} · {when(p.submittedAt)}</div>
                  </div>
                </div>
                <PaymentStatusBadge status={badgeStatus(p.status)} />
              </div>
            ))}
            {d.pendingProofs.length === 0 && <p className="text-sm text-muted-foreground">Queue is clear 🎉</p>}
          </div>
        </Card>

        {/* Recent activity */}
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Clock size={18} className="text-indigo-600" />
            <h3 className="font-display font-bold text-foreground">Recent activity</h3>
          </div>
          <div className="space-y-4">
            {d.recentActivity.length === 0 && <p className="text-sm text-muted-foreground">Nothing recent.</p>}
            {d.recentActivity.map((a, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-indigo-500" />
                <div>
                  <div className="text-sm text-foreground"><span className="font-semibold">{a.actor}</span> — {a.action}</div>
                  <div className="text-xs text-muted-foreground">{when(a.when)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
