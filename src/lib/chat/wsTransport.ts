// Production chat transport — WebSocket-backed (Sprint 10).
//
// Implements the UNCHANGED ChatTransport port over a real WebSocket (via WsClient).
// No SDK; native transport only. Selected by the composition root when a chat WS
// URL is configured; otherwise the stub is used. Never crashes the session — a
// dropped socket surfaces as a connection-state change and auto-reconnects.
import { WsClient, type SocketFactory, type WsState } from "@/lib/net/wsClient";
import type {
  ChatConnectionState,
  ChatConnectOptions,
  ChatMessage,
  ChatTransport,
  ChatTransportEvents,
} from "./types";
import { ChatError } from "./types";

function mapState(s: WsState): ChatConnectionState {
  return s === "open" ? "connected" : s === "reconnecting" ? "reconnecting" : s === "connecting" ? "connecting" : "disconnected";
}

function normalize(raw: unknown, fallbackDelivery: ChatMessage["delivery"]): ChatMessage {
  const m = (raw ?? {}) as Partial<ChatMessage>;
  return {
    id: String(m.id ?? ""),
    senderId: String(m.senderId ?? ""),
    senderName: String(m.senderName ?? ""),
    timestamp: String(m.timestamp ?? new Date().toISOString()),
    text: String(m.text ?? ""),
    delivery: m.delivery ?? fallbackDelivery,
  };
}

export class WebSocketChatTransport implements ChatTransport {
  private ws: WsClient | null = null;
  private events: ChatTransportEvents | null = null;
  private identity = { senderId: "", senderName: "" };
  private history: ChatMessage[] = [];
  private state: ChatConnectionState = "idle";

  constructor(private baseUrl: string, private socketFactory?: SocketFactory) {}

  async connect(opts: ChatConnectOptions): Promise<void> {
    this.events = opts.events;
    this.identity = opts.identity;
    this.ws = new WsClient({
      url: `${this.baseUrl}?session=${encodeURIComponent(opts.sessionId)}`,
      socketFactory: this.socketFactory,
      onState: (s) => {
        this.state = mapState(s);
        this.events?.onConnectionState(this.state);
      },
      onMessage: (data) => this.handle(data),
    });
    this.ws.connect();
    // Resolve immediately; live connection state flows through events (as the stub).
  }

  private handle(data: unknown): void {
    const f = data as { type?: string; message?: unknown; messages?: unknown[] };
    if (f?.type === "message" && f.message) this.events?.onMessageReceived(normalize(f.message, "delivered"));
    else if (f?.type === "ack" && f.message) this.events?.onMessageSent(normalize(f.message, "delivered"));
    else if (f?.type === "history" && Array.isArray(f.messages)) this.history = f.messages.map((m) => normalize(m, "delivered"));
  }

  async disconnect(): Promise<void> {
    this.ws?.close();
    this.ws = null;
    this.events = null;
  }

  async sendMessage(input: { clientId: string; text: string }): Promise<void> {
    const ok = this.ws?.sendJson({
      type: "send",
      clientId: input.clientId,
      text: input.text,
      senderId: this.identity.senderId,
      senderName: this.identity.senderName,
    });
    if (!ok) throw new ChatError("send_failed");
  }

  async loadHistory(): Promise<ChatMessage[]> {
    return [...this.history];
  }

  markDelivered(messageId: string): void {
    this.ws?.sendJson({ type: "delivered", id: messageId });
  }

  markRead(messageId: string): void {
    this.ws?.sendJson({ type: "read", id: messageId });
  }

  getConnectionState(): ChatConnectionState {
    return this.state;
  }
}
