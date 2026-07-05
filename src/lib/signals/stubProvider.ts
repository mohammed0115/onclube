// Stub participant-signal provider — SIMULATION ONLY.
//
// Default adapter for dev/preview. No WebSocket/SDK/network. It holds participant
// states in memory, echoes the local user's signals, and expires reactions after
// the TTL. A real adapter (Agora RTM / LiveKit Data / Daily / WebSocket) implements
// the same port and fans signals out to peers with zero UI changes.
import type {
  ParticipantSignalEvents,
  ParticipantSignalProvider,
  ParticipantState,
  Reaction,
  SignalConnectOptions,
  SignalConnectionState,
  SignalIdentity,
} from "./types";
import { REACTION_TTL_MS } from "./types";

export class StubParticipantSignalProvider implements ParticipantSignalProvider {
  private events: ParticipantSignalEvents | null = null;
  private identity: SignalIdentity = { participantId: "", participantName: "" };
  private state: SignalConnectionState = "idle";
  private states = new Map<string, ParticipantState>();
  private reactionTimer: ReturnType<typeof setTimeout> | null = null;

  async connect(opts: SignalConnectOptions): Promise<void> {
    this.events = opts.events;
    this.identity = opts.identity;
    this.states.set(this.identity.participantId, {
      participantId: this.identity.participantId,
      participantName: this.identity.participantName,
      handRaised: false,
      reaction: null,
      reactionTimestamp: null,
    });
    this.setState("connecting");
    this.setState("connected");
  }

  async disconnect(): Promise<void> {
    // Leaving clears this participant's hand + reaction.
    this.clearReactionTimer();
    this.states.delete(this.identity.participantId);
    this.setState("disconnected");
    this.events = null;
  }

  private self(): ParticipantState | undefined {
    return this.states.get(this.identity.participantId);
  }

  raiseHand(): void {
    const s = this.self();
    if (!s || s.handRaised) return; // idempotent
    s.handRaised = true;
    this.events?.onHandRaised({ participantId: s.participantId, participantName: s.participantName });
  }

  lowerHand(): void {
    const s = this.self();
    if (!s || !s.handRaised) return; // idempotent
    s.handRaised = false;
    this.events?.onHandLowered({ participantId: s.participantId });
  }

  sendReaction(reaction: Reaction): void {
    const s = this.self();
    if (!s) return;
    // Only one active reaction — a new one replaces the previous.
    this.clearReactionTimer();
    const timestamp = new Date().toISOString();
    s.reaction = reaction;
    s.reactionTimestamp = timestamp;
    this.events?.onReactionReceived({ participantId: s.participantId, participantName: s.participantName, reaction, timestamp });
    this.reactionTimer = setTimeout(() => this.clearReaction(), REACTION_TTL_MS);
  }

  clearReaction(): void {
    const s = this.self();
    this.clearReactionTimer();
    if (!s || s.reaction === null) return;
    s.reaction = null;
    s.reactionTimestamp = null;
    this.events?.onReactionExpired({ participantId: s.participantId });
  }

  listParticipantStates(): ParticipantState[] {
    return [...this.states.values()].map((s) => ({ ...s }));
  }

  connectionState(): SignalConnectionState {
    return this.state;
  }

  private clearReactionTimer(): void {
    if (this.reactionTimer) clearTimeout(this.reactionTimer);
    this.reactionTimer = null;
  }

  private setState(state: SignalConnectionState): void {
    this.state = state;
    this.events?.onConnectionState(state);
  }
}

export const createStubParticipantSignalProvider = (): ParticipantSignalProvider =>
  new StubParticipantSignalProvider();
