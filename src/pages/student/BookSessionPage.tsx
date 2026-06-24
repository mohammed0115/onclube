import { Link } from "react-router";
import { Lock, ArrowRight } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TopicCard } from "@/components/cards";
import { useAppState } from "@/app/AppState";
import { topics } from "@/data/mockData";

export function BookSessionPage() {
  const { canBook } = useAppState();
  const published = topics.filter((t) => t.published);
  const categories = Array.from(new Set(published.map((t) => t.category)));

  if (!canBook) {
    return (
      <DashboardLayout>
        <PageHeader title="Book a session" subtitle="Choose a topic to practise with an instructor." />
        <Card className="mx-auto max-w-md p-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <Lock size={26} className="text-amber-600" />
          </div>
          <h2 className="font-display text-xl font-bold text-foreground">Booking is locked</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
            You can book live sessions once an admin approves your payment. We&apos;ll email you the moment it&apos;s
            ready.
          </p>
          <Button asChild className="mt-6">
            <Link to="/billing/under-review">
              Check payment status <ArrowRight size={16} />
            </Link>
          </Button>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Book a session"
        subtitle="Pick a topic — you'll preview the discussion questions before choosing a time."
        action={<Badge tone="emerald">Payment approved</Badge>}
      />

      <div className="space-y-8">
        {categories.map((cat) => (
          <div key={cat}>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">{cat}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {published
                .filter((t) => t.category === cat)
                .map((t) => (
                  <TopicCard key={t.id} topic={t} to={`/student/questions/${t.id}`} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}
