import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import type { RecordingConnectionState, RecordingStatus } from "@/lib/recording";

export function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Pure: shows the current recording state to EVERYONE in the room (viewers too).
export function RecordingIndicator({
  status,
  elapsedSeconds,
  connectionState,
}: {
  status: RecordingStatus;
  elapsedSeconds: number;
  connectionState: RecordingConnectionState;
}) {
  if (status === "idle" || status === "cancelled") return null;

  if (status === "recording") {
    return (
      <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur" role="status" aria-live="polite">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-label="Recording" />
        <span>REC</span>
        <span className="tabular-nums" data-testid="recording-timer">{formatTimer(elapsedSeconds)}</span>
        {connectionState === "reconnecting" && <span className="text-amber-300">· reconnecting…</span>}
      </div>
    );
  }

  if (status === "processing") {
    return (
      <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur" role="status" aria-live="polite">
        <Loader2 size={13} className="animate-spin text-amber-300" /> Processing recording…
      </div>
    );
  }

  if (status === "completed") {
    return (
      <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-emerald-300 backdrop-blur" role="status">
        <CheckCircle2 size={13} /> Recording saved
      </div>
    );
  }

  // failed
  return (
    <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-red-300 backdrop-blur" role="alert">
      <TriangleAlert size={13} /> Recording failed
    </div>
  );
}
