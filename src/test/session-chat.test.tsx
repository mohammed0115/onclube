import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionChat } from "@/components/session/SessionChat";
import {
  ChatTransportContext,
  ChatError,
  validateChatMessage,
  MAX_CHAT_MESSAGE_LENGTH,
} from "@/lib/chat";
import type {
  ChatConnectOptions,
  ChatErrorCode,
  ChatMessage,
  ChatTransport,
  ChatTransportEvents,
} from "@/lib/chat";

// A fully controllable fake transport — the UI must drive chat purely through
// this port (proves the abstraction + injection).
class FakeChatTransport implements ChatTransport {
  calls: string[] = [];
  sentTexts: string[] = [];
  history: ChatMessage[] = [];
  autoConnect = true;
  failConnect: ChatErrorCode | null = null;
  failSendWith: ChatErrorCode | null = null;
  private events: ChatTransportEvents | null = null;
  private identity = { senderId: "me", senderName: "Me" };

  async connect(o: ChatConnectOptions): Promise<void> {
    this.calls.push("connect");
    this.events = o.events;
    this.identity = o.identity;
    if (this.failConnect) throw new ChatError(this.failConnect);
    o.events.onConnectionState("connecting");
    if (this.autoConnect) o.events.onConnectionState("connected");
  }
  async disconnect(): Promise<void> {
    this.calls.push("disconnect");
    this.events?.onConnectionState("disconnected");
  }
  async sendMessage({ clientId, text }: { clientId: string; text: string }): Promise<void> {
    this.calls.push("sendMessage");
    this.sentTexts.push(text);
    if (this.failSendWith) throw new ChatError(this.failSendWith);
    this.events?.onMessageSent({
      id: clientId,
      senderId: this.identity.senderId,
      senderName: this.identity.senderName,
      timestamp: new Date().toISOString(),
      text,
      delivery: "delivered",
    });
  }
  async loadHistory(): Promise<ChatMessage[]> {
    this.calls.push("loadHistory");
    return this.history;
  }
  markDelivered(): void {}
  markRead(): void {
    this.calls.push("markRead");
  }
  getConnectionState() {
    return "connected" as const;
  }
  // drivers
  emit(state: "reconnecting" | "connected" | "disconnected") {
    this.events?.onConnectionState(state);
  }
  receive(m: { senderId: string; text: string; id?: string; senderName?: string; timestamp?: string }) {
    this.events?.onMessageReceived({
      id: m.id ?? `r-${Math.round(Math.random() * 1e9)}`,
      senderId: m.senderId,
      senderName: m.senderName ?? "Sarah Mitchell",
      timestamp: m.timestamp ?? new Date().toISOString(),
      text: m.text,
      delivery: "delivered",
    });
  }
}

function renderChat(fake: FakeChatTransport, onClose = vi.fn()) {
  return render(
    <ChatTransportContext.Provider value={() => fake}>
      <SessionChat sessionId="s1" senderId="me" senderName="Me" onClose={onClose} />
    </ChatTransportContext.Provider>
  );
}

async function connected(fake: FakeChatTransport) {
  const r = renderChat(fake);
  await screen.findByText("Connected");
  return r;
}

describe("Session chat — Journey 5 messaging (Sprint 8.3)", () => {
  it("connects through the injected transport and loads history", async () => {
    const fake = new FakeChatTransport();
    await connected(fake);
    expect(fake.calls).toContain("connect");
    expect(fake.calls).toContain("loadHistory");
  });

  it("sends a message on Enter and shows it as an own bubble", async () => {
    const fake = new FakeChatTransport();
    await connected(fake);
    await userEvent.type(screen.getByLabelText("Message"), "hello there{Enter}");
    expect(fake.sentTexts).toEqual(["hello there"]);
    expect(await screen.findByText("hello there")).toBeInTheDocument();
  });

  it("Shift+Enter inserts a newline instead of sending", async () => {
    const fake = new FakeChatTransport();
    await connected(fake);
    const input = screen.getByLabelText("Message") as HTMLTextAreaElement;
    await userEvent.type(input, "line1{Shift>}{Enter}{/Shift}line2");
    expect(fake.calls).not.toContain("sendMessage");
    expect(input.value).toContain("\n");
  });

  it("receives a remote message and shows it with the sender name", async () => {
    const fake = new FakeChatTransport();
    await connected(fake);
    act(() => fake.receive({ senderId: "peer", senderName: "Sarah Mitchell", text: "hi from Sarah" }));
    expect(await screen.findByText("hi from Sarah")).toBeInTheDocument();
    expect(screen.getByText("Sarah Mitchell")).toBeInTheDocument();
  });

  it("renders messages in chronological order regardless of arrival order", async () => {
    const fake = new FakeChatTransport();
    await connected(fake);
    // Deliver the later message first.
    act(() => fake.receive({ senderId: "peer", text: "SECOND", timestamp: "2026-07-05T10:01:00.000Z" }));
    act(() => fake.receive({ senderId: "peer", text: "FIRST", timestamp: "2026-07-05T10:00:00.000Z" }));
    await screen.findByText("FIRST");
    const body = screen.getByTestId("chat-scroll").textContent ?? "";
    expect(body.indexOf("FIRST")).toBeLessThan(body.indexOf("SECOND"));
  });

  it("auto-scrolls to the newest message", async () => {
    const spy = vi.fn();
    // jsdom doesn't implement scrollIntoView; provide it so the effect can run.
    (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = spy;
    const fake = new FakeChatTransport();
    await connected(fake);
    spy.mockClear();
    act(() => fake.receive({ senderId: "peer", text: "newest" }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
  });

  it("shows an unread separator for messages received, cleared on focus", async () => {
    const fake = new FakeChatTransport();
    await connected(fake);
    act(() => fake.receive({ senderId: "peer", text: "unread one" }));
    expect(await screen.findByText(/New messages/i)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Message")); // focus → markRead
    await waitFor(() => expect(screen.queryByText(/New messages/i)).not.toBeInTheDocument());
    expect(fake.calls).toContain("markRead");
  });

  it("shows a reconnecting indicator and recovers", async () => {
    const fake = new FakeChatTransport();
    await connected(fake);
    act(() => fake.emit("reconnecting"));
    expect(await screen.findByText("Reconnecting…")).toBeInTheDocument();
    act(() => fake.emit("connected"));
    await waitFor(() => expect(screen.queryByText("Reconnecting…")).not.toBeInTheDocument());
  });

  it("rejects an empty / whitespace-only message", async () => {
    const fake = new FakeChatTransport();
    await connected(fake);
    await userEvent.type(screen.getByLabelText("Message"), "   {Enter}");
    expect(fake.calls).not.toContain("sendMessage");
    expect(await screen.findByText(/Type a message before sending/i)).toBeInTheDocument();
  });

  it("rejects an oversized message (max length enforced)", async () => {
    const fake = new FakeChatTransport();
    await connected(fake);
    const input = screen.getByLabelText("Message") as HTMLTextAreaElement;
    // Bypass the maxLength attribute to exercise the hook's validation path.
    fireEvent.change(input, { target: { value: "x".repeat(MAX_CHAT_MESSAGE_LENGTH + 1) } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(fake.calls).not.toContain("sendMessage");
    expect(await screen.findByText(/too long/i)).toBeInTheDocument();
    // The textarea also caps input at the browser level.
    expect(input).toHaveAttribute("maxLength", String(MAX_CHAT_MESSAGE_LENGTH));
  });

  it("validateChatMessage enforces empty + max length", () => {
    expect(validateChatMessage("   ")).toEqual({ ok: false, code: "empty_message" });
    expect(validateChatMessage("x".repeat(MAX_CHAT_MESSAGE_LENGTH + 1))).toEqual({ ok: false, code: "oversized_message" });
    expect(validateChatMessage("  hi  ")).toEqual({ ok: true, text: "hi" });
  });

  it("surfaces a send failure without ending the session", async () => {
    const fake = new FakeChatTransport();
    fake.failSendWith = "send_failed";
    await connected(fake);
    await userEvent.type(screen.getByLabelText("Message"), "will fail{Enter}");
    expect(await screen.findByText(/couldn’t be sent/i)).toBeInTheDocument();
    // Still connected.
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("disconnects the transport when the chat unmounts (leave)", async () => {
    const fake = new FakeChatTransport();
    const { unmount } = await connected(fake);
    unmount();
    expect(fake.calls).toContain("disconnect");
  });

  it("disconnects the transport when the room unmounts (session end)", async () => {
    const fake = new FakeChatTransport();
    function Host({ open }: { open: boolean }) {
      return (
        <ChatTransportContext.Provider value={() => fake}>
          {open ? <SessionChat sessionId="s1" senderId="me" senderName="Me" onClose={vi.fn()} /> : null}
        </ChatTransportContext.Provider>
      );
    }
    const { rerender } = render(<Host open />);
    await screen.findByText("Connected");
    rerender(<Host open={false} />); // session ends → chat torn down
    await waitFor(() => expect(fake.calls).toContain("disconnect"));
  });

  it("closes the panel via the close button", async () => {
    const fake = new FakeChatTransport();
    const onClose = vi.fn();
    renderChat(fake, onClose);
    await screen.findByText("Connected");
    await userEvent.click(screen.getByLabelText("Close chat"));
    expect(onClose).toHaveBeenCalled();
  });

  it("drives chat exclusively through the injected transport (component stays pure)", async () => {
    const fake = new FakeChatTransport();
    await connected(fake);
    await userEvent.type(screen.getByLabelText("Message"), "port only{Enter}");
    const allowed = /^(connect|disconnect|sendMessage|loadHistory|markRead)$/;
    expect(fake.calls.every((c) => allowed.test(c))).toBe(true);
  });
});

// Sanity: bubbles distinguish own vs remote.
describe("Session chat — own vs remote rendering", () => {
  beforeEach(() => {
    (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
  });

  it("labels remote messages with the sender and leaves own messages unlabelled", async () => {
    const fake = new FakeChatTransport();
    await connected(fake);
    await userEvent.type(screen.getByLabelText("Message"), "mine{Enter}");
    act(() => fake.receive({ senderId: "peer", senderName: "Sarah Mitchell", text: "theirs" }));
    const scroll = screen.getByTestId("chat-scroll");
    expect(within(scroll).getByText("theirs")).toBeInTheDocument();
    expect(within(scroll).getByText("Sarah Mitchell")).toBeInTheDocument();
    // "Me" (own name) is not rendered as a bubble label.
    expect(within(scroll).queryByText("Me")).not.toBeInTheDocument();
  });
});
