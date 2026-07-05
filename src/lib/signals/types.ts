// Provider-neutral participant-signaling contract (raise hand + reactions).
//
// This is the ONLY surface the UI/hooks talk to. No WebSocket / RTCDataChannel /
// Agora RTM / LiveKit Data / Daily Events type ever crosses this boundary —
// swapping transports means writing a new adapter that implements
// `ParticipantSignalProvider`, with zero changes to the hook, the UI, the domain,
// or the API. State is plain data; no SDK object appears here.

export type SignalConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";

/** The ONLY approved reactions. No custom emoji/GIF/stickers. */
export const REACTIONS = ["👍", "👏", "❤️", "❓", "⏳"] as const;
export type Reaction = (typeof REACTIONS)[number];

export function isReaction(value: string): value is Reaction {
  return (REACTIONS as readonly string[]).includes(value);
}

/** How long a reaction stays visible before it auto-expires. */
export const REACTION_TTL_MS = 4000;

/** Participant signal state — nothing about scores/attendance/permissions/AI. */
export interface ParticipantState {
  participantId: string;
  participantName: string;
  handRaised: boolean;
  reaction: Reaction | null;
  reactionTimestamp: string | null;
}

/** A transient reaction bubble shown briefly then faded (UI ephemeral). */
export interface FloatingReaction {
  key: string;
  participantName: string;
  reaction: Reaction;
}

export type SignalErrorCode =
  | "provider_unavailable"
  | "signal_failed"
  | "connection_lost"
  | "unknown";

export class SignalError extends Error {
  code: SignalErrorCode;
  constructor(code: SignalErrorCode, message?: string) {
    super(message ?? code);
    this.name = "SignalError";
    this.code = code;
  }
}

export interface SignalIdentity {
  participantId: string;
  participantName: string;
}

/** Provider → app event callbacks. The adapter pushes; it never pulls. */
export interface ParticipantSignalEvents {
  onConnectionState(state: SignalConnectionState): void;
  onHandRaised(p: { participantId: string; participantName: string }): void;
  onHandLowered(p: { participantId: string }): void;
  onReactionReceived(p: { participantId: string; participantName: string; reaction: Reaction; timestamp: string }): void;
  onReactionExpired(p: { participantId: string }): void;
  onParticipantStateUpdated(state: ParticipantState): void;
}

export interface SignalConnectOptions {
  sessionId: string;
  identity: SignalIdentity;
  events: ParticipantSignalEvents;
}

/**
 * The participant-signal port. A real adapter (Agora RTM / LiveKit Data / Daily
 * Events / WebSocket / RTCDataChannel) implements this and lives entirely in
 * infrastructure. All signaling mechanics happen inside the provider.
 */
export interface ParticipantSignalProvider {
  connect(opts: SignalConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  raiseHand(): void;
  lowerHand(): void;
  sendReaction(reaction: Reaction): void;
  clearReaction(): void;
  listParticipantStates(): ParticipantState[];
  connectionState(): SignalConnectionState;
}

export type ParticipantSignalProviderFactory = () => ParticipantSignalProvider;
