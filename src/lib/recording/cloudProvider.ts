// Production recording provider — cloud control endpoint (Sprint 10).
//
// Implements the UNCHANGED RecordingProvider port. It issues control commands
// (start/stop/cancel) to a configured cloud-recording endpoint (e.g. Agora Cloud
// Recording / LiveKit Egress) while the local engine tracks lifecycle state. A
// control-plane hiccup never crashes the session — commands are best-effort and
// the recording state machine still advances.
import { StubRecordingProvider } from "./stubProvider";
import type {
  Recording,
  RecordingConnectOptions,
  RecordingConnectionState,
  RecordingProvider,
} from "./types";

export class CloudRecordingProvider implements RecordingProvider {
  private impl = new StubRecordingProvider();

  constructor(private controlUrl: string) {}

  connect(opts: RecordingConnectOptions): Promise<void> {
    return this.impl.connect(opts);
  }
  disconnect(): Promise<void> {
    return this.impl.disconnect();
  }
  async startRecording(): Promise<Recording> {
    this.control("start");
    return this.impl.startRecording();
  }
  async stopRecording(): Promise<Recording> {
    this.control("stop");
    return this.impl.stopRecording();
  }
  async cancelRecording(): Promise<void> {
    this.control("cancel");
    return this.impl.cancelRecording();
  }
  getRecordingState(): Recording | null {
    return this.impl.getRecordingState();
  }
  listRecordings(): Recording[] {
    return this.impl.listRecordings();
  }
  connectionState(): RecordingConnectionState {
    return this.impl.connectionState();
  }

  private control(action: "start" | "stop" | "cancel"): void {
    try {
      void fetch(`${this.controlUrl}/${action}`, { method: "POST" }).catch(() => {});
    } catch {
      /* control plane best-effort — never throw into the session */
    }
  }
}
