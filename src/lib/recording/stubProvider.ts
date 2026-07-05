// Stub recording provider — SIMULATION ONLY.
//
// Default adapter for dev/preview. No SDK, no media, no network. It models the
// recording lifecycle (recording → processing → completed) and enforces one
// active recording per session with idempotent start/stop. A real adapter (Agora
// Cloud Recording / Daily / Zoom / LiveKit Egress / FFmpeg) implements the same
// port and drives real capture with zero UI changes.
import type {
  Recording,
  RecordingConnectOptions,
  RecordingConnectionState,
  RecordingEvents,
  RecordingProvider,
} from "./types";

const PROCESS_DELAY_MS = 400;

function newId(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `rec-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

export class StubRecordingProvider implements RecordingProvider {
  private events: RecordingEvents | null = null;
  private sessionId = "";
  private state: RecordingConnectionState = "idle";
  private current: Recording | null = null;
  private history: Recording[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  async connect(opts: RecordingConnectOptions): Promise<void> {
    this.events = opts.events;
    this.sessionId = opts.sessionId;
    this.setState("connecting");
    this.setState("connected");
  }

  async disconnect(): Promise<void> {
    // Disconnecting the CONTROLLER does NOT stop an in-progress recording — the
    // recorder keeps running server-side. Only listening stops here.
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.setState("disconnected");
    this.events = null;
  }

  async startRecording(): Promise<Recording> {
    if (this.current && this.current.status === "recording") return { ...this.current }; // idempotent, single active
    const rec: Recording = {
      recordingId: newId(),
      sessionId: this.sessionId,
      status: "recording",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      duration: 0,
      storageKey: null,
      downloadAvailable: false,
    };
    this.current = rec;
    this.events?.onRecordingStarted({ ...rec });
    return { ...rec };
  }

  async stopRecording(): Promise<Recording> {
    if (!this.current) throw new Error("no recording");
    if (this.current.status !== "recording") return { ...this.current }; // idempotent
    const started = this.current.startedAt ? Date.parse(this.current.startedAt) : Date.now();
    this.current = {
      ...this.current,
      status: "processing",
      finishedAt: new Date().toISOString(),
      duration: Math.max(0, Math.round((Date.now() - started) / 1000)),
    };
    this.events?.onRecordingStopped({ ...this.current });
    // Simulate upload/finalization.
    const rec = this.current;
    this.timer = setTimeout(() => {
      const done: Recording = { ...rec, status: "completed", storageKey: `s/${rec.recordingId}`, downloadAvailable: true };
      this.current = done;
      this.history = [...this.history, done];
      this.events?.onRecordingUploaded({ ...done });
    }, PROCESS_DELAY_MS);
    return { ...this.current };
  }

  async cancelRecording(): Promise<void> {
    if (!this.current || this.current.status !== "recording") return; // cancelled cannot resume; only active cancels
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const id = this.current.recordingId;
    this.current = { ...this.current, status: "cancelled", finishedAt: new Date().toISOString() };
    this.events?.onRecordingCancelled({ recordingId: id });
  }

  getRecordingState(): Recording | null {
    return this.current ? { ...this.current } : null;
  }

  listRecordings(): Recording[] {
    return this.history.map((r) => ({ ...r }));
  }

  connectionState(): RecordingConnectionState {
    return this.state;
  }

  private setState(state: RecordingConnectionState): void {
    this.state = state;
    this.events?.onConnectionState(state);
  }
}

export const createStubRecordingProvider = (): RecordingProvider => new StubRecordingProvider();
