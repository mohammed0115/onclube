// Reusable production WebSocket client (Sprint 10).
//
// Native `WebSocket` only — no external dependency. Lazy connect, automatic
// reconnect with capped backoff, JSON send/receive, and clean teardown. The
// socket constructor is injectable so tests can drive it deterministically. All
// live-session real transports (chat/signals/presence/transcript/whiteboard) are
// built on this; it never throws into the caller — failures surface via onState.

export type WsState = "connecting" | "open" | "reconnecting" | "closed";

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export type SocketFactory = (url: string) => WebSocketLike;

export interface WsClientOptions {
  url: string;
  onMessage?: (data: unknown) => void;
  onState?: (state: WsState) => void;
  maxRetries?: number;
  baseBackoffMs?: number;
  socketFactory?: SocketFactory;
}

const OPEN = 1;

function defaultSocketFactory(url: string): WebSocketLike {
  // Native browser WebSocket; typed to our minimal shape.
  return new WebSocket(url) as unknown as WebSocketLike;
}

export class WsClient {
  private socket: WebSocketLike | null = null;
  private state: WsState = "closed";
  private retries = 0;
  private closedByUs = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  private readonly url: string;
  private readonly onMessage?: (data: unknown) => void;
  private readonly onState?: (state: WsState) => void;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly factory: SocketFactory;

  constructor(opts: WsClientOptions) {
    this.url = opts.url;
    this.onMessage = opts.onMessage;
    this.onState = opts.onState;
    this.maxRetries = opts.maxRetries ?? 5;
    this.baseBackoffMs = opts.baseBackoffMs ?? 500;
    this.factory = opts.socketFactory ?? defaultSocketFactory;
  }

  connect(): void {
    this.closedByUs = false;
    this.open(false);
  }

  private open(isRetry: boolean): void {
    this.setState(isRetry ? "reconnecting" : "connecting");
    let sock: WebSocketLike;
    try {
      sock = this.factory(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = sock;
    sock.onopen = () => {
      this.retries = 0;
      this.setState("open");
    };
    sock.onmessage = (ev) => {
      let parsed: unknown = ev.data;
      if (typeof ev.data === "string") {
        try {
          parsed = JSON.parse(ev.data);
        } catch {
          parsed = ev.data;
        }
      }
      this.onMessage?.(parsed);
    };
    sock.onerror = () => {
      /* errors precede close; reconnect is driven by onclose */
    };
    sock.onclose = () => {
      this.socket = null;
      if (this.closedByUs) {
        this.setState("closed");
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.retries >= this.maxRetries) {
      this.setState("closed");
      return;
    }
    this.retries += 1;
    const delay = this.baseBackoffMs * 2 ** (this.retries - 1);
    this.setState("reconnecting");
    this.timer = setTimeout(() => this.open(true), delay);
  }

  sendJson(payload: unknown): boolean {
    if (this.socket && this.socket.readyState === OPEN) {
      this.socket.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  isOpen(): boolean {
    return this.state === "open";
  }

  close(): void {
    this.closedByUs = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    try {
      this.socket?.close();
    } catch {
      /* ignore */
    }
    this.socket = null;
    this.setState("closed");
  }

  private setState(state: WsState): void {
    this.state = state;
    this.onState?.(state);
  }
}
