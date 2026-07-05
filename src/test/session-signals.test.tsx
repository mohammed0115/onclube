import { describe, it, expect, vi } from "vitest";
import { render, screen, act, waitFor, within, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { SessionSignals } from "@/components/session/SessionSignals";
import { useParticipantSignals } from "@/hooks";
import { ParticipantSignalProviderContext, SignalError } from "@/lib/signals";
import type {
  ParticipantSignalEvents,
  ParticipantSignalProvider,
  ParticipantState,
  Reaction,
  SignalConnectOptions,
  SignalErrorCode,
} from "@/lib/signals";

class FakeSignalProvider implements ParticipantSignalProvider {
  calls: string[] = [];
  autoConnect = true;
  failConnect: SignalErrorCode | null = null;
  initial: ParticipantState[] = [];
  private events: ParticipantSignalEvents | null = null;
  private identity = { participantId: "me", participantName: "Me" };

  async connect(o: SignalConnectOptions): Promise<void> {
    this.calls.push("connect");
    this.events = o.events;
    this.identity = o.identity;
    if (this.failConnect) throw new SignalError(this.failConnect);
    o.events.onConnectionState("connecting");
    if (this.autoConnect) o.events.onConnectionState("connected");
  }
  async disconnect(): Promise<void> {
    this.calls.push("disconnect");
    this.events?.onConnectionState("disconnected");
  }
  raiseHand(): void {
    this.calls.push("raiseHand");
    this.events?.onHandRaised({ participantId: this.identity.participantId, participantName: this.identity.participantName });
  }
  lowerHand(): void {
    this.calls.push("lowerHand");
    this.events?.onHandLowered({ participantId: this.identity.participantId });
  }
  sendReaction(reaction: Reaction): void {
    this.calls.push(`sendReaction:${reaction}`);
    this.events?.onReactionReceived({
      participantId: this.identity.participantId, participantName: this.identity.participantName,
      reaction, timestamp: new Date().toISOString(),
    });
  }
  clearReaction(): void {
    this.calls.push("clearReaction");
    this.events?.onReactionExpired({ participantId: this.identity.participantId });
  }
  listParticipantStates(): ParticipantState[] {
    return this.initial;
  }
  connectionState() {
    return "connected" as const;
  }
  // drivers
  emit(state: "reconnecting" | "connected" | "disconnected") {
    this.events?.onConnectionState(state);
  }
  remoteRaise(id: string, name: string) {
    this.events?.onHandRaised({ participantId: id, participantName: name });
  }
  remoteReaction(id: string, name: string, r: Reaction) {
    this.events?.onReactionReceived({ participantId: id, participantName: name, reaction: r, timestamp: new Date().toISOString() });
  }
  expireReaction(id: string) {
    this.events?.onReactionExpired({ participantId: id });
  }
}

function renderSignals(fake: FakeSignalProvider) {
  return render(
    <ParticipantSignalProviderContext.Provider value={() => fake}>
      <SessionSignals sessionId="s1" participantId="me" participantName="Me" />
    </ParticipantSignalProviderContext.Provider>
  );
}

function hookWrapper(fake: FakeSignalProvider) {
  return ({ children }: { children: ReactNode }) => (
    <ParticipantSignalProviderContext.Provider value={() => fake}>{children}</ParticipantSignalProviderContext.Provider>
  );
}

describe("Participant signals — Journey 5 (Sprint 8.6)", () => {
  it("connects through the injected provider", async () => {
    const fake = new FakeSignalProvider();
    renderSignals(fake);
    await screen.findByRole("button", { name: "Raise hand" });
    expect(fake.calls).toContain("connect");
  });

  it("raises and lowers the hand through the provider", async () => {
    const fake = new FakeSignalProvider();
    renderSignals(fake);
    await userEvent.click(await screen.findByRole("button", { name: "Raise hand" }));
    expect(fake.calls).toContain("raiseHand");
    expect(await screen.findByRole("button", { name: "Lower hand" })).toHaveAttribute("aria-pressed", "true");
    // Own badge shows the raised hand.
    const badges = screen.getByLabelText("Participant signals");
    expect(within(badges).getByText(/Me \(You\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Lower hand" }));
    expect(fake.calls).toContain("lowerHand");
    expect(await screen.findByRole("button", { name: "Raise hand" })).toBeInTheDocument();
  });

  it("raise hand is idempotent", () => {
    const fake = new FakeSignalProvider();
    const { result } = renderHook(() => useParticipantSignals({ sessionId: "s1", participantId: "me", participantName: "Me" }), {
      wrapper: hookWrapper(fake),
    });
    act(() => result.current.raiseHand());
    act(() => result.current.raiseHand());
    expect(fake.calls.filter((c) => c === "raiseHand")).toHaveLength(1);
  });

  it("lower hand is idempotent", () => {
    const fake = new FakeSignalProvider();
    const { result } = renderHook(() => useParticipantSignals({ sessionId: "s1", participantId: "me", participantName: "Me" }), {
      wrapper: hookWrapper(fake),
    });
    act(() => result.current.raiseHand());
    act(() => result.current.lowerHand());
    act(() => result.current.lowerHand());
    expect(fake.calls.filter((c) => c === "lowerHand")).toHaveLength(1);
  });

  it("sends a reaction and shows a floating bubble + badge", async () => {
    const fake = new FakeSignalProvider();
    renderSignals(fake);
    await userEvent.click(await screen.findByRole("button", { name: "React" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "React with 👍" }));
    expect(fake.calls).toContain("sendReaction:👍");
    expect(await screen.findByTestId("floating-reaction")).toHaveTextContent("👍");
    const badges = screen.getByLabelText("Participant signals");
    expect(within(badges).getByText("👍")).toBeInTheDocument();
  });

  it("a new reaction replaces the previous one", async () => {
    const fake = new FakeSignalProvider();
    renderSignals(fake);
    await userEvent.click(await screen.findByRole("button", { name: "React" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "React with 👍" }));
    await userEvent.click(screen.getByRole("button", { name: "React" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "React with ❤️" }));
    const badges = screen.getByLabelText("Participant signals");
    await waitFor(() => expect(within(badges).getByText("❤️")).toBeInTheDocument());
    expect(within(badges).queryByText("👍")).not.toBeInTheDocument(); // replaced
  });

  it("clears a reaction badge when it expires (timeout)", async () => {
    const fake = new FakeSignalProvider();
    renderSignals(fake);
    await userEvent.click(await screen.findByRole("button", { name: "React" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "React with ❤️" }));
    expect(screen.getByLabelText("Participant signals")).toBeInTheDocument();
    act(() => fake.expireReaction("me"));
    await waitFor(() => expect(screen.queryByLabelText("Participant signals")).not.toBeInTheDocument());
  });

  it("shows the current participant states on late join", async () => {
    const fake = new FakeSignalProvider();
    fake.initial = [
      { participantId: "me", participantName: "Me", handRaised: false, reaction: null, reactionTimestamp: null },
      { participantId: "p2", participantName: "Sarah Mitchell", handRaised: true, reaction: null, reactionTimestamp: null },
    ];
    renderSignals(fake);
    const badges = await screen.findByLabelText("Participant signals");
    expect(within(badges).getByText("Sarah Mitchell")).toBeInTheDocument();
  });

  it("shows a remote participant's reaction", async () => {
    const fake = new FakeSignalProvider();
    renderSignals(fake);
    await screen.findByRole("button", { name: "Raise hand" });
    act(() => fake.remoteReaction("p2", "Sarah Mitchell", "👏"));
    const badges = await screen.findByLabelText("Participant signals");
    expect(within(badges).getByText("Sarah Mitchell")).toBeInTheDocument();
    expect(within(badges).getByText("👏")).toBeInTheDocument();
  });

  it("clears state when the participant leaves (unmount → disconnect)", async () => {
    const fake = new FakeSignalProvider();
    const { unmount } = renderSignals(fake);
    await screen.findByRole("button", { name: "Raise hand" });
    unmount();
    expect(fake.calls).toContain("disconnect");
  });

  it("shows a reconnecting indicator and recovers", async () => {
    const fake = new FakeSignalProvider();
    renderSignals(fake);
    await screen.findByRole("button", { name: "Raise hand" });
    act(() => fake.emit("reconnecting"));
    expect(await screen.findByText("Reconnecting signals…")).toBeInTheDocument();
    act(() => fake.emit("connected"));
    await waitFor(() => expect(screen.queryByText("Reconnecting signals…")).not.toBeInTheDocument());
  });

  it("drives signaling exclusively through the injected provider (component stays pure)", async () => {
    const fake = new FakeSignalProvider();
    renderSignals(fake);
    await userEvent.click(await screen.findByRole("button", { name: "Raise hand" }));
    await userEvent.click(screen.getByRole("button", { name: "React" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "React with 👍" }));
    const allowed = /^(connect|disconnect|raiseHand|lowerHand|sendReaction:|clearReaction)/;
    expect(fake.calls.every((c) => allowed.test(c))).toBe(true);
  });
});
