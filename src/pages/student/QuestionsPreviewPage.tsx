import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { MessageSquareText, BookMarked, CheckCircle2, ArrowRight, CalendarClock, Lock } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AIBadge } from "@/components/ai";
import { InstructorChip } from "@/components/cards";
import { useStudentTopic, useOpenSlots, useCreateBooking } from "@/hooks";
import { Loading, ErrorState } from "@/components/states";
import { ApiError } from "@/api";
import type { TopicFull, TopicPreview } from "@/api/types";
import type { Instructor } from "@/types";
import { cn } from "@/lib/utils";

function isFull(t: TopicPreview | TopicFull): t is TopicFull {
  return t.mode === "full";
}

/** Minimal instructor chip from the topic's denormalized instructor name. */
function toInstructor(t: TopicPreview): Instructor {
  const initials = t.instructorName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  return {
    id: t.instructorId,
    name: t.instructorName,
    initials,
    flag: "",
    country: "",
    headline: t.instructorHeadline ?? "",
    rating: 0,
    sessionsHosted: 0,
    accent: "from-amber-400 to-orange-500",
  };
}

function fmtSlot(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function QuestionsPreviewPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const topicQuery = useStudentTopic(id);
  const createBooking = useCreateBooking();
  const [picked, setPicked] = useState<string | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);

  const topic = topicQuery.data;
  const slotsQuery = useOpenSlots(topic?.instructorId ?? "");

  if (topicQuery.isLoading) {
    return (
      <DashboardLayout>
        <Loading label="Loading topic…" />
      </DashboardLayout>
    );
  }
  if (topicQuery.isError || !topic) {
    return (
      <DashboardLayout>
        <ErrorState error={topicQuery.error} onRetry={() => topicQuery.refetch()} />
      </DashboardLayout>
    );
  }

  const full = isFull(topic);
  const instructor = toInstructor(topic);
  const openSlots = slotsQuery.data ?? [];

  async function book() {
    if (!picked) return;
    setBookError(null);
    try {
      await createBooking.mutateAsync({ topicId: id, slotId: picked });
      navigate("/student");
    } catch (err) {
      if (err instanceof ApiError) {
        const map: Record<string, string> = {
          slot_unavailable: "That time was just taken — pick another.",
          no_sessions_remaining: "You have no sessions remaining.",
          subscription_expired: "Your subscription has expired.",
          no_active_subscription: "An approved subscription is required to book.",
        };
        setBookError(map[err.code] ?? "Could not book this session. Please try again.");
      } else {
        setBookError("Could not book this session. Please try again.");
      }
    }
  }

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

            {full ? (
              <>
                <p className="mb-4 text-xs text-muted-foreground">
                  Your instructor will guide the conversation around these. Some were drafted with AI assistance and
                  approved by the instructor.
                </p>
                <ol className="space-y-3">
                  {(topic as TopicFull).questions.map((q, i) => (
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
              </>
            ) : (
              <>
                <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <Lock size={13} className="mt-0.5 flex-shrink-0" />
                  Full discussion questions unlock once your booking is confirmed. Here&apos;s a preview of what
                  you&apos;ll practise:
                </div>
                <ol className="space-y-3">
                  {topic.samplePrompts.map((p, i) => (
                    <li key={i} className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-muted/30 p-4">
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                      <p className="flex-1 text-sm text-muted-foreground">{p.text}</p>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </Card>

          {full && (
            <Card className="p-6">
              <div className="mb-4 flex items-center gap-2">
                <BookMarked size={18} className="text-purple-600" />
                <h3 className="font-display font-bold text-foreground">Vocabulary to use</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {(topic as TopicFull).vocabulary.map((w) => (
                  <span key={w} className="rounded-full bg-purple-50 px-3 py-1 text-sm font-medium text-purple-700">
                    {w}
                  </span>
                ))}
              </div>
            </Card>
          )}
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
                    {s.ai_generated && <AIBadge className="ml-2 align-middle" label="AI" />}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-display font-bold text-foreground">Your instructor</h3>
            <InstructorChip instructor={instructor} />
            {topic.instructorHeadline && <p className="mt-3 text-xs text-muted-foreground">{topic.instructorHeadline}</p>}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <CalendarClock size={16} className="text-indigo-600" />
              <h3 className="font-display font-bold text-foreground">Pick a time</h3>
            </div>

            {slotsQuery.isLoading && <Loading label="Loading times…" />}
            {slotsQuery.isError && <ErrorState error={slotsQuery.error} onRetry={() => slotsQuery.refetch()} />}
            {slotsQuery.data && openSlots.length === 0 && (
              <p className="mb-3 text-xs text-muted-foreground">No open times right now — check back soon.</p>
            )}

            {openSlots.length > 0 && (
              <div className="mb-4 grid grid-cols-1 gap-2">
                {openSlots.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setPicked(s.id)}
                    className={cn(
                      "rounded-xl border py-2 text-sm font-semibold transition-all",
                      picked === s.id
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-border text-foreground hover:border-indigo-200"
                    )}
                  >
                    {fmtSlot(s.startAt)}
                  </button>
                ))}
              </div>
            )}

            {bookError && (
              <p role="alert" className="mb-3 text-sm font-medium text-red-600">
                {bookError}
              </p>
            )}

            <Button className="w-full" disabled={!picked || createBooking.isPending} onClick={book}>
              {createBooking.isPending ? "Booking…" : picked ? "Confirm booking" : "Select a time"}{" "}
              <ArrowRight size={16} />
            </Button>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
