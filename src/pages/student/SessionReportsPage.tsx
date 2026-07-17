import { Link } from "react-router";
import { FileBarChart, ArrowRight, CalendarDays } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loading, ErrorState, EmptyState } from "@/components/states";
import { useMyBookings } from "@/hooks";

function fmt(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Lists every session that has a generated AI report, linking to each real report. */
export function SessionReportsPage() {
  const query = useMyBookings();

  return (
    <DashboardLayout>
      <PageHeader title="Session reports" subtitle="Your AI feedback from completed sessions." />

      {query.isLoading && <Loading label="Loading your reports…" />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}

      {query.data && (() => {
        const withReports = query.data.filter((b) => b.reportId);
        if (withReports.length === 0)
          return (
            <EmptyState
              icon={<FileBarChart size={26} className="text-indigo-500" />}
              title="No reports yet"
              description="After you complete a live session, your AI session report will appear here."
              action={
                <Button asChild>
                  <Link to="/student/book">Book a session <ArrowRight size={16} /></Link>
                </Button>
              }
            />
          );
        return (
          <div className="space-y-3">
            {withReports.map((b) => (
              <Card key={b.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-foreground">{b.topicTitle}</span>
                    <Badge tone="emerald">Report ready</Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays size={13} /> {fmt(b.scheduledAt)} · {b.instructorName}
                  </div>
                </div>
                <Button asChild size="sm" className="flex-shrink-0">
                  <Link to={`/student/report/${b.reportId}`}>View report <ArrowRight size={15} /></Link>
                </Button>
              </Card>
            ))}
          </div>
        );
      })()}
    </DashboardLayout>
  );
}
