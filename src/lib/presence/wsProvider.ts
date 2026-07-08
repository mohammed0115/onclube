// Production presence provider — WebSocket-backed (Sprint 10).
// Implements the UNCHANGED PresenceProvider port over WsClient. Attendance is
// computed server-side (source of truth); this adapter only relays snapshots.
import { WsClient, type SocketFactory, type WsState } from "@/lib/net/wsClient";
import type {
  AttendanceRecord,
  PresenceConnectOptions,
  PresenceConnectionState,
  PresenceEvents,
  PresenceIdentity,
  PresenceProvider,
  SessionAttendance,
} from "./types";

function mapState(s: WsState): PresenceConnectionState {
  return s === "open" ? "connected" : s === "reconnecting" ? "reconnecting" : s === "connecting" ? "connecting" : "disconnected";
}

const EMPTY: SessionAttendance = { sessionId: "", participants: [], finalized: false };

export class WebSocketPresenceProvider implements PresenceProvider {
  private ws: WsClient | null = null;
  private events: PresenceEvents | null = null;
  private identity: PresenceIdentity = { participantId: "", participantName: "", role: "student" };
  private snapshot: SessionAttendance = EMPTY;
  private state: PresenceConnectionState = "idle";

  constructor(private baseUrl: string, private socketFactory?: SocketFactory) {}

  async connect(opts: PresenceConnectOptions): Promise<void> {
    this.events = opts.events;
    this.identity = opts.identity;
    this.snapshot = { sessionId: opts.sessionId, participants: [], finalized: false };
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
    const f = d as { type?: string; attendance?: SessionAttendance; participant?: AttendanceRecord; participantId?: string };
    if (f?.type === "presence" && f.attendance) {
      this.snapshot = f.attendance;
      this.events?.onPresenceUpdated(f.attendance);
    } else if (f?.type === "joined" && f.participant) this.events?.onParticipantJoined(f.participant);
    else if (f?.type === "left" && f.participantId) this.events?.onParticipantLeft({ participantId: f.participantId });
    else if (f?.type === "heartbeat" && f.participantId) this.events?.onHeartbeat({ participantId: f.participantId, at: new Date().toISOString() });
  }

  async disconnect(): Promise<void> {
    this.ws?.close();
    this.ws = null;
    this.events = null;
  }

  participantJoined(): void {
    this.ws?.sendJson({ type: "join", participantId: this.identity.participantId, participantName: this.identity.participantName, role: this.identity.role });
  }
  participantLeft(): void {
    this.ws?.sendJson({ type: "leave", participantId: this.identity.participantId });
  }
  heartbeat(): void {
    this.ws?.sendJson({ type: "heartbeat", participantId: this.identity.participantId });
  }
  getPresence(): SessionAttendance {
    return this.snapshot;
  }
  listParticipants(): AttendanceRecord[] {
    return this.snapshot.participants;
  }
  connectionState(): PresenceConnectionState {
    return this.state;
  }
}
