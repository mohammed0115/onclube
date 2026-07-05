// Whiteboard container — wires the useWhiteboard hook to the pure WhiteboardPanel.
// This is the only place the two meet; the panel stays presentation-only and the
// hook stays canvas/provider-agnostic.
import { useWhiteboard } from "@/hooks";
import { WhiteboardPanel } from "./WhiteboardPanel";

export function SessionWhiteboard({
  sessionId,
  authorId,
  onClose,
}: {
  sessionId: string;
  authorId: string;
  onClose: () => void;
}) {
  const board = useWhiteboard({ sessionId, authorId });
  return (
    <WhiteboardPanel
      connectionState={board.connectionState}
      tool={board.tool}
      color={board.color}
      strokeWidth={board.strokeWidth}
      syncing={board.syncing}
      error={board.error}
      onSetTool={board.setTool}
      onSetColor={board.setColor}
      onSetStrokeWidth={board.setStrokeWidth}
      onUndo={board.undo}
      onRedo={board.redo}
      onClear={board.clear}
      onClose={onClose}
      attachCanvas={board.attachCanvas}
    />
  );
}
