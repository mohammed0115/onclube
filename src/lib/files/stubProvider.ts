// Stub file-sharing provider — an in-memory (local) adapter, the default engine.
//
// It owns ALL File/Blob mechanics: it keeps the bytes in memory, simulates a
// progressive upload, and performs the browser download itself (object URL +
// anchor). No File/Blob ever leaves this class — callers get metadata only. A
// real adapter (S3/Azure/GCS/MinIO) implements the same port with zero UI change.
import type {
  FileConnectOptions,
  FileConnectionState,
  FileSharingEvents,
  FileSharingProvider,
  SharedFile,
} from "./types";
import { extensionOf } from "./validation";

function newId(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `f-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

interface Entry {
  meta: SharedFile;
  blob: Blob;
}

export class StubFileSharingProvider implements FileSharingProvider {
  private events: FileSharingEvents | null = null;
  private identity = { uploaderId: "", uploaderName: "" };
  private state: FileConnectionState = "idle";
  private entries = new Map<string, Entry>();
  private timers = new Map<string, ReturnType<typeof setTimeout>[]>();

  async connect(opts: FileConnectOptions): Promise<void> {
    this.events = opts.events;
    this.identity = opts.identity;
    this.setState("connecting");
    this.setState("connected");
  }

  async disconnect(): Promise<void> {
    this.timers.forEach((ts) => ts.forEach(clearTimeout));
    this.timers.clear();
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
    this.entries.set(id, { meta, blob: file });
    this.events?.onUploadStarted({ ...meta });

    // Simulate progressive upload.
    const ticks = [40, 80];
    const timers: ReturnType<typeof setTimeout>[] = [];
    ticks.forEach((p, i) => {
      timers.push(
        setTimeout(() => {
          const e = this.entries.get(id);
          if (!e) return;
          e.meta.progress = p;
          this.events?.onUploadProgress({ id, progress: p });
        }, (i + 1) * 120)
      );
    });
    timers.push(
      setTimeout(() => {
        const e = this.entries.get(id);
        if (!e) return;
        e.meta.progress = 100;
        e.meta.status = "available";
        this.events?.onUploadCompleted({ ...e.meta });
      }, (ticks.length + 1) * 120)
    );
    this.timers.set(id, timers);
    return { ...meta };
  }

  cancelUpload(fileId: string): void {
    this.timers.get(fileId)?.forEach(clearTimeout);
    this.timers.delete(fileId);
    this.entries.delete(fileId);
    this.events?.onFileRemoved(fileId);
  }

  async download(fileId: string): Promise<void> {
    const entry = this.entries.get(fileId);
    if (!entry) return;
    // Browser download stays INSIDE the provider — never exposed to callers.
    if (typeof URL?.createObjectURL !== "function" || typeof document === "undefined") return;
    const url = URL.createObjectURL(entry.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = entry.meta.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async remove(fileId: string): Promise<void> {
    this.timers.get(fileId)?.forEach(clearTimeout);
    this.timers.delete(fileId);
    this.entries.delete(fileId);
    this.events?.onFileRemoved(fileId);
  }

  listFiles(): SharedFile[] {
    return [...this.entries.values()].map((e) => ({ ...e.meta }));
  }

  connectionState(): FileConnectionState {
    return this.state;
  }

  private setState(state: FileConnectionState): void {
    this.state = state;
    this.events?.onConnectionState(state);
  }
}

export const createStubFileSharingProvider = (): FileSharingProvider => new StubFileSharingProvider();
