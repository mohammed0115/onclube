// Production file-sharing provider — HTTP/XHR-backed (Sprint 10).
// Implements the UNCHANGED FileSharingProvider port using native XMLHttpRequest
// (for upload progress) + fetch. No SDK. Uploads go to a configured endpoint that
// returns SharedFile metadata; bytes never leak into DTOs.
import { extensionOf } from "./validation";
import type {
  FileConnectOptions,
  FileConnectionState,
  FileSharingEvents,
  FileSharingProvider,
  SharedFile,
} from "./types";

function newId(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  return c?.randomUUID ? c.randomUUID() : `f-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

export class HttpFileSharingProvider implements FileSharingProvider {
  private events: FileSharingEvents | null = null;
  private identity = { uploaderId: "", uploaderName: "" };
  private sessionId = "";
  private files = new Map<string, SharedFile>();
  private xhrs = new Map<string, XMLHttpRequest>();
  private state: FileConnectionState = "idle";

  constructor(private baseUrl: string) {}

  async connect(opts: FileConnectOptions): Promise<void> {
    this.events = opts.events;
    this.identity = opts.identity;
    this.sessionId = opts.sessionId;
    this.setState("connecting");
    this.setState("connected");
  }

  async disconnect(): Promise<void> {
    this.xhrs.forEach((x) => x.abort());
    this.xhrs.clear();
    this.setState("disconnected");
    this.events = null;
  }

  async upload(file: File): Promise<SharedFile> {
    const id = newId();
    const meta: SharedFile = {
      id,
      name: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
      extension: extensionOf(file.name),
      uploaderId: this.identity.uploaderId,
      uploaderName: this.identity.uploaderName,
      uploadedAt: new Date().toISOString(),
      status: "uploading",
      progress: 0,
    };
    this.files.set(id, meta);
    this.events?.onUploadStarted({ ...meta });

    const xhr = new XMLHttpRequest();
    this.xhrs.set(id, xhr);
    const form = new FormData();
    form.append("file", file);
    form.append("sessionId", this.sessionId);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const progress = Math.round((e.loaded / e.total) * 100);
        this.events?.onUploadProgress({ id, progress });
      }
    };
    xhr.onload = () => {
      this.xhrs.delete(id);
      if (xhr.status >= 200 && xhr.status < 300) {
        const done: SharedFile = { ...meta, status: "available", progress: 100 };
        this.files.set(id, done);
        this.events?.onUploadCompleted({ ...done });
      } else {
        this.events?.onUploadFailed({ id, code: "upload_failed" });
      }
    };
    xhr.onerror = () => {
      this.xhrs.delete(id);
      this.events?.onUploadFailed({ id, code: "upload_failed" });
    };
    xhr.open("POST", this.baseUrl);
    xhr.send(form);
    return { ...meta };
  }

  cancelUpload(fileId: string): void {
    this.xhrs.get(fileId)?.abort();
    this.xhrs.delete(fileId);
    this.files.delete(fileId);
    this.events?.onFileRemoved(fileId);
  }

  async download(fileId: string): Promise<void> {
    if (typeof document === "undefined") return;
    const a = document.createElement("a");
    a.href = `${this.baseUrl}/${encodeURIComponent(fileId)}`;
    a.download = this.files.get(fileId)?.name ?? "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async remove(fileId: string): Promise<void> {
    this.files.delete(fileId);
    this.events?.onFileRemoved(fileId);
    try {
      await fetch(`${this.baseUrl}/${encodeURIComponent(fileId)}`, { method: "DELETE" });
    } catch {
      /* best-effort; the file is already removed locally */
    }
  }

  listFiles(): SharedFile[] {
    return [...this.files.values()];
  }

  connectionState(): FileConnectionState {
    return this.state;
  }

  private setState(state: FileConnectionState): void {
    this.state = state;
    this.events?.onConnectionState(state);
  }
}
