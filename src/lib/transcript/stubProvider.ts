// Stub transcript provider — SIMULATION ONLY.
//
// Default adapter for dev/preview. No STT SDK, no audio, no network. It holds the
// segment store, applies dedup + final-immutable, and emits partial/final events.
// A real adapter (Whisper Live / Azure / Google / Deepgram / AssemblyAI / AWS)
// implements the same port and feeds real STT segments with zero UI changes.
import type {
  TranscriptConnectOptions,
  TranscriptConnectionState,
  TranscriptEvents,
  TranscriptProvider,
  TranscriptSegment,
} from "./types";

export class StubTranscriptProvider implements TranscriptProvider {
  private events: TranscriptEvents | null = null;
  private state: TranscriptConnectionState = "idle";
  private store = new Map<string, TranscriptSegment>();
  private capturing = false;

  async connect(opts: TranscriptConnectOptions): Promise<void> {
    this.events = opts.events;
    this.setState("connecting");
    this.setState("connected");
  }

  async disconnect(): Promise<void> {
    this.capturing = false;
    this.setState("disconnected");
    this.events = null;
  }

  start(): void {
    this.capturing = true;
  }

  stop(): void {
    this.capturing = false;
  }

  receiveSegment(segment: TranscriptSegment): void {
    const existing = this.store.get(segment.segmentId);
    // Final transcript is immutable; duplicate/late updates are ignored.
    if (existing && existing.isFinal) return;
    this.store.set(segment.segmentId, segment);
    this.events?.onSegmentReceived({ ...segment });
    if (segment.isFinal) this.events?.onFinalTranscript({ ...segment });
    else this.events?.onPartialTranscript({ ...segment });
  }

  listSegments(): TranscriptSegment[] {
    // Finalized only, ordered by startedAt — this is what late joiners receive.
    return [...this.store.values()]
      .filter((s) => s.isFinal)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.segmentId.localeCompare(b.segmentId))
      .map((s) => ({ ...s }));
  }

  connectionState(): TranscriptConnectionState {
    return this.state;
  }

  private setState(state: TranscriptConnectionState): void {
    this.state = state;
    this.events?.onConnectionState(state);
  }
}

export const createStubTranscriptProvider = (): TranscriptProvider => new StubTranscriptProvider();
