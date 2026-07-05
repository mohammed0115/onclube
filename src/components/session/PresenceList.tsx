import { cn } from "@/lib/utils";
import type { AttendanceRecord, AttendanceStatus } from "@/lib/presence";

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const STATUS_BADGE: Record<AttendanceStatus, { label: string; cls: string }> = {
  present: { label: "Present", cls: "bg-emerald-100 text-emerald-700" },
  late: { label: "Late", cls: "bg-amber-100 text-amber-700" },
  left_early: { label: "Left early", cls: "bg-orange-100 text-orange-700" },
  completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-700" },
  absent: { label: "Absent", cls: "bg-slate-100 text-slate-500" },
};

// Pure: the current participants list with presence dot, role, status + timer.
export function PresenceList({ participants, myId }: { participants: AttendanceRecord[]; myId: string }) {
  if (participants.length === 0) {
    return <p className="py-4 text-center text-xs text-slate-400">No participants yet.</p>;
  }
  return (
    <ul className="space-y-1.5" aria-label="Participants">
      {participants.map((p) => {
        const badge = STATUS_BADGE[p.attendanceStatus];
        return (
          <li key={p.participantId} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <span
              className={cn("h-2 w-2 flex-shrink-0 rounded-full", p.currentlyPresent ? "bg-emerald-500" : "bg-slate-300")}
              aria-label={p.currentlyPresent ? "Present" : "Left"}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900">
                {p.participantName}
                {p.participantId === myId ? " (You)" : ""}
              </div>
              <div className="text-[11px] capitalize text-slate-500">{p.role}</div>
            </div>
            <span className="tabular-nums text-[11px] text-slate-500" data-testid={`presence-timer-${p.participantId}`}>
              {formatDuration(p.totalPresenceDuration)}
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", badge.cls)}>{badge.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
