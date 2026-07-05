// Provider-neutral attendance & presence contract.
//
// This is the ONLY surface the UI/hooks talk to. No Agora/Daily/Zoom/LiveKit
// presence type ever crosses this boundary — swapping presence sources means
// writing a new adapter that implements `PresenceProvider`, with zero changes to
// the hook, the UI, the domain, or the API. Attendance is computed by the
// provider (source of truth); React never calculates it. DTOs are metadata only.

export type PresenceConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";

export type AttendanceStatus = "present" | "absent" | "late" | "left_early" | "completed";
export type ParticipantRole = "student" | "instructor";

/** One participant's attendance record — nothing about scores/CEFR/AI/analytics. */
export interface AttendanceRecord {
  participantId: string;
  participantName: string;
  role: ParticipantRole;
  joinedAt: string | null;
  leftAt: string | null;
  totalPresenceDuration: number; // accumulated seconds across reconnects
  currentlyPresent: boolean;
  attendanceStatus: AttendanceStatus;
}

/** The full attendance snapshot for a session. */
export interface SessionAttendance {
  sessionId: string;
  participants: AttendanceRecord[];
  finalized: boolean;
}

export type PresenceErrorCode = "provider_unavailable" | "heartbeat_timeout" | "connection_lost" | "unknown";

export class PresenceError extends Error {
  code: PresenceErrorCode;
  constructor(code: PresenceErrorCode, message?: string) {
    super(message ?? code);
    this.name = "PresenceError";
    this.code = code;
  }
}

export interface PresenceIdentity {
  participantId: string;
  participantName: string;
  role: ParticipantRole;
}

/** Provider → app event callbacks. The adapter pushes; it never pulls. */
export interface PresenceEvents {
  onConnectionState(state: PresenceConnectionState): void;
  onParticipantJoined(record: AttendanceRecord): void;
  onParticipantLeft(update: { participantId: string }): void;
  onHeartbeat(update: { participantId: string; at: string }): void;
  onPresenceUpdated(attendance: SessionAttendance): void;
}

export interface PresenceConnectOptions {
  sessionId: string;
  identity: PresenceIdentity;
  events: PresenceEvents;
}

/**
 * The presence port. A real adapter (Agora/Daily/Zoom Presence, LiveKit,
 * WebSocket, RTCDataChannel) implements this and lives entirely in
 * infrastructure. All presence accounting happens inside the provider.
 */
export interface PresenceProvider {
  connect(opts: PresenceConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  participantJoined(): void;
  participantLeft(): void;
  heartbeat(): void;
  getPresence(): SessionAttendance;
  listParticipants(): AttendanceRecord[];
  connectionState(): PresenceConnectionState;
}

export type PresenceProviderFactory = () => PresenceProvider;
