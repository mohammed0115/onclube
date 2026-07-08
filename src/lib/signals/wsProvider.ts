// Production participant-signal provider — WebSocket-backed (Sprint 10).
// Implements the UNCHANGED ParticipantSignalProvider port over WsClient.
import { WsClient, type SocketFactory, type WsState } from "@/lib/net/wsClient";
import type {
  ParticipantSignalEvents,
  ParticipantSignalProvider,
  ParticipantState,
  Reaction,
  SignalConnectOptions,
  SignalConnectionState,
} from "./types";

function mapState(s: WsState): SignalConnectionState {
  return s === "open" ? "connected" : s === "reconnecting" ? "reconnecting" : s === "connecting" ? "connecting" : "disconnected";
}

export class WebSocketParticipantSignalProvider implements ParticipantSignalProvider {
  private ws: WsClient | null = null;
  private events: ParticipantSignalEvents | null = null;
  private identity = { participantId: "", participantName: "" };
  private states = new Map<string, ParticipantState>();
  private state: SignalConnectionState = "idle";

  constructor(private baseUrl: string, private socketFactory?: SocketFactory) {}

  async connect(opts: SignalConnectOptions): Promise<void> {
    this.events = opts.events;
    this.identity = opts.identity;
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
    const f = d as { type?: string; participantId?: string; participantName?: string; reaction?: Reaction; state?: ParticipantState };
    if (f?.type === "hand_raised" && f.participantId) this.events?.onHandRaised({ participantId: f.participantId, participantName: f.participantName ?? "" });
    else if (f?.type === "hand_lowered" && f.participantId) this.events?.onHandLowered({ participantId: f.participantId });
    else if (f?.type === "reaction" && f.participantId && f.reaction)
      this.events?.onReactionReceived({ participantId: f.participantId, participantName: f.participantName ?? "", reaction: f.reaction, timestamp: new Date().toISOString() });
    else if (f?.type === "reaction_expired" && f.participantId) this.events?.onReactionExpired({ participantId: f.participantId });
    else if (f?.type === "state" && f.state) {
      this.states.set(f.state.participantId, f.state);
      this.events?.onParticipantStateUpdated(f.state);
    }
  }

  async disconnect(): Promise<void> {
    this.ws?.close();
    this.ws = null;
    this.events = null;
  }

  raiseHand(): void {
    this.ws?.sendJson({ type: "raise", participantId: this.identity.participantId, participantName: this.identity.participantName });
  }
  lowerHand(): void {
    this.ws?.sendJson({ type: "lower", participantId: this.identity.participantId });
  }
  sendReaction(reaction: Reaction): void {
    this.ws?.sendJson({ type: "reaction", participantId: this.identity.participantId, participantName: this.identity.participantName, reaction });
  }
  clearReaction(): void {
    this.ws?.sendJson({ type: "clear_reaction", participantId: this.identity.participantId });
  }
  listParticipantStates(): ParticipantState[] {
    return [...this.states.values()];
  }
  connectionState(): SignalConnectionState {
    return this.state;
  }
}
