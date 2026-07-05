// Recording container — wires the useSessionRecording hook to the pure indicator
// + controls. This is the only place the hook meets the UI. The indicator is
// visible to everyone; the controls render ONLY for the assigned instructor.
import { useSessionRecording } from "@/hooks";
import { RecordingControls } from "./RecordingControls";
import { RecordingIndicator } from "./RecordingIndicator";

export function SessionRecording({
  sessionId,
  participantId,
  canControl,
}: {
  sessionId: string;
  participantId: string;
  canControl: boolean;
}) {
  const rec = useSessionRecording({ sessionId, participantId, canControl });

  return (
    <div className="pointer-events-auto flex items-center gap-2">
      <RecordingIndicator status={rec.status} elapsedSeconds={rec.elapsedSeconds} connectionState={rec.connectionState} />
      {canControl && (
        <RecordingControls status={rec.status} connectionState={rec.connectionState} onStart={rec.start} onStop={rec.stop} />
      )}
    </div>
  );
}
