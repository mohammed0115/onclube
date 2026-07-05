import { describe, it, expect, vi } from "vitest";
import { render, screen, act, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionPresence } from "@/components/session/SessionPresence";
import { PresenceProviderContext, PresenceError } from "@/lib/presence";
import type {
  AttendanceRecord,
  PresenceConnectOptions,
  PresenceErrorCode,
  PresenceEvents,
  PresenceProvider,
  SessionAttendance,
} from "@/lib/presence";

function rec(over: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    participantId: "me", participantName: "Me", role: "student",
    joinedAt: "2026-07-05T10:00:00.000Z", leftAt: null, totalPresenceDuration: 0,
    currentlyPresent: true, attendanceStatus: "present", ...over,
  };
}

class FakePresenceProvider implements PresenceProvider {
  calls: string[] = [];
  autoConnect = true;
  failConnect: PresenceErrorCode | null = null;
  snapshot: SessionAttendance = { sessionId: "s1", participants: [rec()], finalized: false };
  private events: PresenceEvents | null = null;

  async connect(o: PresenceConnectOptions): Promise<void> {
    this.calls.push("connect");
    this.events = o.events;
    if (this.failConnect) throw new PresenceError(this.failConnect);
    o.events.onConnectionState("connecting");
    if (this.autoConnect) o.events.onConnectionState("connected");
  }
  async disconnect(): Promise<void> {
    this.calls.push("disconnect");
  }
  participantJoined(): void {
    this.calls.push("participantJoined");
  }
  participantLeft(): void {
    this.calls.push("participantLeft");
  }
  heartbeat(): void {
    this.calls.push("heartbeat");
  }
  getPresence(): SessionAttendance {
    return this.snapshot;
  }
  listParticipants(): AttendanceRecord[] {
    return this.snapshot.participants;
  }
  connectionState() {
    return "connected" as const;
  }
  // drivers
  emit(state: "reconnecting" | "connected" | "disconnected") {
    this.events?.onConnectionState(state);
  }
  setSnapshot(participants: AttendanceRecord[], finalized = false) {
    this.snapshot = { sessionId: "s1", participants, finalized };
    this.events?.onPresenceUpdated(this.snapshot);
  }
}

function renderPresence(fake: FakePresenceProvider) {
  return render(
    <PresenceProviderContext.Provider value={() => fake}>
      <SessionPresence sessionId="s1" participantId="me" participantName="Me" role="student" />
    </PresenceProviderContext.Provider>
  );
}

async function open(fake: FakePresenceProvider) {
  renderPresence(fake);
  await userEvent.click(await screen.findByRole("button", { name: /Participants/ }));
}

describe("Session presence — Journey 5 attendance (Sprint 8.8)", () => {
  it("connects and announces the join through the injected provider", async () => {
    const fake = new FakePresenceProvider();
    renderPresence(fake);
    await screen.findByRole("button", { name: /Participants/ });
    expect(fake.calls).toContain("connect");
    expect(fake.calls).toContain("participantJoined");
  });

  it("a join updates the present count in the UI", async () => {
    const fake = new FakePresenceProvider();
    renderPresence(fake);
    await screen.findByRole("button", { name: /Participants/ });
    expect(screen.getByTestId("present-count")).toHaveTextContent("1");
    act(() => fake.setSnapshot([rec(), rec({ participantId: "p2", participantName: "Sarah", role: "instructor" })]));
    await waitFor(() => expect(screen.getByTestId("present-count")).toHaveTextContent("2"));
  });

  it("a leave updates the present count", async () => {
    const fake = new FakePresenceProvider();
    fake.snapshot = { sessionId: "s1", participants: [rec(), rec({ participantId: "p2", participantName: "Sarah" })], finalized: false };
    renderPresence(fake);
    await waitFor(() => expect(screen.getByTestId("present-count")).toHaveTextContent("2"));
    act(() => fake.setSnapshot([rec(), rec({ participantId: "p2", participantName: "Sarah", currentlyPresent: false, leftAt: "x", attendanceStatus: "left_early" })]));
    await waitFor(() => expect(screen.getByTestId("present-count")).toHaveTextContent("1"));
  });

  it("shows the presence timer and updates it on presence updates", async () => {
    const fake = new FakePresenceProvider();
    await open(fake);
    expect(screen.getByTestId("presence-timer-me")).toHaveTextContent("0:00");
    act(() => fake.setSnapshot([rec({ totalPresenceDuration: 5 })]));
    await waitFor(() => expect(screen.getByTestId("presence-timer-me")).toHaveTextContent("0:05"));
  });

  it("shows a Late badge for a late joiner", async () => {
    const fake = new FakePresenceProvider();
    fake.snapshot = { sessionId: "s1", participants: [rec({ attendanceStatus: "late" })], finalized: false };
    await open(fake);
    expect(within(screen.getByLabelText("Participants")).getByText("Late")).toBeInTheDocument();
  });

  it("shows a Left early badge for an early leaver", async () => {
    const fake = new FakePresenceProvider();
    fake.snapshot = {
      sessionId: "s1",
      participants: [rec({ currentlyPresent: false, leftAt: "x", attendanceStatus: "left_early" })],
      finalized: false,
    };
    await open(fake);
    expect(within(screen.getByLabelText("Participants")).getByText("Left early")).toBeInTheDocument();
  });

  it("keeps one accumulating record across a reconnect", async () => {
    const fake = new FakePresenceProvider();
    fake.snapshot = { sessionId: "s1", participants: [rec({ totalPresenceDuration: 60 })], finalized: false };
    await open(fake);
    expect(screen.getByTestId("presence-timer-me")).toHaveTextContent("1:00");
    act(() => fake.emit("reconnecting"));
    act(() => fake.emit("connected"));
    // Same participant, accumulated further — not reset, not duplicated.
    act(() => fake.setSnapshot([rec({ totalPresenceDuration: 140 })]));
    await waitFor(() => expect(screen.getByTestId("presence-timer-me")).toHaveTextContent("2:20"));
    expect(within(screen.getByLabelText("Participants")).getAllByText(/Me/).length).toBe(1);
  });

  it("renders an attendance summary", async () => {
    const fake = new FakePresenceProvider();
    fake.snapshot = {
      sessionId: "s1",
      participants: [
        rec(),
        rec({ participantId: "p2", participantName: "Late One", attendanceStatus: "late" }),
        rec({ participantId: "p3", participantName: "Gone", currentlyPresent: false, attendanceStatus: "left_early" }),
      ],
      finalized: false,
    };
    await open(fake);
    const summary = screen.getByLabelText("Attendance summary");
    expect(within(summary).getByText("Present")).toBeInTheDocument();
    expect(within(summary).getByText("Late")).toBeInTheDocument();
    expect(within(summary).getByText("Left early")).toBeInTheDocument();
    expect(within(summary).getByText("Live")).toBeInTheDocument();
  });

  it("shows a reconnecting indicator", async () => {
    const fake = new FakePresenceProvider();
    renderPresence(fake);
    await screen.findByRole("button", { name: /Participants/ });
    act(() => fake.emit("reconnecting"));
    expect(await screen.findByText(/reconnecting/i)).toBeInTheDocument();
  });

  it("announces leave + disconnect on unmount (leaving updates presence)", async () => {
    const fake = new FakePresenceProvider();
    const { unmount } = renderPresence(fake);
    await screen.findByRole("button", { name: /Participants/ });
    unmount();
    expect(fake.calls).toContain("participantLeft");
    expect(fake.calls).toContain("disconnect");
  });

  it("drives presence exclusively through the injected provider", async () => {
    const fake = new FakePresenceProvider();
    const { unmount } = renderPresence(fake);
    await screen.findByRole("button", { name: /Participants/ });
    unmount();
    const allowed = /^(connect|disconnect|participantJoined|participantLeft|heartbeat)$/;
    expect(fake.calls.every((c) => allowed.test(c))).toBe(true);
  });
});
