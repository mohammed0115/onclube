// Transcript container — wires the useSessionTranscript hook to the pure
// TranscriptPanel. The hook captures continuously while mounted; the panel opens
// on demand. This is the only place the hook meets the UI.
import { useState } from "react";
import { Captions } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SpeakerRole } from "@/lib/transcript";
import { useSessionTranscript } from "@/hooks";
import { TranscriptPanel } from "./TranscriptPanel";

export function SessionTranscript({
  sessionId,
  participantId,
  speakerName,
  role,
}: {
  sessionId: string;
  participantId: string;
  speakerName: string;
  role: SpeakerRole;
}) {
  const transcript = useSessionTranscript({ sessionId, participantId, speakerName, role });
  const [open, setOpen] = useState(false);
  const reconnecting = transcript.connectionState === "reconnecting";

  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        aria-label={open ? "Close transcript" : "Open transcript"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-black/70",
          reconnecting && "ring-1 ring-amber-400"
        )}
      >
        <Captions size={14} /> CC
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-30 h-[46vh] w-80 overflow-hidden rounded-2xl bg-white shadow-xl">
          <TranscriptPanel
            segments={transcript.segments}
            connectionState={transcript.connectionState}
            error={transcript.error}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
