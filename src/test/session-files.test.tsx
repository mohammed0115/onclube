import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionFiles } from "@/components/session/SessionFiles";
import {
  FileSharingProviderContext,
  FileShareError,
  MAX_FILE_SIZE_BYTES,
  validateUpload,
  _resetFileCache,
  saveSharedFiles,
  loadSharedFiles,
} from "@/lib/files";
import type {
  FileConnectOptions,
  FileErrorCode,
  FileSharingEvents,
  FileSharingProvider,
  SharedFile,
} from "@/lib/files";

function fileMeta(over: Partial<SharedFile> = {}): SharedFile {
  return {
    id: "seed-1", name: "seed.pdf", size: 2048, contentType: "application/pdf", extension: "pdf",
    uploaderId: "peer", uploaderName: "Sarah Mitchell", uploadedAt: "2026-07-05T10:00:00.000Z",
    status: "available", progress: 100, ...over,
  };
}

class FakeFileProvider implements FileSharingProvider {
  calls: string[] = [];
  autoConnect = true;
  failConnect: FileErrorCode | null = null;
  initial: SharedFile[] = [];
  lastId = "";
  private events: FileSharingEvents | null = null;
  private identity = { uploaderId: "me", uploaderName: "Me" };
  private seq = 0;
  private lastMeta: SharedFile | null = null;

  async connect(o: FileConnectOptions): Promise<void> {
    this.calls.push("connect");
    this.events = o.events;
    this.identity = o.identity;
    if (this.failConnect) throw new FileShareError(this.failConnect);
    o.events.onConnectionState("connecting");
    if (this.autoConnect) o.events.onConnectionState("connected");
  }
  async disconnect(): Promise<void> {
    this.calls.push("disconnect");
    this.events?.onConnectionState("disconnected");
  }
  async upload(file: File): Promise<SharedFile> {
    this.calls.push(`upload:${file.name}`);
    const id = `up-${++this.seq}`;
    this.lastId = id;
    const meta: SharedFile = {
      id, name: file.name, size: file.size, contentType: file.type || "application/octet-stream",
      extension: file.name.split(".").pop() ?? "", uploaderId: this.identity.uploaderId,
      uploaderName: this.identity.uploaderName, uploadedAt: new Date().toISOString(),
      status: "uploading", progress: 0,
    };
    this.lastMeta = meta;
    this.events?.onUploadStarted({ ...meta });
    return { ...meta };
  }
  cancelUpload(fileId: string): void {
    this.calls.push(`cancelUpload:${fileId}`);
    this.events?.onFileRemoved(fileId);
  }
  async download(fileId: string): Promise<void> {
    this.calls.push(`download:${fileId}`);
  }
  async remove(fileId: string): Promise<void> {
    this.calls.push(`remove:${fileId}`);
    this.events?.onFileRemoved(fileId);
  }
  listFiles(): SharedFile[] {
    return this.initial;
  }
  connectionState() {
    return "connected" as const;
  }
  // drivers
  emit(state: "reconnecting" | "connected" | "disconnected") {
    this.events?.onConnectionState(state);
  }
  progress(id: string, p: number) {
    this.events?.onUploadProgress({ id, progress: p });
  }
  complete(id: string) {
    if (this.lastMeta) this.events?.onUploadCompleted({ ...this.lastMeta, id, status: "available", progress: 100 });
  }
  fail(id: string, code: FileErrorCode) {
    this.events?.onUploadFailed({ id, code });
  }
  receiveRemote(file: SharedFile) {
    this.events?.onRemoteFileReceived(file);
  }
}

function renderFiles(fake: FakeFileProvider, sessionId = "s1", onClose = vi.fn()) {
  return render(
    <FileSharingProviderContext.Provider value={() => fake}>
      <SessionFiles sessionId={sessionId} uploaderId="me" uploaderName="Me" onClose={onClose} />
    </FileSharingProviderContext.Provider>
  );
}

async function connected(fake: FakeFileProvider, sessionId = "s1") {
  const r = renderFiles(fake, sessionId);
  await screen.findByText("Connected");
  return r;
}

const pdf = () => new File(["hello world"], "notes.pdf", { type: "application/pdf" });

describe("Session files — Journey 5 file sharing (Sprint 8.5)", () => {
  beforeEach(() => _resetFileCache());

  it("connects through the injected provider", async () => {
    const fake = new FakeFileProvider();
    await connected(fake);
    expect(fake.calls).toContain("connect");
  });

  it("uploads a file via the input and shows it, then completes", async () => {
    const fake = new FakeFileProvider();
    await connected(fake);
    await userEvent.upload(screen.getByTestId("file-input"), pdf());
    expect(fake.calls).toContain("upload:notes.pdf");
    expect(await screen.findByText("notes.pdf")).toBeInTheDocument();
    expect(screen.getByText(/Me ·/)).toBeInTheDocument(); // uploader name + size + time
    act(() => fake.complete(fake.lastId));
    expect(await screen.findByRole("button", { name: /Download notes.pdf/i })).toBeInTheDocument();
  });

  it("reports upload progress", async () => {
    const fake = new FakeFileProvider();
    await connected(fake);
    await userEvent.upload(screen.getByTestId("file-input"), pdf());
    act(() => fake.progress(fake.lastId, 50));
    expect(await screen.findByLabelText("50%")).toBeInTheDocument();
  });

  it("cancels an in-progress upload", async () => {
    const fake = new FakeFileProvider();
    await connected(fake);
    await userEvent.upload(screen.getByTestId("file-input"), pdf());
    const id = fake.lastId;
    await userEvent.click(await screen.findByRole("button", { name: /Cancel upload notes.pdf/i }));
    expect(fake.calls).toContain(`cancelUpload:${id}`);
    await waitFor(() => expect(screen.queryByText("notes.pdf")).not.toBeInTheDocument());
  });

  it("accepts a file dropped onto the drop zone", async () => {
    const fake = new FakeFileProvider();
    await connected(fake);
    fireEvent.drop(screen.getByTestId("file-dropzone"), { dataTransfer: { files: [pdf()], types: ["Files"] } });
    await waitFor(() => expect(fake.calls).toContain("upload:notes.pdf"));
    expect(await screen.findByText("notes.pdf")).toBeInTheDocument();
  });

  it("downloads an available file through the provider", async () => {
    const fake = new FakeFileProvider();
    await connected(fake);
    act(() => fake.receiveRemote(fileMeta({ id: "rf1", name: "shared.png", extension: "png" })));
    await userEvent.click(await screen.findByRole("button", { name: /Download shared.png/i }));
    expect(fake.calls).toContain("download:rf1");
  });

  it("shows the current shared list on late join", async () => {
    saveSharedFiles("late-session", [fileMeta({ id: "old-1", name: "earlier.pdf" })]);
    const fake = new FakeFileProvider();
    await connected(fake, "late-session");
    expect(await screen.findByText("earlier.pdf")).toBeInTheDocument();
  });

  it("keeps shared files available in memory after leaving (unmount)", async () => {
    const fake = new FakeFileProvider();
    const { unmount } = await connected(fake, "keep-session");
    act(() => fake.receiveRemote(fileMeta({ id: "k1", name: "keep.pdf" })));
    await screen.findByText("keep.pdf");
    unmount();
    expect(fake.calls).toContain("disconnect");
    expect(loadSharedFiles("keep-session").map((f) => f.name)).toContain("keep.pdf");
  });

  it("rejects an unsupported file type without calling the provider", async () => {
    const fake = new FakeFileProvider();
    await connected(fake);
    const exe = new File(["x"], "malware.exe", { type: "application/x-msdownload" });
    fireEvent.drop(screen.getByTestId("file-dropzone"), { dataTransfer: { files: [exe], types: ["Files"] } });
    expect(await screen.findByText(/isn’t allowed/i)).toBeInTheDocument();
    expect(fake.calls.some((c) => c.startsWith("upload:"))).toBe(false);
  });

  it("rejects an oversized file without calling the provider", async () => {
    const fake = new FakeFileProvider();
    await connected(fake);
    const big = new File(["x"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: MAX_FILE_SIZE_BYTES + 1 });
    fireEvent.drop(screen.getByTestId("file-dropzone"), { dataTransfer: { files: [big], types: ["Files"] } });
    expect(await screen.findByText(/too large/i)).toBeInTheDocument();
    expect(fake.calls.some((c) => c.startsWith("upload:"))).toBe(false);
  });

  it("shows a reconnecting indicator and recovers", async () => {
    const fake = new FakeFileProvider();
    await connected(fake);
    act(() => fake.emit("reconnecting"));
    expect(await screen.findByText("Reconnecting…")).toBeInTheDocument();
    act(() => fake.emit("connected"));
    await waitFor(() => expect(screen.queryByText("Reconnecting…")).not.toBeInTheDocument());
  });

  it("validateUpload enforces extensions and size", () => {
    expect(validateUpload({ name: "a.pdf", size: 10, type: "application/pdf" })).toEqual({ ok: true });
    expect(validateUpload({ name: "a.exe", size: 10, type: "" })).toEqual({ ok: false, code: "unsupported_type" });
    expect(validateUpload({ name: "a.pdf", size: MAX_FILE_SIZE_BYTES + 1, type: "application/pdf" })).toEqual({ ok: false, code: "oversized_file" });
  });

  it("drives file sharing exclusively through the injected provider (component stays pure)", async () => {
    const fake = new FakeFileProvider();
    await connected(fake);
    await userEvent.upload(screen.getByTestId("file-input"), pdf());
    const allowed = /^(connect|disconnect|upload:|download:|cancelUpload:|remove:)/;
    expect(fake.calls.every((c) => allowed.test(c))).toBe(true);
  });

  it("closes via the close button", async () => {
    const fake = new FakeFileProvider();
    const onClose = vi.fn();
    renderFiles(fake, "s1", onClose);
    await screen.findByText("Connected");
    await userEvent.click(screen.getByLabelText("Close files"));
    expect(onClose).toHaveBeenCalled();
  });
});
