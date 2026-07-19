import { Link } from "react-router";
import { Lock, ArrowRight } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TopicCard } from "@/components/cards";
import { useSubscription, useStudentTopics } from "@/hooks";
import { Loading, ErrorState, EmptyState } from "@/components/states";
import { useI18n } from "@/i18n";
import type { TopicPreview } from "@/api/types";
import type { Topic } from "@/types";

const ACCENTS: Record<string, string> = {
  Career: "from-indigo-500 to-indigo-600",
  Daily: "from-emerald-500 to-emerald-600",
  Exam: "from-purple-500 to-purple-600",
  Travel: "from-sky-500 to-sky-600",
};

/** Adapt an API topic preview to the card view model (icon/accent not in the DTO). */
function toTopicCard(p: TopicPreview): Topic {
  return {
    id: p.id,
    title: p.title,
    category: p.category,
    icon: "MessageCircle",
    accent: ACCENTS[p.category] ?? "from-indigo-500 to-indigo-600",
    description: p.description ?? "",
    level: p.level,
    instructorId: p.instructorId,
    subtopics: [],
    questions: [],
    vocabulary: [],
    published: true,
  };
}

function LockedScreen() {
  const { tx } = useI18n();
  return (
    <DashboardLayout>
      <PageHeader title="Book a session" subtitle="Choose a topic to practise with an instructor." />
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
          <Lock size={26} className="text-amber-600" />
        </div>
        <h2 className="font-display text-xl font-bold text-foreground">{tx("Booking is locked")}</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
          {tx("You can book live sessions once an admin approves your payment. We'll email you the moment it's ready.")}
        </p>
        <Button asChild className="mt-6">
          <Link to="/billing/under-review">
            {tx("Check payment status")} <ArrowRight size={16} />
          </Link>
        </Button>
      </Card>
    </DashboardLayout>
  );
}

export function BookSessionPage() {
  const { tx } = useI18n();
  const sub = useSubscription();
  const topicsQuery = useStudentTopics();

  if (sub.isLoading) {
    return (
      <DashboardLayout>
        <Loading label="Checking your subscription…" />
      </DashboardLayout>
    );
  }

  const canBook = sub.data?.status === "active";
  if (!canBook) return <LockedScreen />;

  const topics = topicsQuery.data ?? [];
  const categories = Array.from(new Set(topics.map((t) => t.category)));

  return (
    <DashboardLayout>
      <PageHeader
        title="Book a session"
        subtitle="Pick a topic — you'll preview the discussion questions before choosing a time."
        action={<Badge tone="emerald">{tx("Payment approved")}</Badge>}
      />

      {topicsQuery.isLoading && <Loading label="Loading topics…" />}
      {topicsQuery.isError && <ErrorState error={topicsQuery.error} onRetry={() => topicsQuery.refetch()} />}
      {topicsQuery.data && topics.length === 0 && (
        <EmptyState title="No topics available yet" description="Check back soon — instructors are preparing new topics." />
      )}

      {topics.length > 0 && (
        <div className="space-y-8">
          {categories.map((cat) => (
            <div key={cat}>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">{cat}</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {topics
                  .filter((t) => t.category === cat)
                  .map((t) => (
                    <TopicCard key={t.id} topic={toTopicCard(t)} to={`/student/book/${t.id}`} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
