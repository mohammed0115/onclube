import { describe, it, expect, vi, afterEach } from "vitest";
import { WsClient, type WebSocketLike } from "@/lib/net/wsClient";
import { WebSocketChatTransport } from "@/lib/chat/wsTransport";
import type { ChatMessage, ChatTransportEvents } from "@/lib/chat";

// A controllable mock WebSocket implementing the minimal WebSocketLike shape.
class MockSocket implements WebSocketLike {
  readyState = 0; // CONNECTING
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.triggerClose();
  }
  // drivers
  triggerOpen() {
    this.readyState = 1;
    this.onopen?.(null);
  }
  triggerMessage(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }
  triggerClose() {
    this.readyState = 3;
    this.onclose?.(null);
  }
}

function recorderEvents() {
  const messages: ChatMessage[] = [];
  const sentAcks: ChatMessage[] = [];
  const states: string[] = [];
  const events: ChatTransportEvents = {
    onConnectionState: (s) => states.push(s),
    onMessageReceived: (m) => messages.push(m),
    onMessageSent: (m) => sentAcks.push(m),
    onError: () => {},
  };
  return { events, messages, sentAcks, states };
}

describe("WsClient (Sprint 10 transport primitive)", () => {
  afterEach(() => vi.useRealTimers());

  it("opens through the injected socket factory and reports state", () => {
    let sock: MockSocket | null = null;
    const states: string[] = [];
    const client = new WsClient({
      url: "wss://x",
      onState: (s) => states.push(s),
      socketFactory: () => (sock = new MockSocket()),
    });
    client.connect();
    expect(states).toContain("connecting");
    sock!.triggerOpen();
    expect(states).toContain("open");
    expect(client.isOpen()).toBe(true);
  });

  it("sends JSON only when open, and parses incoming JSON", () => {
    let sock: MockSocket | null = null;
    const received: unknown[] = [];
    const client = new WsClient({
      url: "wss://x",
      onMessage: (d) => received.push(d),
      socketFactory: () => (sock = new MockSocket()),
    });
    client.connect();
    expect(client.sendJson({ a: 1 })).toBe(false); // not open yet
    sock!.triggerOpen();
    expect(client.sendJson({ a: 1 })).toBe(true);
    expect(JSON.parse(sock!.sent[0])).toEqual({ a: 1 });
    sock!.triggerMessage({ hello: "world" });
    expect(received[0]).toEqual({ hello: "world" });
  });

  it("reconnects with backoff after an unexpected close", () => {
    vi.useFakeTimers();
    let count = 0;
    const states: string[] = [];
    const client = new WsClient({
      url: "wss://x",
      baseBackoffMs: 100,
      onState: (s) => states.push(s),
      socketFactory: () => {
        count += 1;
        return new MockSocket();
      },
    });
    client.connect();
    // Simulate the socket dropping (not closed by us).
    (client as unknown as { socket: MockSocket }).socket.triggerClose();
    expect(states).toContain("reconnecting");
    vi.advanceTimersByTime(100);
    expect(count).toBe(2); // reconnected
    client.close();
  });

  it("does not reconnect after an explicit close", () => {
    let count = 0;
    const client = new WsClient({ url: "wss://x", socketFactory: () => { count += 1; return new MockSocket(); } });
    client.connect();
    client.close();
    expect(count).toBe(1);
  });
});

describe("WebSocketChatTransport (Sprint 10 production adapter)", () => {
  function connected() {
    let sock: MockSocket | null = null;
    const t = new WebSocketChatTransport("wss://chat", () => (sock = new MockSocket()));
    const { events, messages, sentAcks, states } = recorderEvents();
    t.connect({ sessionId: "s1", identity: { senderId: "me", senderName: "Me" }, events });
    sock!.triggerOpen();
    return { t, sock: sock!, messages, sentAcks, states };
  }

  it("maps socket state to connected and sends a message frame", async () => {
    const { t, sock, states } = connected();
    expect(states).toContain("connected");
    await t.sendMessage({ clientId: "c1", text: "hi" });
    const frame = JSON.parse(sock.sent[0]);
    expect(frame).toMatchObject({ type: "send", clientId: "c1", text: "hi", senderId: "me" });
  });

  it("dispatches received + ack frames to the right events", async () => {
    const { sock, messages, sentAcks } = connected();
    sock.triggerMessage({ type: "message", message: { id: "r1", senderId: "peer", senderName: "Sarah", text: "yo", timestamp: "t", delivery: "delivered" } });
    sock.triggerMessage({ type: "ack", message: { id: "c1", senderId: "me", senderName: "Me", text: "hi", timestamp: "t", delivery: "delivered" } });
    expect(messages[0].text).toBe("yo");
    expect(sentAcks[0].id).toBe("c1");
  });

  it("buffers history for late joiners", async () => {
    const { t, sock } = connected();
    sock.triggerMessage({ type: "history", messages: [{ id: "h1", senderId: "peer", senderName: "S", text: "earlier", timestamp: "t", delivery: "delivered" }] });
    expect((await t.loadHistory())[0].text).toBe("earlier");
  });

  it("throws send_failed when the socket is not open", async () => {
    const t = new WebSocketChatTransport("wss://chat", () => new MockSocket());
    const { events } = recorderEvents();
    await t.connect({ sessionId: "s1", identity: { senderId: "me", senderName: "Me" }, events });
    // socket never opened → send fails, surfaced to the hook (which marks failed).
    await expect(t.sendMessage({ clientId: "c1", text: "hi" })).rejects.toMatchObject({ code: "send_failed" });
  });
});
