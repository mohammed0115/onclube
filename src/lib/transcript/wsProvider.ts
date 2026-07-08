// Production transcript provider — WebSocket-backed (Sprint 10).
// Implements the UNCHANGED TranscriptProvider port over WsClient. STT runs
// server-side; this adapter only receives partial/final segments — it never
// analyzes them.
import { WsClient, type SocketFactory, type WsState } from "@/lib/net/wsClient";
import type {
  TranscriptConnectOptions,
  TranscriptConnectionState,
  TranscriptEvents,
  TranscriptProvider,
  TranscriptSegment,
} from "./types";

function mapState(s: WsState): TranscriptConnectionState {
  return s === "open" ? "connected" : s === "reconnecting" ? "reconnecting" : s === "connecting" ? "connecting" : "disconnected";
}

export class WebSocketTranscriptProvider implements TranscriptProvider {
  private ws: WsClient | null = null;
  private events: TranscriptEvents | null = null;
  private finalized: TranscriptSegment[] = [];
  private state: TranscriptConnectionState = "idle";

  constructor(private baseUrl: string, private socketFactory?: SocketFactory) {}

  async connect(opts: TranscriptConnectOptions): Promise<void> {
    this.events = opts.events;
    this.ws = new WsClient({
      url: `${this.baseUrl}?session=${encodeURIComponent(opts.sessionId)}`,
      socketFactory: this.socketFactory,
      onState: (s) => {
        this.state = mapState(s);
        this.events?.onConnectionState(this.state);
      },
      onMessage: (d) => this.handle(d),
    });
    this.ws.connect();
  }

  private handle(d: unknown): void {
    const f = d as { type?: string; segment?: TranscriptSegment; segments?: TranscriptSegment[] };
    if (f?.type === "segment" && f.segment) {
      const seg = f.segment;
      if (seg.isFinal) {
        this.finalized = [...this.finalized.filter((s) => s.segmentId !== seg.segmentId), seg];
        this.events?.onFinalTranscript(seg);
      } else {
        this.events?.onPartialTranscript(seg);
      }
      this.events?.onSegmentReceived(seg);
    } else if (f?.type === "history" && Array.isArray(f.segments)) {
      this.finalized = f.segments.filter((s) => s.isFinal);
    }
  }

  async disconnect(): Promise<void> {
    this.ws?.close();
    this.ws = null;
    this.events = null;
  }

  start(): void {
    this.ws?.sendJson({ type: "start" });
  }
  stop(): void {
    this.ws?.sendJson({ type: "stop" });
  }
  receiveSegment(segment: TranscriptSegment): void {
    this.ws?.sendJson({ type: "segment", segment });
  }
  listSegments(): TranscriptSegment[] {
    return [...this.finalized];
  }
  connectionState(): TranscriptConnectionState {
    return this.state;
  }
}
