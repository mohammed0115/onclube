import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { MessageSquareText, BookMarked, CheckCircle2, ArrowRight, CalendarClock } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AIBadge } from "@/components/ai";
import { InstructorChip } from "@/components/cards";
import { topics, instructors, availability } from "@/data/mockData";
import { cn } from "@/lib/utils";

export function QuestionsPreviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const topic = topics.find((t) => t.id === id) ?? topics[0];
  const instructor = instructors.find((i) => i.id === topic.instructorId) ?? instructors[0];

  const day = availability[0];
  const openSlots = day.slots.filter((s) => s.available);
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <DashboardLayout>
      <PageHeader
        title={topic.title}
        subtitle="Review these before your session so you can practise with confidence."
        back="/student/book"
        action={<Badge tone="indigo">{topic.level}</Badge>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <MessageSquareText size={18} className="text-indigo-600" />
              <h3 className="font-display font-bold text-foreground">Discussion questions</h3>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Your instructor will guide the conversation around these. Some were drafted with AI assistance and
              approved by the instructor.
            </p>
            <ol className="space-y-3">
              {topic.questions.map((q, i) => (
                <li key={q.id} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-foreground">{q.text}</p>
                    {q.aiAssisted && <AIBadge className="mt-2" />}
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <BookMarked size={18} className="text-purple-600" />
              <h3 className="font-display font-bold text-foreground">Vocabulary to use</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {topic.vocabulary.map((w) => (
                <span key={w} className="rounded-full bg-purple-50 px-3 py-1 text-sm font-medium text-purple-700">
                  {w}
                </span>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-1 font-display font-bold text-foreground">Subtopics covered</h3>
            <p className="mb-3 text-xs text-muted-foreground">What the instructor plans to walk through.</p>
            <div className="space-y-2">
              {topic.subtopics.map((s) => (
                <div key={s.id} className="flex items-start gap-2 text-sm text-foreground">
                  <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0 text-emerald-500" />
                  <span>
                    {s.title}
                    {s.aiGenerated && <AIBadge className="ml-2 align-middle" label="AI" />}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-display font-bold text-foreground">Your instructor</h3>
            <InstructorChip instructor={instructor} />
            <p className="mt-3 text-xs text-muted-foreground">{instructor.headline}</p>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <CalendarClock size={16} className="text-indigo-600" />
              <h3 className="font-display font-bold text-foreground">Pick a time</h3>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">Available on {day.day} Jun</p>
            <div className="mb-4 grid grid-cols-3 gap-2">
              {openSlots.map((s) => (
                <button
                  key={s.time}
                  onClick={() => setPicked(s.time)}
                  className={cn(
                    "rounded-xl border py-2 text-sm font-semibold transition-all",
                    picked === s.time
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-border text-foreground hover:border-indigo-200"
                  )}
                >
                  {s.time}
                </button>
              ))}
            </div>
            <Button
              className="w-full"
              disabled={!picked}
              onClick={() => navigate(`/student/session/b1`)}
            >
              {picked ? `Book ${picked}` : "Select a time"} <ArrowRight size={16} />
            </Button>
            <Button asChild variant="link" size="sm" className="mt-2 w-full">
              <Link to="/student/session/b1">Or join the live room now</Link>
            </Button>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
