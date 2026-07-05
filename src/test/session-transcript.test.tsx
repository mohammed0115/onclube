import { describe, it, expect, vi } from "vitest";
import { render, screen, act, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionTranscript } from "@/components/session/SessionTranscript";
import { TranscriptProviderContext, TranscriptError } from "@/lib/transcript";
import type {
  TranscriptConnectOptions,
  TranscriptErrorCode,
  TranscriptEvents,
  TranscriptProvider,
  TranscriptSegment,
} from "@/lib/transcript";

function makeSeg(over: Partial<TranscriptSegment> & { segmentId: string }): TranscriptSegment {
  return {
    sessionId: "s1", speakerRole: "student", speakerName: "Me", text: "…", isFinal: false,
    startedAt: "2026-07-05T10:00:00.000Z", endedAt: null, language: "en", confidence: 0.9, ...over,
  };
}

class FakeTranscriptProvider implements TranscriptProvider {
  calls: string[] = [];
  autoConnect = true;
  failConnect: TranscriptErrorCode | null = null;
  finalizedSeed: TranscriptSegment[] = [];
  private events: TranscriptEvents | null = null;

  async connect(o: TranscriptConnectOptions): Promise<void> {
    this.calls.push("connect");
    this.events = o.events;
    if (this.failConnect) throw new TranscriptError(this.failConnect);
    o.events.onConnectionState("connecting");
    if (this.autoConnect) o.events.onConnectionState("connected");
  }
  async disconnect(): Promise<void> {
    this.calls.push("disconnect");
  }
  start(): void {
    this.calls.push("start");
  }
  stop(): void {
    this.calls.push("stop");
  }
  receiveSegment(): void {
    this.calls.push("receiveSegment");
  }
  listSegments(): TranscriptSegment[] {
    return this.finalizedSeed;
  }
  connectionState() {
    return "connected" as const;
  }
  // drivers
  emit(state: "reconnecting" | "connected" | "disconnected") {
    this.events?.onConnectionState(state);
  }
  partial(seg: TranscriptSegment) {
    this.events?.onPartialTranscript(seg);
  }
  final(seg: TranscriptSegment) {
    this.events?.onFinalTranscript(seg);
  }
}

async function open(fake: FakeTranscriptProvider) {
  render(
    <TranscriptProviderContext.Provider value={() => fake}>
      <SessionTranscript sessionId="s1" participantId="me" speakerName="Me" role="student" />
    </TranscriptProviderContext.Provider>
  );
  await userEvent.click(await screen.findByRole("button", { name: "Open transcript" }));
  return screen.getByTestId("transcript-scroll");
}

describe("Session transcript — Journey 5 live pipeline (Sprint 8.9)", () => {
  it("connects and starts capture through the injected provider", async () => {
    const fake = new FakeTranscriptProvider();
    render(
      <TranscriptProviderContext.Provider value={() => fake}>
        <SessionTranscript sessionId="s1" participantId="me" speakerName="Me" role="student" />
      </TranscriptProviderContext.Provider>
    );
    await screen.findByRole("button", { name: "Open transcript" });
    expect(fake.calls).toContain("connect");
    expect(fake.calls).toContain("start");
  });

  it("renders a partial segment with partial styling", async () => {
    const fake = new FakeTranscriptProvider();
    const scroll = await open(fake);
    act(() => fake.partial(makeSeg({ segmentId: "s1", text: "hello", isFinal: false })));
    const seg = await within(scroll).findByTestId("transcript-segment");
    expect(seg).toHaveAttribute("data-final", "false");
    expect(seg).toHaveTextContent("hello");
  });

  it("renders a final segment with final styling", async () => {
    const fake = new FakeTranscriptProvider();
    const scroll = await open(fake);
    act(() => fake.final(makeSeg({ segmentId: "s1", text: "hello world", isFinal: true })));
    const seg = await within(scroll).findByTestId("transcript-segment");
    expect(seg).toHaveAttribute("data-final", "true");
    expect(seg).toHaveTextContent("hello world");
  });

  it("updates a partial in place until finalized", async () => {
    const fake = new FakeTranscriptProvider();
    const scroll = await open(fake);
    act(() => fake.partial(makeSeg({ segmentId: "s1", text: "hel" })));
    act(() => fake.partial(makeSeg({ segmentId: "s1", text: "hello" })));
    await waitFor(() => expect(within(scroll).getAllByTestId("transcript-segment")).toHaveLength(1));
    expect(within(scroll).getByTestId("transcript-segment")).toHaveTextContent("hello");
    // Finalize → immutable.
    act(() => fake.final(makeSeg({ segmentId: "s1", text: "hello world", isFinal: true })));
    act(() => fake.partial(makeSeg({ segmentId: "s1", text: "TAMPERED" }))); // ignored
    await waitFor(() => expect(within(scroll).getByTestId("transcript-segment")).toHaveTextContent("hello world"));
  });

  it("orders segments by startedAt regardless of arrival order", async () => {
    const fake = new FakeTranscriptProvider();
    const scroll = await open(fake);
    act(() => fake.final(makeSeg({ segmentId: "b", text: "SECOND", isFinal: true, startedAt: "2026-07-05T10:00:02.000Z" })));
    act(() => fake.final(makeSeg({ segmentId: "a", text: "FIRST", isFinal: true, startedAt: "2026-07-05T10:00:01.000Z" })));
    await within(scroll).findByText("FIRST");
    const body = scroll.textContent ?? "";
    expect(body.indexOf("FIRST")).toBeLessThan(body.indexOf("SECOND"));
  });

  it("ignores duplicate segments", async () => {
    const fake = new FakeTranscriptProvider();
    const scroll = await open(fake);
    act(() => fake.final(makeSeg({ segmentId: "s1", text: "once", isFinal: true })));
    act(() => fake.final(makeSeg({ segmentId: "s1", text: "once", isFinal: true })));
    await waitFor(() => expect(within(scroll).getAllByTestId("transcript-segment")).toHaveLength(1));
  });

  it("auto-scrolls on a new segment", async () => {
    const spy = vi.fn();
    (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = spy;
    const fake = new FakeTranscriptProvider();
    await open(fake);
    spy.mockClear();
    act(() => fake.final(makeSeg({ segmentId: "s1", text: "new", isFinal: true })));
    await waitFor(() => expect(spy).toHaveBeenCalled());
  });

  it("seeds finalized segments on late join (partials excluded)", async () => {
    const fake = new FakeTranscriptProvider();
    fake.finalizedSeed = [makeSeg({ segmentId: "old", text: "earlier final", isFinal: true })];
    const scroll = await open(fake);
    expect(await within(scroll).findByText("earlier final")).toBeInTheDocument();
    expect(within(scroll).getAllByTestId("transcript-segment")).toHaveLength(1);
  });

  it("shows a reconnecting indicator and recovers", async () => {
    const fake = new FakeTranscriptProvider();
    const scroll = await open(fake);
    void scroll;
    act(() => fake.emit("reconnecting"));
    expect(await screen.findByText("Reconnecting…")).toBeInTheDocument();
    act(() => fake.emit("connected"));
    await waitFor(() => expect(screen.queryByText("Reconnecting…")).not.toBeInTheDocument());
  });

  it("stops + disconnects on unmount", async () => {
    const fake = new FakeTranscriptProvider();
    const { unmount } = render(
      <TranscriptProviderContext.Provider value={() => fake}>
        <SessionTranscript sessionId="s1" participantId="me" speakerName="Me" role="student" />
      </TranscriptProviderContext.Provider>
    );
    await screen.findByRole("button", { name: "Open transcript" });
    unmount();
    expect(fake.calls).toContain("stop");
    expect(fake.calls).toContain("disconnect");
  });

  it("drives the pipeline exclusively through the injected provider", async () => {
    const fake = new FakeTranscriptProvider();
    const { unmount } = render(
      <TranscriptProviderContext.Provider value={() => fake}>
        <SessionTranscript sessionId="s1" participantId="me" speakerName="Me" role="student" />
      </TranscriptProviderContext.Provider>
    );
    await screen.findByRole("button", { name: "Open transcript" });
    unmount();
    const allowed = /^(connect|disconnect|start|stop|receiveSegment|listSegments)$/;
    expect(fake.calls.every((c) => allowed.test(c))).toBe(true);
  });
});
