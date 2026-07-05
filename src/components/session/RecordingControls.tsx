import { Circle, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecordingConnectionState, RecordingStatus } from "@/lib/recording";

// Pure: the instructor-only start/stop control. Rendered ONLY when canControl is
// true (students/admin never see it). All state/logic is passed in.
export function RecordingControls({
  status,
  connectionState,
  onStart,
  onStop,
}: {
  status: RecordingStatus;
  connectionState: RecordingConnectionState;
  onStart: () => void;
  onStop: () => void;
}) {
  const disconnected = connectionState !== "connected" && connectionState !== "reconnecting";

  if (status === "processing") {
    return (
      <button type="button" disabled aria-label="Recording processing" className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70">
        Processing…
      </button>
    );
  }

  if (status === "recording") {
    return (
      <button
        type="button"
        aria-label="Stop recording"
        onClick={onStop}
        disabled={disconnected}
        className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-40"
      >
        <Square size={13} className="fill-red-500 text-red-500" /> Stop recording
      </button>
    );
  }

  // idle / completed / failed / cancelled → can start a (new) recording
  return (
    <button
      type="button"
      aria-label="Start recording"
      onClick={onStart}
      disabled={disconnected}
      className={cn(
        "flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-40"
      )}
    >
      <Circle size={13} className="fill-red-500 text-red-500" /> Record
    </button>
  );
}
