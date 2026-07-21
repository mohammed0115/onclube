import { useState } from "react";
import { CalendarCheck, Check, X, Clock, UserCog, AlertTriangle } from "lucide-react";
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
  useAssignScheduleInstructor,
} from "@/hooks";
import type { SchedulePick } from "@/api/types";
import { useI18n } from "@/i18n";

// Backend weekday: 0 = Monday … 6 = Sunday.
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function PickRow({
  pick,
  studentId,
  busy,
  onApprove,
  onReject,
  onAssign,
}: {
  pick: SchedulePick;
  studentId: string;
  busy: string | null;
  onApprove: (studentId: string, slotId: string) => void;
  onReject: (slotId: string) => void;
  onAssign: (slotId: string, instructorId: string) => void;
}) {
  const { tx } = useI18n();
  const candidates = pick.instructorCandidates ?? [];
  const [choice, setChoice] = useState<string>(pick.instructorId ?? "");
  const isBusy = busy === pick.id || busy === studentId;
  const changed = choice && choice !== pick.instructorId;
  const noInstructor = candidates.length === 0 && !pick.instructorId;

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-foreground">
          {tx(WEEKDAYS[pick.weekday] ?? "—")} · {pick.startTime} · {pick.durationMinutes} {tx("min")}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <UserCog size={13} className="text-muted-foreground" />
          {noInstructor ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
              <AlertTriangle size={12} /> {tx("No instructor available at this time")}
            </span>
          ) : (
            <>
              <select
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                disabled={isBusy}
                className="max-w-[15rem] rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
              >
                {!pick.instructorId && <option value="">{tx("Select an instructor…")}</option>}
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                {/* Keep the current assignment selectable even if not in the free list. */}
                {pick.instructorId && !candidates.some((c) => c.id === pick.instructorId) && (
                  <option value={pick.instructorId}>{pick.instructorName}</option>
                )}
              </select>
              {changed && (
                <Button variant="ghost" size="sm" onClick={() => onAssign(pick.id, choice)} disabled={isBusy}>
                  {tx("Assign")}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1">
        <Button
          variant="soft"
          size="sm"
          onClick={() => onApprove(studentId, pick.id)}
          disabled={isBusy || noInstructor || !pick.instructorId}
          title={!pick.instructorId ? tx("Assign an instructor first") : undefined}
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
  const approve = useApproveSchedule();
  const reject = useRejectSchedule();
  const assign = useAssignScheduleInstructor();
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
  const onAssign = (slotId: string, instructorId: string) => {
    setBusy(slotId);
    assign.mutate({ slotId, instructorId }, { onSettled: () => setBusy(null) });
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Scheduling requests"
        subtitle="Students share the times they're free; the system assigns the nearest available instructor. Confirm or change the instructor, then approve to book the sessions."
      />

      {isLoading ? (
        <Loading label="Loading requests…" />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck size={26} className="text-muted-foreground" />}
          title="No pending requests"
          description="When students submit or edit their weekly availability, it appears here for review."
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
                  <Button size="sm" onClick={() => onApproveAll(g.studentId)} disabled={busy === g.studentId}>
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
                    busy={busy}
                    onApprove={onApprovePick}
                    onReject={onReject}
                    onAssign={onAssign}
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
