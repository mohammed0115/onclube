import { useState } from "react";
import { CalendarCheck, Check, X, Clock } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loading, EmptyState } from "@/components/states";
import { useAdminScheduleRequests, useApproveSchedule, useRejectSchedule } from "@/hooks";
import { useI18n } from "@/i18n";

// Backend weekday: 0 = Monday … 6 = Sunday.
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function AdminSchedulingRequestsPage() {
  const { tx } = useI18n();
  const { data, isLoading } = useAdminScheduleRequests();
  const approve = useApproveSchedule();
  const reject = useRejectSchedule();
  const [busy, setBusy] = useState<string | null>(null);

  const groups = data ?? [];

  const onApprove = (studentId: string) => {
    setBusy(studentId);
    approve.mutate({ studentId }, { onSettled: () => setBusy(null) });
  };

  const onApprovePick = (studentId: string, slotId: string) => {
    setBusy(slotId);
    approve.mutate({ studentId, slotIds: [slotId] }, { onSettled: () => setBusy(null) });
  };

  const onReject = (slotId: string) => {
    const note = window.prompt(
      tx("Why is this pick being rejected? (the student sees this message)") || "",
      "",
    );
    if (note === null) return; // cancelled the prompt
    setBusy(slotId);
    reject.mutate({ slotId, note }, { onSettled: () => setBusy(null) });
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Scheduling requests"
        subtitle="Review each student's weekly picks. Approving books their upcoming sessions and notifies the instructor."
      />

      {isLoading ? (
        <Loading label="Loading requests…" />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck size={26} className="text-muted-foreground" />}
          title="No pending requests"
          description="When students submit or edit their weekly schedule, it appears here for review."
        />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.studentId} className="overflow-hidden p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-2 p-4">
                <div className="min-w-0">
                  <div className="truncate font-display text-sm font-bold text-foreground">{g.studentName}</div>
                  <div className="truncate text-xs text-muted-foreground">{g.studentEmail}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="amber" className="gap-1">
                    <Clock size={12} /> {g.picks.length} {tx("pending")}
                  </Badge>
                  <Button
                    size="sm"
                    onClick={() => onApprove(g.studentId)}
                    disabled={busy === g.studentId}
                  >
                    <Check size={15} /> {busy === g.studentId ? tx("Approving…") : tx("Approve all")}
                  </Button>
                </div>
              </div>
              <div className="divide-y divide-border">
                {g.picks.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{p.topicTitle}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {tx(WEEKDAYS[p.weekday] ?? "—")} · {p.startTime} · {p.durationMinutes} {tx("min")} · {p.instructorName}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <Button
                        variant="soft"
                        size="sm"
                        onClick={() => onApprovePick(g.studentId, p.id)}
                        disabled={busy === p.id || busy === g.studentId}
                      >
                        <Check size={15} /> {busy === p.id ? tx("Approving…") : tx("Approve")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onReject(p.id)}
                        disabled={busy === p.id || busy === g.studentId}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <X size={15} /> {busy === p.id ? tx("Rejecting…") : tx("Reject")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
