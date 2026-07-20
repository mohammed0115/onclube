import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Sparkles, Award, Target, BookOpen, MessageSquareQuote } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Loading, ErrorState, EmptyState } from "@/components/states";
import { useStudentProgress, useStudentPlan } from "@/hooks";
import type { SkillProgress } from "@/api/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

const OVERALL_COLOR = "#3B82F6";

function DeltaBadge({ delta, size = "sm" }: { delta: number | null; size?: "sm" | "lg" }) {
  const { tx } = useI18n();
  if (delta === null) {
    return <span className="text-xs text-muted-foreground">{tx("first session")}</span>;
  }
  const up = delta > 0;
  const flat = delta === 0;
  const Icon = up ? TrendingUp : flat ? Minus : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold",
        size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs",
        up ? "bg-emerald-100 text-emerald-700" : flat ? "bg-slate-100 text-slate-600" : "bg-rose-100 text-rose-700"
      )}
    >
      <Icon size={size === "lg" ? 15 : 13} />
      {up ? "+" : flat ? "" : "−"}
      {Math.abs(delta)}
    </span>
  );
}

function SkillCard({ skill }: { skill: SkillProgress }) {
  const { tx } = useI18n();
  const color = skill.color ?? OVERALL_COLOR;
  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          {tx(skill.label)}
        </span>
        <DeltaBadge delta={skill.delta} />
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-extrabold text-foreground">{skill.current ?? "—"}</span>
        {skill.previous !== null && (
          <span className="mb-1 text-xs text-muted-foreground">{tx("was")} {skill.previous}</span>
        )}
      </div>
    </Card>
  );
}

function WeeklyPlanCard() {
  const { tx } = useI18n();
  const { data: plan } = useStudentPlan();
  if (!plan || !plan.hasPlan) return null;
  const hasItems =
    plan.nextFocus || plan.homework.length || plan.recommendedTopics.length || plan.focusAreas.length;
  if (!hasItems) return null;
  return (
    <Card className="mb-5 border-indigo-100 bg-indigo-50/40 p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
        <Target size={16} className="text-indigo-600" /> {tx("This week's plan")}
        {plan.fromSession?.topic && (
          <span className="text-xs font-normal text-muted-foreground">
            · {tx("from")} {plan.fromSession.topic}
          </span>
        )}
      </div>
      {plan.nextFocus && (
        <p className="mb-3 text-sm font-medium text-indigo-900">🎯 {plan.nextFocus}</p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {plan.homework.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <BookOpen size={13} /> {tx("Homework")}
            </div>
            <ul className="space-y-1 text-sm text-slate-600">
              {plan.homework.map((h) => <li key={h}>• {h}</li>)}
            </ul>
          </div>
        )}
        {plan.focusAreas.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Target size={13} /> {tx("Focus on")}
            </div>
            <ul className="space-y-1 text-sm text-slate-600">
              {plan.focusAreas.map((w) => <li key={w}>• {w}</li>)}
            </ul>
          </div>
        )}
        {plan.recommendedTopics.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <MessageSquareQuote size={13} /> {tx("Practise next")}
            </div>
            <ul className="space-y-1 text-sm text-slate-600">
              {plan.recommendedTopics.map((t) => <li key={t}>• {t}</li>)}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

export function ProgressPage() {
  const { tx } = useI18n();
  const { data, isLoading, isError, error, refetch } = useStudentProgress();

  if (isLoading) {
    return (
      <DashboardLayout>
        <Loading label="Loading your progress…" />
      </DashboardLayout>
    );
  }
  if (isError) {
    return (
      <DashboardLayout>
        <ErrorState error={error} onRetry={() => refetch()} />
      </DashboardLayout>
    );
  }

  const progress = data!;
  if (progress.sessionsCount === 0) {
    return (
      <DashboardLayout>
        <PageHeader title="My progress" subtitle="Track how your speaking improves, session by session." />
        <EmptyState
          title="No sessions yet"
          description="Once you finish a live session and its AI report is ready, your progress shows up here."
        />
      </DashboardLayout>
    );
  }

  // Merge overall + per-skill series into one row per session for the chart.
  const chartData = progress.overall.series.map((pt, i) => {
    const row: Record<string, number | string | null> = { label: pt.label, Overall: pt.score };
    progress.skills.forEach((s) => {
      row[s.label] = s.series[i]?.value ?? null;
    });
    return row;
  });

  return (
    <DashboardLayout>
      <PageHeader title="My progress" subtitle="Track how your speaking improves, session by session." />

      {/* Encouraging message */}
      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
        <Sparkles size={18} className="mt-0.5 flex-shrink-0 text-primary" />
        <p className="text-sm font-medium text-foreground">{progress.message}</p>
      </div>

      {/* This week's plan — regenerated from the latest report */}
      <WeeklyPlanCard />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[18rem_1fr]">
        {/* Overall score */}
        <Card className="flex flex-col items-center justify-center p-6 text-center">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Award size={16} className="text-primary" /> {tx("Overall score")}
          </div>
          <div className="text-6xl font-extrabold text-foreground">{progress.overall.current ?? "—"}</div>
          <div className="mt-1 text-sm text-muted-foreground">/ 100</div>
          <div className="mt-3">
            <DeltaBadge delta={progress.overall.delta} size="lg" />
          </div>
          {progress.overall.previous !== null && (
            <p className="mt-2 text-xs text-muted-foreground">
              {tx("Last session:")} {progress.overall.previous}/100
            </p>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            {progress.sessionsCount} {progress.sessionsCount === 1 ? tx("session") : tx("sessions")} {tx("completed")}
          </p>
        </Card>

        {/* Trend chart */}
        <Card className="p-5">
          <h3 className="mb-3 font-display font-bold text-foreground">{tx("Your trend")}</h3>
          {chartData.length < 2 ? (
            <div className="flex h-[260px] flex-col items-center justify-center gap-2 rounded-2xl bg-muted/30 text-center">
              <TrendingUp size={26} className="text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{tx("Finish another session to see your trend line.")}</p>
            </div>
          ) : (
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 6, right: 12, bottom: 0, left: -20 }}>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Overall" stroke={OVERALL_COLOR} strokeWidth={3} dot={{ r: 3 }} />
                  {progress.skills.map((s) => (
                    <Line
                      key={s.label}
                      type="monotone"
                      dataKey={s.label}
                      stroke={s.color ?? OVERALL_COLOR}
                      strokeWidth={1.75}
                      dot={{ r: 2 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Per-skill comparison */}
      <h3 className="mb-3 mt-6 font-display font-bold text-foreground">{tx("Skill by skill")}</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {progress.skills.map((s) => (
          <SkillCard key={s.label} skill={s} />
        ))}
      </div>
    </DashboardLayout>
  );
}
