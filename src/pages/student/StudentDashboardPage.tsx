import { Link } from "react-router";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Lock, ArrowRight, Sparkles, Clock, TrendingUp, Flame, Zap, Award, Play, Trophy, type LucideIcon } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard, BookingRow } from "@/components/cards";
import { PaymentStatusBadge } from "@/components/payment";
import { AIBadge } from "@/components/ai";
import { useAuth } from "@/auth/AuthProvider";
import { useStudentDashboard } from "@/hooks";
import { Loading, ErrorState } from "@/components/states";
import { useI18n } from "@/i18n";
import type { BookingListItem, Gamification } from "@/api/types";
import type { Booking, BookingStatus, PaymentStatus } from "@/types";
import { cn } from "@/lib/utils";

/** Adapt an API booking list item to the row's view model (date/time split). */
function toBookingRow(b: BookingListItem): Booking {
  const dt = new Date(b.scheduledAt);
  const date = isNaN(dt.getTime()) ? b.scheduledAt : dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = isNaN(dt.getTime()) ? "" : dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return {
    id: b.id,
    topicId: "",
    topicTitle: b.topicTitle,
    instructorId: "",
    instructorName: b.instructorName,
    date,
    time,
    durationMinutes: b.durationMinutes,
    status: b.status as BookingStatus,
    reportId: b.reportId ?? undefined,
  };
}

export function StudentDashboardPage() {
  const { tx } = useI18n();
  const { user } = useAuth();
  const query = useStudentDashboard();

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
  const canBook = d.paymentStatus === "approved";
  const firstName = (user?.fullName ?? "there").split(" ")[0];
  // Most recent session that has a generated report (recentSessions is newest-first).
  const latestReportId = d.recentSessions.find((b) => b.reportId)?.reportId ?? null;

  return (
    <DashboardLayout>
      <PageHeader
        title={`Welcome back, ${firstName} 👋`}
        subtitle="Here's your conversation practice at a glance."
        action={<PaymentStatusBadge status={(d.paymentStatus as PaymentStatus) ?? "none"} />}
      />

      {!canBook && (
        <Card className="mb-6 border-amber-200 bg-amber-50 p-5">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100">
                <Lock size={18} className="text-amber-600" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{tx("Booking is locked")}</div>
                <p className="text-xs text-muted-foreground">
                  {tx("Your payment is being reviewed by an admin. Booking unlocks once it's approved.")}
                </p>
              </div>
            </div>
            <Button asChild variant="ghost" size="sm" className="flex-shrink-0">
              <Link to="/billing/under-review">{tx("Check status")}</Link>
            </Button>
          </div>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon="Calendar" value={`${d.sessionsRemaining}`} label="Sessions remaining" tone="bg-indigo-100 text-indigo-600" />
        <StatCard icon="CheckCircle" value={`${d.sessionsCompleted}`} label="Sessions completed" tone="bg-emerald-100 text-emerald-600" />
        <StatCard icon="TrendingUp" value={d.latestScore != null ? `${d.latestScore}%` : "—"} label="Latest session score" tone="bg-purple-100 text-purple-600" />
        <Link to="/onboarding/placement-result" className="block rounded-2xl transition-transform hover:-translate-y-0.5" title={tx("View your placement result")}>
          <StatCard icon="Award" value={d.level ?? "—"} label="Current level · view result" tone="bg-amber-100 text-amber-600" />
        </Link>
      </div>

      <Achievements g={d.gamification} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display font-bold text-foreground">{tx("Progress over sessions")}</h3>
              {d.progressTrend.length > 1 && <span className="text-xs text-muted-foreground">Last {d.progressTrend.length} sessions</span>}
            </div>
            {d.progressTrend.length < 2 ? (
              <div className="flex h-[220px] flex-col items-center justify-center gap-2 rounded-2xl bg-muted/30 text-center">
                <TrendingUp size={26} className="text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">{tx("Complete a few sessions to see your progress trend here.")}</p>
              </div>
            ) : (
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <AreaChart data={d.progressTrend} margin={{ top: 6, right: 6, bottom: 0, left: -24 }}>
                    <defs>
                      <linearGradient id="score" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} />
                    <YAxis domain={[40, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} />
                    <Tooltip cursor={{ stroke: "#bfdbfe" }} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                    <Area type="monotone" dataKey="score" stroke="#3B82F6" strokeWidth={2.5} fill="url(#score)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display font-bold text-foreground">{tx("Recent sessions")}</h3>
            </div>
            <div className="space-y-3">
              {d.recentSessions.map((b) => (
                <BookingRow key={b.id} booking={toBookingRow(b)} reportTo={b.reportId ? `/student/report/${b.reportId}` : undefined} />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {d.nextSession ? (
            <Card className="overflow-hidden p-0">
              <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-5 text-white">
                <div className="mb-1 flex items-center gap-2 text-xs font-medium text-indigo-100">
                  <Clock size={13} /> {tx("Next session")}
                </div>
                <div className="font-display text-lg font-bold">{d.nextSession.topicTitle}</div>
                <div className="text-sm text-indigo-100">
                  {toBookingRow(d.nextSession).date} · {toBookingRow(d.nextSession).time} · {d.nextSession.durationMinutes} min
                </div>
              </div>
              <div className="space-y-4 p-5">
                <div className="text-sm font-semibold text-foreground">{d.nextSession.instructorName}</div>
                <div className="flex items-center gap-2 rounded-xl bg-purple-50 px-3 py-2 text-xs text-purple-700">
                  <Sparkles size={13} /> {tx("Your discussion questions are ready to preview.")}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/student/schedule`}>{tx("Manage availability")}</Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link to={`/student/session/${d.nextSession.id}`}>{tx("Join room")}</Link>
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}

          <Card className="p-5">
            <h3 className="mb-1 font-display font-bold text-foreground">{tx("Book your next session")}</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              {tx("Pick a topic, preview the questions, then choose a time with an instructor.")}
            </p>
            {canBook ? (
              <Button asChild className="w-full">
                <Link to="/student/schedule">
                  {tx("Set your availability")} <ArrowRight size={16} />
                </Link>
              </Button>
            ) : (
              <Button disabled className="w-full" variant="soft">
                <Lock size={15} /> {tx("Locked until approval")}
              </Button>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <AIBadge label="Latest AI report" />
            </div>
            {latestReportId ? (
              <>
                <p className="mb-4 text-sm leading-relaxed text-foreground">
                  {tx("Your most recent session report is ready — review the feedback and recommended drills before your next session.")}
                </p>
                <Button asChild variant="soft" size="sm" className="w-full">
                  <Link to={`/student/report/${latestReportId}`}>
                    {tx("View my latest report")} <ArrowRight size={15} />
                  </Link>
                </Button>
              </>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {tx("After your first session, your AI report will appear here with feedback and recommended drills.")}
              </p>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

const MILESTONE_ICONS: Record<string, LucideIcon> = {
  Award, Play, Flame, Zap, Trophy, TrendingUp,
};

/** Streak + XP + milestone board (gamification). */
function Achievements({ g }: { g: Gamification }) {
  const { tx } = useI18n();
  return (
    <Card className="mb-6 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display font-bold text-foreground">{tx("Your achievements")}</h3>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-600">
            <Flame size={15} /> {g.streakWeeks} week{g.streakWeeks === 1 ? "" : "s"} streak
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-600">
            <Zap size={15} /> {g.points} XP
          </span>
          <span className="text-xs font-medium text-muted-foreground">{g.milestonesEarned}/{g.milestonesTotal} badges</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {g.milestones.map((m) => {
          const Icon = MILESTONE_ICONS[m.icon] ?? Award;
          return (
            <div
              key={m.key}
              title={m.description}
              className={cn(
                "flex flex-col items-center gap-2 rounded-2xl border p-3 text-center",
                m.earned ? "border-amber-200 bg-amber-50" : "border-border bg-muted/30 opacity-60"
              )}
            >
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", m.earned ? "bg-amber-100 text-amber-600" : "bg-muted text-muted-foreground")}>
                <Icon size={18} />
              </div>
              <span className={cn("text-xs font-semibold", m.earned ? "text-foreground" : "text-muted-foreground")}>{m.label}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
