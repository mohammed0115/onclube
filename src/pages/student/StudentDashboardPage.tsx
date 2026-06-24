import { Link } from "react-router";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Calendar, Lock, ArrowRight, Sparkles, Clock } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard, BookingRow, InstructorChip } from "@/components/cards";
import { PaymentStatusBadge } from "@/components/payment";
import { AIBadge } from "@/components/ai";
import { useAppState } from "@/app/AppState";
import { currentStudent, bookings, instructors, progressTrend, sessionReport } from "@/data/mockData";

export function StudentDashboardPage() {
  const { canBook, paymentStatus } = useAppState();
  const upcoming = bookings.filter((b) => b.status === "upcoming");
  const nextSession = upcoming[0];
  const nextInstructor = nextSession && instructors.find((i) => i.id === nextSession.instructorId);

  return (
    <DashboardLayout>
      <PageHeader
        title={`Welcome back, ${currentStudent.name.split(" ")[0]} 👋`}
        subtitle="Here's your conversation practice at a glance."
        action={<PaymentStatusBadge status={paymentStatus} />}
      />

      {!canBook && (
        <Card className="mb-6 border-amber-200 bg-amber-50 p-5">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100">
                <Lock size={18} className="text-amber-600" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">Booking is locked</div>
                <p className="text-xs text-muted-foreground">
                  Your payment is being reviewed by an admin. Booking unlocks once it&apos;s approved.
                </p>
              </div>
            </div>
            <Button asChild variant="ghost" size="sm" className="flex-shrink-0">
              <Link to="/billing/under-review">Check status</Link>
            </Button>
          </div>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon="Calendar" value={`${currentStudent.sessionsRemaining}`} label="Sessions remaining" tone="bg-indigo-100 text-indigo-600" />
        <StatCard icon="CheckCircle" value="12" label="Sessions completed" tone="bg-emerald-100 text-emerald-600" />
        <StatCard icon="TrendingUp" value="82%" label="Latest session score" hint="+6 vs last" tone="bg-purple-100 text-purple-600" />
        <StatCard icon="Award" value={currentStudent.level} label="Current level" tone="bg-amber-100 text-amber-600" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display font-bold text-foreground">Progress over sessions</h3>
              <span className="text-xs text-muted-foreground">Last 6 sessions</span>
            </div>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <AreaChart data={progressTrend} margin={{ top: 6, right: 6, bottom: 0, left: -24 }}>
                  <defs>
                    <linearGradient id="score" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#7C3AED" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} />
                  <YAxis domain={[40, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} />
                  <Tooltip cursor={{ stroke: "#c7d2fe" }} contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                  <Area type="monotone" dataKey="score" stroke="#7C3AED" strokeWidth={2.5} fill="url(#score)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display font-bold text-foreground">Recent sessions</h3>
              <Link to={`/student/report/${sessionReport.id}`} className="text-xs font-semibold text-indigo-600 hover:underline">
                View all
              </Link>
            </div>
            <div className="space-y-3">
              {bookings.map((b) => (
                <BookingRow key={b.id} booking={b} reportTo={b.reportId ? `/student/report/${b.reportId}` : undefined} />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {nextSession && nextInstructor ? (
            <Card className="overflow-hidden p-0">
              <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-5 text-white">
                <div className="mb-1 flex items-center gap-2 text-xs font-medium text-indigo-100">
                  <Clock size={13} /> Next session · {nextSession.date}
                </div>
                <div className="font-display text-lg font-bold">{nextSession.topicTitle}</div>
                <div className="text-sm text-indigo-100">
                  {nextSession.time} · {nextSession.durationMinutes} min
                </div>
              </div>
              <div className="space-y-4 p-5">
                <InstructorChip instructor={nextInstructor} />
                <div className="flex items-center gap-2 rounded-xl bg-purple-50 px-3 py-2 text-xs text-purple-700">
                  <Sparkles size={13} /> Your discussion questions are ready to preview.
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/student/questions/${nextSession.topicId}`}>Questions</Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link to={`/student/session/${nextSession.id}`}>Join room</Link>
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}

          <Card className="p-5">
            <h3 className="mb-1 font-display font-bold text-foreground">Book your next session</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Pick a topic, preview the questions, then choose a time with an instructor.
            </p>
            {canBook ? (
              <Button asChild className="w-full">
                <Link to="/student/book">
                  Browse topics <ArrowRight size={16} />
                </Link>
              </Button>
            ) : (
              <Button disabled className="w-full" variant="soft">
                <Lock size={15} /> Locked until approval
              </Button>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <AIBadge label="AI tip" />
            </div>
            <p className="text-sm leading-relaxed text-foreground">
              Based on your last report, spend 10 minutes reviewing irregular past-tense verbs before your next
              session.
            </p>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
