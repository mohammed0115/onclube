// Stub chat transport — SIMULATION ONLY.
//
// Default adapter for dev/preview. No WebSocket, no SDK, no network. It simulates
// the connection lifecycle and locally echoes an ack for messages the user sends
// so the panel is exercisable end-to-end. A real adapter implements the same
// `ChatTransport` port and replaces this with zero UI changes.
import type {
  ChatConnectionState,
  ChatConnectOptions,
  ChatMessage,
  ChatTransport,
  ChatTransportEvents,
} from "./types";

const CONNECT_DELAY_MS = 200;

export class StubChatTransport implements ChatTransport {
  private state: ChatConnectionState = "idle";
  private events: ChatTransportEvents | null = null;
  private identity = { senderId: "", senderName: "" };
  private timers: ReturnType<typeof setTimeout>[] = [];

  async connect(opts: ChatConnectOptions): Promise<void> {
    this.events = opts.events;
    this.identity = opts.identity;
    this.setState("connecting");
    this.timers.push(setTimeout(() => this.setState("connected"), CONNECT_DELAY_MS));
  }

  async disconnect(): Promise<void> {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.setState("disconnected");
    this.events = null;
  }

  async sendMessage({ clientId, text }: { clientId: string; text: string }): Promise<void> {
    // Local echo: acknowledge as delivered (no peer in the stub).
    const msg: ChatMessage = {
      id: clientId,
      senderId: this.identity.senderId,
      senderName: this.identity.senderName,
      timestamp: new Date().toISOString(),
      text,
      delivery: "delivered",
    };
    this.events?.onMessageSent(msg);
  }

  async loadHistory(): Promise<ChatMessage[]> {
    return []; // no persistence — history starts empty
  }

  markDelivered(): void {
    /* no-op in the stub */
  }

  markRead(): void {
    /* no-op in the stub */
  }

  getConnectionState(): ChatConnectionState {
    return this.state;
  }

  private setState(state: ChatConnectionState): void {
    this.state = state;
    this.events?.onConnectionState(state);
  }
}

export const createStubChatTransport = (): ChatTransport => new StubChatTransport();
