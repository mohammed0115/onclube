// Provider-neutral session-recording contract.
//
// This is the ONLY surface the UI/hooks talk to. No Agora Cloud Recording /
// Daily / Zoom / LiveKit Egress / FFmpeg type ever crosses this boundary —
// swapping recorders means writing a new adapter that implements
// `RecordingProvider`, with zero changes to the hook, the UI, the domain, or the
// API. The DTO is metadata only; no media bytes or SDK object appears here.

export type RecordingConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";

export type RecordingStatus =
  | "idle"
  | "recording"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

/** Recording metadata — nothing about AI/transcript/analytics/attendance/scores. */
export interface Recording {
  recordingId: string;
  sessionId: string;
  status: RecordingStatus;
  startedAt: string | null;
  finishedAt: string | null;
  duration: number; // seconds
  storageKey: string | null;
  downloadAvailable: boolean;
}

export type RecordingErrorCode =
  | "provider_unavailable"
  | "start_failed"
  | "stop_failed"
  | "processing_failed"
  | "upload_failed"
  | "connection_lost"
  | "unknown";

export class RecordingError extends Error {
  code: RecordingErrorCode;
  constructor(code: RecordingErrorCode, message?: string) {
    super(message ?? code);
    this.name = "RecordingError";
    this.code = code;
  }
}

export interface RecordingIdentity {
  participantId: string;
}

/** Provider → app event callbacks. The adapter pushes; it never pulls. */
export interface RecordingEvents {
  onConnectionState(state: RecordingConnectionState): void;
  onRecordingStarted(recording: Recording): void;
  onRecordingStopped(recording: Recording): void; // → processing
  onRecordingFailed(update: { recordingId: string; code: RecordingErrorCode }): void;
  onRecordingUploaded(recording: Recording): void; // → completed, downloadAvailable
  onRecordingCancelled(update: { recordingId: string }): void;
}

export interface RecordingConnectOptions {
  sessionId: string;
  identity: RecordingIdentity;
  events: RecordingEvents;
}

/**
 * The recording port. A real adapter (Agora Cloud Recording / Daily / Zoom /
 * LiveKit Egress / FFmpeg) implements this and lives entirely in infrastructure.
 * All recording mechanics happen inside the provider; the caller only orchestrates.
 */
export interface RecordingProvider {
  connect(opts: RecordingConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  startRecording(): Promise<Recording>;
  stopRecording(): Promise<Recording>;
  cancelRecording(): Promise<void>;
  getRecordingState(): Recording | null;
  listRecordings(): Recording[];
  connectionState(): RecordingConnectionState;
}

export type RecordingProviderFactory = () => RecordingProvider;
