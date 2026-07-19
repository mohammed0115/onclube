// Presence container — wires the useSessionPresence hook to the pure indicator +
// list + summary. This is the only place the hook meets the UI; every child
// stays presentation-only. Rendered as an overlay: a compact "present" pill that
// opens the participants list + attendance summary.
import { useState } from "react";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { ParticipantRole } from "@/lib/presence";
import { useSessionPresence } from "@/hooks";
import { PresenceList } from "./PresenceList";
import { AttendanceSummary } from "./AttendanceSummary";

export function SessionPresence({
  sessionId,
  participantId,
  participantName,
  role,
}: {
  sessionId: string;
  participantId: string;
  participantName: string;
  role: ParticipantRole;
}) {
  const { tx } = useI18n();
  const presence = useSessionPresence({ sessionId, participantId, participantName, role });
  const [open, setOpen] = useState(false);
  const reconnecting = presence.connectionState === "reconnecting";

  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        aria-label={`Participants (${presence.presentCount} present)`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-black/70",
          reconnecting && "ring-1 ring-amber-400"
        )}
      >
        <Users size={14} />
        <span data-testid="present-count">{presence.presentCount}</span>
        {reconnecting && <span className="text-amber-300">{tx("reconnecting…")}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-72 rounded-2xl bg-white p-3 text-slate-900 shadow-xl">
          <div className="mb-2 text-xs font-semibold text-slate-700">{tx("Attendance")}</div>
          <AttendanceSummary participants={presence.participants} finalized={presence.attendance.finalized} />
          <div className="my-2 h-px bg-slate-100" />
          <PresenceList participants={presence.participants} myId={participantId} />
        </div>
      )}
    </div>
  );
}
