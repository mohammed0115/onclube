import type { AttendanceRecord } from "@/lib/presence";
import { useI18n } from "@/i18n";

// Pure: a compact attendance summary (counts only — no scores/analytics/exports).
export function AttendanceSummary({ participants, finalized }: { participants: AttendanceRecord[]; finalized: boolean }) {
  const { tx } = useI18n();
  const present = participants.filter((p) => p.currentlyPresent).length;
  const late = participants.filter((p) => p.attendanceStatus === "late").length;
  const leftEarly = participants.filter((p) => p.attendanceStatus === "left_early").length;
  const completed = participants.filter((p) => p.attendanceStatus === "completed").length;

  return (
    <div className="grid grid-cols-2 gap-1.5 text-xs" aria-label={tx("Attendance summary")}>
      <Stat label={tx("Present")} value={present} />
      <Stat label={tx("Late")} value={late} />
      <Stat label={tx("Left early")} value={leftEarly} />
      <Stat label={tx("Completed")} value={completed} />
      <div className="col-span-2 pt-1 text-[10px] uppercase tracking-wide text-slate-400">
        {finalized ? tx("Attendance locked") : tx("Live")}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900 tabular-nums">{value}</span>
    </div>
  );
}
