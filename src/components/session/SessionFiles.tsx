// File-sharing container — wires the useSessionFiles hook to the pure FilePanel.
// This is the only place the two meet; the panel stays presentation-only and the
// hook (with the provider) is the only code that touches browser File objects.
import { useSessionFiles } from "@/hooks";
import { FilePanel } from "./FilePanel";

export function SessionFiles({
  sessionId,
  uploaderId,
  uploaderName,
  onClose,
}: {
  sessionId: string;
  uploaderId: string;
  uploaderName: string;
  onClose: () => void;
}) {
  const shared = useSessionFiles({ sessionId, uploaderId, uploaderName });
  return (
    <FilePanel
      files={shared.files}
      connectionState={shared.connectionState}
      syncing={shared.syncing}
      dragging={shared.dragging}
      error={shared.error}
      myId={shared.myId}
      dropzoneProps={shared.dropzoneProps}
      onInputChange={shared.onInputChange}
      onDownload={shared.download}
      onCancel={shared.cancelUpload}
      onRemove={shared.remove}
      onClose={onClose}
    />
  );
}
