import { useRef } from "react";
import { Download, FileText, Trash2, Upload, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { DropzoneProps, FileConnectionState, FileShareError, SharedFile } from "@/lib/files";
import { ALLOWED_EXTENSIONS } from "@/lib/files";

const CONNECTION_COPY: Record<string, { label: string; tone: string; pulse?: boolean }> = {
  idle: { label: "Preparing…", tone: "text-slate-400" },
  connecting: { label: "Connecting…", tone: "text-amber-500", pulse: true },
  connected: { label: "Connected", tone: "text-emerald-500" },
  reconnecting: { label: "Reconnecting…", tone: "text-amber-500", pulse: true },
  disconnected: { label: "Disconnected", tone: "text-red-500" },
  failed: { label: "Unavailable", tone: "text-red-500" },
};

const ERROR_COPY: Record<string, string> = {
  upload_failed: "Upload failed. Please try again.",
  download_failed: "Download failed. Please try again.",
  unsupported_type: "That file type isn’t allowed.",
  oversized_file: "That file is too large.",
  upload_cancelled: "Upload cancelled.",
  connection_lost: "Connection lost. Reconnecting…",
  provider_unavailable: "File sharing is temporarily unavailable.",
  unknown: "Something went wrong.",
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const ACCEPT = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

function FileRow({
  file,
  onDownload,
  onCancel,
  onRemove,
  canManage,
}: {
  file: SharedFile;
  onDownload: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  canManage: boolean;
}) {
  const { tx } = useI18n();
  return (
    <li className="flex items-center gap-3 rounded-xl border border-slate-200 p-2.5">
      <FileText size={20} className="flex-shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-900">{file.name}</div>
        <div className="text-[11px] text-slate-500">
          {file.uploaderName} · {humanSize(file.size)} · {timeOf(file.uploadedAt)}
        </div>
        {file.status === "uploading" && (
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${file.progress}%` }} aria-label={`${file.progress}%`} />
          </div>
        )}
        {file.status === "failed" && <div className="mt-0.5 text-[11px] text-red-500">{tx("Failed")}</div>}
      </div>
      {file.status === "uploading" ? (
        <button type="button" aria-label={`Cancel upload ${file.name}`} onClick={() => onCancel(file.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
          <X size={16} />
        </button>
      ) : (
        <>
          <button type="button" aria-label={`Download ${file.name}`} onClick={() => onDownload(file.id)} className="rounded-md p-1.5 text-primary hover:bg-slate-100">
            <Download size={16} />
          </button>
          {canManage && (
            <button type="button" aria-label={`Remove ${file.name}`} onClick={() => onRemove(file.id)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100">
              <Trash2 size={15} />
            </button>
          )}
        </>
      )}
    </li>
  );
}

export interface FilePanelProps {
  files: SharedFile[];
  connectionState: FileConnectionState;
  syncing: boolean;
  dragging: boolean;
  error: FileShareError | null;
  myId: string;
  dropzoneProps: DropzoneProps;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownload: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export function FilePanel({
  files,
  connectionState,
  syncing,
  dragging,
  error,
  myId,
  dropzoneProps,
  onInputChange,
  onDownload,
  onCancel,
  onRemove,
  onClose,
}: FilePanelProps) {
  const { tx } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const conn = CONNECTION_COPY[connectionState] ?? CONNECTION_COPY.idle;

  return (
    <section className="flex h-full w-full flex-col bg-white text-slate-900" aria-label={tx("Shared files")}>
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{tx("Files")}</span>
          <span className={cn("text-[11px] font-medium", conn.tone, conn.pulse && "animate-pulse")} role="status" aria-live="polite">
            {tx(conn.label)}
          </span>
        </div>
        <button type="button" aria-label={tx("Close files")} onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
          <X size={16} />
        </button>
      </header>

      {/* Upload / drop zone */}
      <div className="p-3">
        <div
          {...dropzoneProps}
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-slate-200"
          )}
          data-testid="file-dropzone"
        >
          <UploadCloud size={22} className="text-slate-400" />
          <p className="text-xs text-slate-500">{tx("Drag & drop a file here, or")}</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90"
          >
            <Upload size={14} /> {tx("Upload file")}
          </button>
          <p className="text-[10px] text-slate-400">{tx("PDF, DOCX, PPTX, TXT, PNG, JPG · max 25 MB")}</p>
          <input ref={inputRef} type="file" accept={ACCEPT} onChange={onInputChange} data-testid="file-input" className="hidden" />
        </div>
      </div>

      {error && (
        <div className="mx-3 mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">
          {tx(ERROR_COPY[error.code] ?? ERROR_COPY.unknown)}
          {error.fileName ? ` (${error.fileName})` : ""}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {syncing ? (
          <div className="flex h-full items-center justify-center" role="status" aria-live="polite">
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
              <span className="text-xs">{tx("Loading files…")}</span>
            </div>
          </div>
        ) : files.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">{tx("No files shared yet.")}</p>
        ) : (
          <ul className="space-y-2">
            {files.map((f) => (
              <FileRow
                key={f.id}
                file={f}
                onDownload={onDownload}
                onCancel={onCancel}
                onRemove={onRemove}
                canManage={f.uploaderId === myId}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
