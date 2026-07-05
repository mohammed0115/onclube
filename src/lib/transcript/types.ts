// Provider-neutral live-transcript contract.
//
// This is the ONLY surface the UI/hooks talk to. No Whisper / Azure Speech /
// Google Speech / Deepgram / AssemblyAI / AWS Transcribe type ever crosses this
// boundary — swapping STT engines means writing a new adapter that implements
// `TranscriptProvider`, with zero changes to the hook, the UI, the domain, or the
// API. This pipeline ONLY captures/transports/validates/presents segments — it
// never analyzes them. Segments are plain metadata; no SDK object appears here.

export type TranscriptConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";

export type SpeakerRole = "student" | "instructor";

/** One transcript segment — nothing about AI/grammar/CEFR/translation/summary. */
export interface TranscriptSegment {
  segmentId: string;
  sessionId: string;
  speakerRole: SpeakerRole;
  speakerName: string;
  text: string;
  isFinal: boolean;
  startedAt: string; // ISO 8601 (ordering key)
  endedAt: string | null;
  language: string;
  confidence: number;
}

export type TranscriptErrorCode =
  | "provider_unavailable"
  | "partial_timeout"
  | "segment_failed"
  | "connection_lost"
  | "unknown";

export class TranscriptError extends Error {
  code: TranscriptErrorCode;
  constructor(code: TranscriptErrorCode, message?: string) {
    super(message ?? code);
    this.name = "TranscriptError";
    this.code = code;
  }
}

export interface TranscriptIdentity {
  participantId: string;
  speakerName: string;
  role: SpeakerRole;
}

/** Provider → app event callbacks. The adapter pushes; it never pulls. */
export interface TranscriptEvents {
  onConnectionState(state: TranscriptConnectionState): void;
  onSegmentReceived(segment: TranscriptSegment): void;
  onPartialTranscript(segment: TranscriptSegment): void;
  onFinalTranscript(segment: TranscriptSegment): void;
  onError(error: TranscriptError): void;
}

export interface TranscriptConnectOptions {
  sessionId: string;
  identity: TranscriptIdentity;
  events: TranscriptEvents;
}

/**
 * The transcript port. A real adapter (Whisper Live / Azure / Google / Deepgram
 * / AssemblyAI / AWS Transcribe) implements this and lives entirely in
 * infrastructure. All STT mechanics happen inside the provider.
 */
export interface TranscriptProvider {
  connect(opts: TranscriptConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  start(): void;
  stop(): void;
  /** Ingest a segment from the STT engine (dedup + partial/final handled inside). */
  receiveSegment(segment: TranscriptSegment): void;
  /** Finalized segments only — for late joiners. */
  listSegments(): TranscriptSegment[];
  connectionState(): TranscriptConnectionState;
}

export type TranscriptProviderFactory = () => TranscriptProvider;
