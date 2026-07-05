// In-session file-sharing lifecycle hook — the single home for file business
// logic AND the only place (besides the provider) that touches browser File
// objects. Drag & drop extraction, validation, upload/cancel/download/remove,
// progress tracking, the shared list, late-join restore + leave-preserve, and
// reconnect all live here. The panel is pure presentation.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  loadSharedFiles,
  saveSharedFiles,
  useFileSharingProviderFactory,
  validateUpload,
} from "@/lib/files";
import type {
  DropzoneProps,
  FileConnectionState,
  FileSharingEvents,
  FileSharingProvider,
  FileShareError as FileShareErrorType,
  SharedFile,
} from "@/lib/files";
import { FileShareError } from "@/lib/files";

export interface UseSessionFilesArgs {
  sessionId: string;
  uploaderId: string;
  uploaderName: string;
}

export interface SessionFilesController {
  files: SharedFile[];
  connectionState: FileConnectionState;
  syncing: boolean;
  dragging: boolean;
  error: FileShareErrorType | null;
  myId: string;
  upload: (files: FileList | File[]) => void;
  cancelUpload: (id: string) => void;
  download: (id: string) => void;
  remove: (id: string) => void;
  retry: () => void;
  onInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  dropzoneProps: DropzoneProps;
}

export function useSessionFiles({ sessionId, uploaderId, uploaderName }: UseSessionFilesArgs): SessionFilesController {
  const factory = useFileSharingProviderFactory();
  const providerRef = useRef<FileSharingProvider | null>(null);

  const [files, setFiles] = useState<SharedFile[]>([]);
  const [connectionState, setConnectionState] = useState<FileConnectionState>("connecting");
  const [syncing, setSyncing] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<FileShareErrorType | null>(null);
  const [attempt, setAttempt] = useState(0);

  const identity = useRef({ uploaderId, uploaderName });
  identity.current = { uploaderId, uploaderName };

  // Latest files, so the effect cleanup can snapshot without re-subscribing.
  const filesRef = useRef<SharedFile[]>(files);
  filesRef.current = files;

  const upsert = useCallback((file: SharedFile) => {
    setFiles((prev) => {
      const rest = prev.filter((f) => f.id !== file.id);
      return [...rest, file].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const provider = factory();
    providerRef.current = provider;
    setError(null);
    setSyncing(true);
    setConnectionState("connecting");

    const events: FileSharingEvents = {
      onConnectionState: (s) => {
        if (cancelled) return;
        setConnectionState(s);
        if (s === "connected") setSyncing(false);
      },
      onUploadStarted: (f) => !cancelled && upsert(f),
      onUploadProgress: ({ id, progress }) =>
        !cancelled && setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, progress, status: "uploading" } : f))),
      onUploadCompleted: (f) => !cancelled && upsert(f),
      onUploadFailed: ({ id, code }) => {
        if (cancelled) return;
        setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, status: "failed" } : f)));
        setError(new FileShareError(code));
      },
      onFileRemoved: (id) => !cancelled && setFiles((prev) => prev.filter((f) => f.id !== id)),
      onRemoteFileReceived: (f) => !cancelled && upsert(f),
    };

    provider
      .connect({ sessionId, identity: identity.current, events })
      .then(() => {
        if (cancelled) return;
        // Late join / rejoin: restore the preserved list, merged with the provider's.
        const preserved = loadSharedFiles(sessionId);
        const live = provider.listFiles();
        const merged = new Map<string, SharedFile>();
        [...preserved, ...live].forEach((f) => merged.set(f.id, f));
        setFiles([...merged.values()].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt)));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof FileShareError ? e : new FileShareError("provider_unavailable"));
        setConnectionState("failed");
        setSyncing(false);
      });

    return () => {
      cancelled = true;
      // Leaving KEEPS shared files available in memory (ending clears separately).
      saveSharedFiles(sessionId, filesRef.current);
      void provider.disconnect();
      providerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factory, sessionId, uploaderId, attempt]);

  const upload = useCallback((incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    for (const file of list) {
      const result = validateUpload({ name: file.name, size: file.size, type: file.type });
      if (!result.ok) {
        setError(new FileShareError(result.code, file.name));
        continue;
      }
      setError(null);
      void providerRef.current?.upload(file).catch(() => setError(new FileShareError("upload_failed", file.name)));
    }
  }, []);

  const cancelUpload = useCallback((id: string) => providerRef.current?.cancelUpload(id), []);
  const remove = useCallback((id: string) => void providerRef.current?.remove(id), []);
  const download = useCallback(
    (id: string) => void providerRef.current?.download(id).catch(() => setError(new FileShareError("download_failed"))),
    []
  );
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) upload(e.target.files);
      e.target.value = ""; // allow re-selecting the same file (duplicates allowed)
    },
    [upload]
  );

  const dropzoneProps = useMemo<DropzoneProps>(
    () => ({
      onDragOver: (e) => {
        e.preventDefault();
        setDragging(true);
      },
      onDragLeave: (e) => {
        e.preventDefault();
        setDragging(false);
      },
      onDrop: (e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer?.files?.length) upload(e.dataTransfer.files);
      },
    }),
    [upload]
  );

  return useMemo(
    () => ({
      files,
      connectionState,
      syncing,
      dragging,
      error,
      myId: uploaderId,
      upload,
      cancelUpload,
      download,
      remove,
      retry,
      onInputChange,
      dropzoneProps,
    }),
    [files, connectionState, syncing, dragging, error, uploaderId, upload, cancelUpload, download, remove, retry, onInputChange, dropzoneProps]
  );
}
