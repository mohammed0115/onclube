import { useParams, Link } from "react-router";
import { ArrowLeft, Target, Award, CalendarClock, FileBarChart } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loading, ErrorState } from "@/components/states";
import { useInstructorStudent } from "@/hooks";
import { useI18n } from "@/i18n";

function fmt(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function InstructorStudentDetailPage() {
  const { id = "" } = useParams();
  const query = useInstructorStudent(id);
  const { tx } = useI18n();

  if (query.isLoading) return <DashboardLayout><Loading label="Loading student…" /></DashboardLayout>;
  if (query.isError || !query.data) return <DashboardLayout><ErrorState error={query.error} onRetry={() => query.refetch()} /></DashboardLayout>;
  const s = query.data;

  return (
    <DashboardLayout>
      <Link to="/instructor/students" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={15} /> {tx("All students")}
      </Link>
      <PageHeader title={s.fullName} subtitle="Pre-session prep — level, goal, and history." />

      <div className="mx-auto max-w-3xl space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="p-4"><div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><Award size={13} /> {tx("Level")}</div><div className="text-lg font-bold text-foreground">{s.level ?? "—"}</div></Card>
          <Card className="p-4"><div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><Target size={13} /> {tx("Goal")}</div><div className="text-sm font-semibold text-foreground">{s.goalTitle ?? "—"}</div></Card>
          <Card className="p-4"><div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock size={13} /> {tx("Sessions left")}</div><div className="text-lg font-bold text-foreground">{s.sessionsRemaining}</div></Card>
          <Card className="p-4"><div className="mb-1 text-xs text-muted-foreground">{tx("Payment")}</div><Badge tone={s.paymentStatus === "approved" ? "emerald" : "amber"} className="capitalize">{s.paymentStatus}</Badge></Card>
        </div>

        <Card className="p-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileBarChart size={16} className="text-indigo-600" /> {tx("Session history")}
          </div>
          {s.sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tx("No sessions yet.")}</p>
          ) : (
            <div className="space-y-2">
              {s.sessions.map((x) => (
                <div key={x.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-2.5">
                  <div>
                    <div className="text-sm font-medium text-foreground">{x.topicTitle}</div>
                    <div className="text-xs text-muted-foreground">{fmt(x.scheduledAt)} · <span className="capitalize">{x.status}</span></div>
                  </div>
                  <div className="flex items-center gap-2">
                    {x.score != null && <Badge tone="emerald">{x.score}</Badge>}
                    {x.reportId && <Link to={`/student/report/${x.reportId}`} className="text-xs font-semibold text-indigo-600 hover:underline">{tx("Report")}</Link>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
