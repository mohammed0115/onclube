import { Link } from "react-router";
import { ArrowRight, Sparkles, Clock, Users } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/cards";
import { AIBadge } from "@/components/ai";
import { useAuth } from "@/auth/AuthProvider";
import { useInstructorDashboard } from "@/hooks";
import { Loading, ErrorState } from "@/components/states";
import { useI18n } from "@/i18n";

function when(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function InstructorDashboardPage() {
  const { user } = useAuth();
  const query = useInstructorDashboard();
  const { tx } = useI18n();

  if (query.isLoading) {
    return (
      <DashboardLayout>
        <Loading label="Loading your dashboard…" />
      </DashboardLayout>
    );
  }
  if (query.isError || !query.data) {
    return (
      <DashboardLayout>
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </DashboardLayout>
    );
  }

  const d = query.data;
  const firstName = (user?.fullName ?? "there").split(" ")[0];

  return (
    <DashboardLayout>
      <PageHeader
        title={`Hello, ${firstName} 👋`}
        subtitle="Your sessions and AI-assisted lesson prep."
        action={
          <Button asChild size="sm">
            <Link to="/instructor/lessons">
              {tx("Lesson prep")} <ArrowRight size={15} />
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard icon="CalendarClock" value={`${d.upcomingSessions}`} label="Upcoming sessions" tone="bg-indigo-100 text-indigo-600" />
        <StatCard icon="Users" value={`${d.activeStudents}`} label="Active students" tone="bg-emerald-100 text-emerald-600" />
        <StatCard icon="CheckCircle" value={`${d.completedSessions}`} label="Completed" tone="bg-sky-100 text-sky-600" />
        <StatCard icon="Clock" value={`${d.teachingHours}h`} label="Teaching hours" tone="bg-teal-100 text-teal-600" />
        <StatCard icon="XCircle" value={`${d.cancellationRate}%`} label="Cancellation rate" tone="bg-rose-100 text-rose-600" />
        <StatCard icon="Star" value={`${d.averageRating}`} label="Average rating" tone="bg-amber-100 text-amber-600" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display font-bold text-foreground">{tx("Today's sessions")}</h3>
              <Link to="/instructor/availability" className="text-xs font-semibold text-indigo-600 hover:underline">
                {tx("Manage availability")}
              </Link>
            </div>
            <div className="space-y-3">
              {d.todaySessions.length === 0 && <p className="text-sm text-muted-foreground">{tx("No sessions scheduled.")}</p>}
              {d.todaySessions.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                      <Clock size={18} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{b.topicTitle || tx("Session")}</div>
                      <div className="text-xs text-muted-foreground">{when(b.scheduledAt)} · {b.durationMinutes} {tx("min")}</div>
                    </div>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/student/session/${b.id}`}>{tx("Open room")}</Link>
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="mb-1 font-display font-bold text-foreground">{tx("Get ready for your sessions")}</h3>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              {tx("Open your weekly availability so students can be matched to you, then write each session's lesson (title + questions) — students see it 1 hour before.")}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button asChild variant="soft" size="sm"><Link to="/instructor/availability">{tx("Availability")}</Link></Button>
              <Button asChild size="sm"><Link to="/instructor/lessons">{tx("Lesson prep")}</Link></Button>
              <Button asChild variant="soft" size="sm"><Link to="/instructor/sessions">{tx("My Sessions")}</Link></Button>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <AIBadge label={tx("AI assist")} />
            </div>
            <h3 className="mb-1 font-display font-bold text-foreground">{tx("Prep faster with AI")}</h3>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              {tx("In Lesson prep, write a lesson title and let AI suggest discussion questions. You stay in control — edit or replace anything before you save.")}
            </p>
            <Button asChild className="w-full">
              <Link to="/instructor/lessons">
                <Sparkles size={15} /> {tx("Lesson prep")}
              </Link>
            </Button>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-display font-bold text-foreground">{tx("This week")}</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{tx("Sessions hosted")}</span>
                <span className="font-bold text-foreground">{d.weekly.sessions_hosted ?? 0}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
