import { useState } from "react";
import { CalendarCheck, Check, X, Clock, Repeat } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loading, EmptyState } from "@/components/states";
import {
  useAdminScheduleRequests,
  useApproveSchedule,
  useRejectSchedule,
  useAdminTopics,
  useReassignSchedule,
} from "@/hooks";
import type { SchedulePick, AdminTopicOption } from "@/api/types";
import { useI18n } from "@/i18n";

// Backend weekday: 0 = Monday … 6 = Sunday.
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function PickRow({
  pick,
  studentId,
  topics,
  busy,
  onApprove,
  onReject,
  onReassign,
}: {
  pick: SchedulePick;
  studentId: string;
  topics: AdminTopicOption[];
  busy: string | null;
  onApprove: (studentId: string, slotId: string) => void;
  onReject: (slotId: string) => void;
  onReassign: (slotId: string, topicId: string) => void;
}) {
  const { tx } = useI18n();
  const [choice, setChoice] = useState<string>(pick.topicId);
  const isBusy = busy === pick.id || busy === studentId;
  const changed = choice !== pick.topicId;

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-foreground">{pick.topicTitle}</div>
        <div className="truncate text-xs text-muted-foreground">
          {tx(WEEKDAYS[pick.weekday] ?? "—")} · {pick.startTime} · {pick.durationMinutes} {tx("min")} · {pick.instructorName}
        </div>
        {/* Reassign: pick a different topic (which carries its own instructor). */}
        {topics.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            <Repeat size={13} className="text-muted-foreground" />
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              disabled={isBusy}
              className="max-w-[16rem] rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} · {t.instructorName}
                </option>
              ))}
            </select>
            {changed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onReassign(pick.id, choice)}
                disabled={isBusy}
              >
                {tx("Reassign")}
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-1">
        <Button
          variant="soft"
          size="sm"
          onClick={() => onApprove(studentId, pick.id)}
          disabled={isBusy}
        >
          <Check size={15} /> {busy === pick.id ? tx("Approving…") : tx("Approve")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onReject(pick.id)}
          disabled={isBusy}
          className="text-red-600 hover:bg-red-50"
        >
          <X size={15} /> {busy === pick.id ? tx("Rejecting…") : tx("Reject")}
        </Button>
      </div>
    </div>
  );
}

export function AdminSchedulingRequestsPage() {
  const { tx } = useI18n();
  const { data, isLoading } = useAdminScheduleRequests();
  const { data: topics = [] } = useAdminTopics();
  const approve = useApproveSchedule();
  const reject = useRejectSchedule();
  const reassign = useReassignSchedule();
  const [busy, setBusy] = useState<string | null>(null);

  const groups = data ?? [];

  const onApproveAll = (studentId: string) => {
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
    if (note === null) return;
    setBusy(slotId);
    reject.mutate({ slotId, note }, { onSettled: () => setBusy(null) });
  };

  const onReassign = (slotId: string, topicId: string) => {
    setBusy(slotId);
    reassign.mutate({ slotId, topicId }, { onSettled: () => setBusy(null) });
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Scheduling requests"
        subtitle="Review each student's weekly picks. Approving books their upcoming sessions and notifies the instructor. You can reassign a pick to another topic/instructor before approving."
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
                    onClick={() => onApproveAll(g.studentId)}
                    disabled={busy === g.studentId}
                  >
                    <Check size={15} /> {busy === g.studentId ? tx("Approving…") : tx("Approve all")}
                  </Button>
                </div>
              </div>
              <div className="divide-y divide-border">
                {g.picks.map((p) => (
                  <PickRow
                    key={p.id}
                    pick={p}
                    studentId={g.studentId}
                    topics={topics}
                    busy={busy}
                    onApprove={onApprovePick}
                    onReject={onReject}
                    onReassign={onReassign}
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
