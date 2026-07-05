// Provider-neutral in-session chat contract.
//
// This is the ONLY surface the UI/hooks talk to. No WebSocket, RTCDataChannel,
// Agora Chat, Daily Chat, or any SDK type ever crosses this boundary — swapping
// transports means writing a new adapter that implements `ChatTransport`, with
// zero changes to the hook, the panel, the domain, or the API.

export type ChatConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";

export type ChatDeliveryState = "sending" | "sent" | "delivered" | "read" | "failed";

/** A single chat message. Text only — no attachments/images/voice/stickers. */
export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  timestamp: string; // ISO 8601
  text: string;
  delivery: ChatDeliveryState;
}

export type ChatErrorCode =
  | "connection_lost"
  | "provider_unavailable"
  | "send_failed"
  | "message_timeout"
  | "oversized_message"
  | "empty_message"
  | "unsupported_transport"
  | "unknown";

export class ChatError extends Error {
  code: ChatErrorCode;
  constructor(code: ChatErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ChatError";
    this.code = code;
  }
}

export interface ChatIdentity {
  senderId: string;
  senderName: string;
}

/** Transport → app event callbacks. The adapter pushes; it never pulls. */
export interface ChatTransportEvents {
  onConnectionState(state: ChatConnectionState): void;
  onMessageReceived(message: ChatMessage): void;
  /** Ack for a previously-sent message (id echoed) with an updated delivery. */
  onMessageSent(message: ChatMessage): void;
  /** Interface-only per sprint scope — no typing indicator is implemented. */
  onTypingState?(state: { senderId: string; typing: boolean }): void;
  onError(error: ChatError): void;
}

export interface ChatConnectOptions {
  sessionId: string;
  identity: ChatIdentity;
  events: ChatTransportEvents;
}

/**
 * The chat transport port. A real adapter (Agora/Daily/LiveKit/Zoom/Twilio/
 * custom WebSocket or RTCDataChannel) implements this and lives entirely in
 * infrastructure.
 */
export interface ChatTransport {
  connect(opts: ChatConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(input: { clientId: string; text: string }): Promise<void>;
  loadHistory(): Promise<ChatMessage[]>;
  markDelivered(messageId: string): void;
  markRead(messageId: string): void;
  getConnectionState(): ChatConnectionState;

  // Optional interface members ONLY — editing/deleting are explicitly NOT
  // implemented this sprint. Declared so an adapter/UI could add them later
  // without changing the port shape.
  editMessage?(messageId: string, text: string): Promise<void>;
  deleteMessage?(messageId: string): Promise<void>;
}

export type ChatTransportFactory = () => ChatTransport;
