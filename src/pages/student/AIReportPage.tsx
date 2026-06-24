import { useParams, Link } from "react-router";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts";
import { Sparkles, AlertCircle, ArrowRight, Calendar, Clock, MessageSquareQuote } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SkillScoreBar } from "@/components/cards";
import { AIBadge, AIInsightCard, RecommendationList } from "@/components/ai";
import { sessionReport, instructors } from "@/data/mockData";

export function AIReportPage() {
  useParams(); // report id — single mock report
  const r = sessionReport;
  const instructor = instructors.find((i) => i.name === r.instructorName) ?? instructors[0];

  return (
    <DashboardLayout>
      <PageHeader
        title="Session report"
        subtitle={`${r.topicTitle} · with ${r.instructorName}`}
        back="/student"
        action={<AIBadge label="AI analysis" />}
      />

      <div className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-600 p-6 text-white sm:p-8">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 flex items-center gap-3 text-xs text-indigo-100">
              <span className="flex items-center gap-1">
                <Calendar size={13} /> {r.date}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={13} /> {r.durationMinutes} min
              </span>
            </div>
            <h2 className="font-display text-2xl font-extrabold">Great work on this session!</h2>
            <p className="mt-1 max-w-md text-sm text-indigo-100">
              Here&apos;s your AI-generated analysis of how the conversation went and where to focus next.
            </p>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-5xl font-extrabold">{r.overallScore}%</div>
            <div className="text-xs uppercase tracking-wide text-indigo-100">Overall</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <h3 className="mb-5 font-display font-bold text-foreground">Skill breakdown</h3>
            <div className="mb-6 space-y-4">
              {r.skills.map((s) => (
                <SkillScoreBar key={s.label} {...s} />
              ))}
            </div>
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <BarChart data={r.skills} margin={{ top: 6, right: 6, bottom: 0, left: -24 }}>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={42}>
                    {r.skills.map((s) => (
                      <Cell key={s.label} fill={s.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <AlertCircle size={18} className="text-amber-500" />
              <h3 className="font-display font-bold text-foreground">Things to fix</h3>
            </div>
            <div className="space-y-3">
              {r.mistakes.map((m) => (
                <div key={m.label} className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-sm font-semibold text-foreground">{m.label}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{m.example}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <AIInsightCard title="AI recommendations" icon={<Sparkles size={18} />}>
            <div className="rounded-xl bg-white/95 p-4">
              <RecommendationList items={r.recommendations} />
            </div>
          </AIInsightCard>

          {/* Human instructor note — deliberately separate from AI output. */}
          <Card className="border-indigo-100 bg-indigo-50/40 p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${instructor.accent} text-xs font-bold text-white`}>
                {instructor.initials}
              </span>
              <div>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <MessageSquareQuote size={14} className="text-indigo-600" /> Note from {instructor.name}
                </div>
                <div className="text-xs text-muted-foreground">Your instructor — not AI</div>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-foreground">{r.instructorNote}</p>
          </Card>

          <Button asChild className="w-full">
            <Link to="/student/book">
              Book a follow-up session <ArrowRight size={16} />
            </Link>
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
