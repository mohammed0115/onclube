// Stub presence provider — SIMULATION ONLY.
//
// Default adapter for dev/preview. No SDK/network. It accumulates the local
// participant's presence duration across join/heartbeat/leave (one record per
// participantId — reconnects merge), with idempotent join/leave. A real adapter
// (Agora/Daily/Zoom Presence, LiveKit, WebSocket) implements the same port and
// fans presence out to peers with zero UI changes. Attendance STATUS beyond the
// simple present/left_early/completed is the domain's canonical job server-side.
import type {
  AttendanceRecord,
  PresenceConnectOptions,
  PresenceConnectionState,
  PresenceEvents,
  PresenceProvider,
  SessionAttendance,
} from "./types";

interface Internal extends AttendanceRecord {
  _segmentStart: number | null; // ms epoch of the current present segment
}

function now(): number {
  return Date.now();
}

export class StubPresenceProvider implements PresenceProvider {
  private events: PresenceEvents | null = null;
  private sessionId = "";
  private state: PresenceConnectionState = "idle";
  private records = new Map<string, Internal>();
  private selfId = "";
  private finalized = false;

  async connect(opts: PresenceConnectOptions): Promise<void> {
    this.events = opts.events;
    this.sessionId = opts.sessionId;
    this.selfId = opts.identity.participantId;
    if (!this.records.has(this.selfId)) {
      this.records.set(this.selfId, {
        participantId: opts.identity.participantId,
        participantName: opts.identity.participantName,
        role: opts.identity.role,
        joinedAt: null,
        leftAt: null,
        totalPresenceDuration: 0,
        currentlyPresent: false,
        attendanceStatus: "absent",
        _segmentStart: null,
      });
    }
    this.setState("connecting");
    this.setState("connected");
  }

  async disconnect(): Promise<void> {
    this.setState("disconnected");
    this.events = null;
  }

  participantJoined(): void {
    if (this.finalized) return;
    const r = this.records.get(this.selfId);
    if (!r || r.currentlyPresent) return; // idempotent
    const t = now();
    if (r.joinedAt === null) r.joinedAt = new Date(t).toISOString();
    r.currentlyPresent = true;
    r._segmentStart = t;
    r.attendanceStatus = "present";
    this.emitJoined(r);
  }

  participantLeft(): void {
    if (this.finalized) return;
    const r = this.records.get(this.selfId);
    if (!r || !r.currentlyPresent) return; // idempotent
    this.accumulate(r);
    r.currentlyPresent = false;
    r.leftAt = new Date(now()).toISOString();
    r.attendanceStatus = "left_early"; // left while session ongoing
    this.events?.onParticipantLeft({ participantId: r.participantId });
    this.emitUpdated();
  }

  heartbeat(): void {
    if (this.finalized) return;
    const r = this.records.get(this.selfId);
    if (!r || !r.currentlyPresent) return;
    this.accumulate(r);
    this.events?.onHeartbeat({ participantId: r.participantId, at: new Date(now()).toISOString() });
    this.emitUpdated();
  }

  getPresence(): SessionAttendance {
    return this.snapshot();
  }

  listParticipants(): AttendanceRecord[] {
    return [...this.records.values()].map(this.publicRecord);
  }

  connectionState(): PresenceConnectionState {
    return this.state;
  }

  private accumulate(r: Internal): void {
    if (r._segmentStart !== null) {
      r.totalPresenceDuration += Math.max(0, Math.round((now() - r._segmentStart) / 1000));
      r._segmentStart = now();
    }
  }

  private snapshot(): SessionAttendance {
    return {
      sessionId: this.sessionId,
      participants: [...this.records.values()].map(this.publicRecord),
      finalized: this.finalized,
    };
  }

  private publicRecord = (r: Internal): AttendanceRecord => ({
    participantId: r.participantId,
    participantName: r.participantName,
    role: r.role,
    joinedAt: r.joinedAt,
    leftAt: r.leftAt,
    totalPresenceDuration: r.totalPresenceDuration,
    currentlyPresent: r.currentlyPresent,
    attendanceStatus: r.attendanceStatus,
  });

  private emitJoined(r: Internal): void {
    this.events?.onParticipantJoined(this.publicRecord(r));
    this.emitUpdated();
  }

  private emitUpdated(): void {
    this.events?.onPresenceUpdated(this.snapshot());
  }

  private setState(state: PresenceConnectionState): void {
    this.state = state;
    this.events?.onConnectionState(state);
  }
}

export const createStubPresenceProvider = (): PresenceProvider => new StubPresenceProvider();
