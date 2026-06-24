import { Link } from "react-router";
import { ArrowRight, Sparkles, Clock, Users } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/cards";
import { AIBadge } from "@/components/ai";
import { instructors, topics, bookings, currentStudent } from "@/data/mockData";

export function InstructorDashboardPage() {
  const me = instructors[0];
  const myTopics = topics.filter((t) => t.instructorId === me.id);
  const upcoming = bookings.filter((b) => b.status === "upcoming");

  return (
    <DashboardLayout>
      <PageHeader
        title={`Hello, ${me.name.split(" ")[0]} 👋`}
        subtitle="Your sessions, topics, and AI-assisted prep."
        action={
          <Button asChild size="sm">
            <Link to="/instructor/topics">
              New topic <ArrowRight size={15} />
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon="CalendarClock" value={`${upcoming.length}`} label="Upcoming sessions" tone="bg-indigo-100 text-indigo-600" />
        <StatCard icon="Users" value="38" label="Active students" tone="bg-emerald-100 text-emerald-600" />
        <StatCard icon="PenSquare" value={`${myTopics.length}`} label="Topics owned" tone="bg-purple-100 text-purple-600" />
        <StatCard icon="Star" value={`${me.rating}`} label="Average rating" tone="bg-amber-100 text-amber-600" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display font-bold text-foreground">Today&apos;s sessions</h3>
              <Link to="/instructor/availability" className="text-xs font-semibold text-indigo-600 hover:underline">
                Manage availability
              </Link>
            </div>
            <div className="space-y-3">
              {upcoming.length === 0 && <p className="text-sm text-muted-foreground">No sessions scheduled.</p>}
              {upcoming.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                      <Clock size={18} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{b.topicTitle}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.date} · {b.time} · with {currentStudent.name}
                      </div>
                    </div>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/student/session/${b.id}`}>Open room</Link>
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display font-bold text-foreground">Your topics</h3>
              <Button asChild variant="link" size="sm">
                <Link to="/instructor/topics">Edit topics</Link>
              </Button>
            </div>
            <div className="space-y-3">
              {myTopics.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{t.title}</span>
                      {t.published ? <Badge tone="emerald">Published</Badge> : <Badge tone="amber">Draft</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {t.questions.length} questions · {t.subtopics.length} subtopics · {t.level}
                    </div>
                  </div>
                  <Users size={16} className="flex-shrink-0 text-muted-foreground" />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <AIBadge label="AI assist" />
            </div>
            <h3 className="mb-1 font-display font-bold text-foreground">Prep faster with AI</h3>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              When you create a topic, AI suggests subtopics and discussion questions. You stay in control — nothing
              is added until you accept it.
            </p>
            <Button asChild className="w-full">
              <Link to="/instructor/topics">
                <Sparkles size={15} /> Build a topic
              </Link>
            </Button>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-display font-bold text-foreground">This week</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Sessions hosted</span>
                <span className="font-bold text-foreground">14</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Hours taught</span>
                <span className="font-bold text-foreground">10.5</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">New reviews</span>
                <span className="font-bold text-foreground">9</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
