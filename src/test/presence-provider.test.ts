// Unit tests for the default presence adapter (StubPresenceProvider). Exercises
// the accumulation engine directly with fake timers: join/heartbeat/leave, and
// reconnect merging into one record, plus idempotency.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { StubPresenceProvider } from "@/lib/presence";
import type { PresenceEvents } from "@/lib/presence";

const noopEvents: PresenceEvents = {
  onConnectionState: () => {},
  onParticipantJoined: () => {},
  onParticipantLeft: () => {},
  onHeartbeat: () => {},
  onPresenceUpdated: () => {},
};

async function connected() {
  const p = new StubPresenceProvider();
  await p.connect({ sessionId: "s1", identity: { participantId: "me", participantName: "Me", role: "student" }, events: noopEvents });
  return p;
}

function self(p: StubPresenceProvider) {
  return p.getPresence().participants.find((x) => x.participantId === "me")!;
}

describe("StubPresenceProvider — accumulation engine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T10:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("accumulates presence on heartbeat while present", async () => {
    const p = await connected();
    p.participantJoined();
    vi.advanceTimersByTime(5000);
    p.heartbeat();
    expect(self(p).totalPresenceDuration).toBe(5);
    expect(self(p).currentlyPresent).toBe(true);
  });

  it("merges reconnects into one record and accumulates across them", async () => {
    const p = await connected();
    p.participantJoined();
    vi.advanceTimersByTime(60_000);
    p.participantLeft(); // +60
    const firstJoin = self(p).joinedAt;
    vi.advanceTimersByTime(60_000);
    p.participantJoined(); // rejoin — same record
    vi.advanceTimersByTime(80_000);
    p.participantLeft(); // +80
    const r = self(p);
    expect(r.totalPresenceDuration).toBe(140);
    expect(r.joinedAt).toBe(firstJoin); // first join preserved
    expect(p.getPresence().participants).toHaveLength(1); // one record only
    expect(r.attendanceStatus).toBe("left_early");
  });

  it("join and leave are idempotent", async () => {
    const p = await connected();
    p.participantJoined();
    const joinedAt = self(p).joinedAt;
    vi.advanceTimersByTime(5000);
    p.participantJoined(); // no-op
    expect(self(p).joinedAt).toBe(joinedAt);
    vi.advanceTimersByTime(10_000);
    p.participantLeft(); // +15
    p.participantLeft(); // no-op
    expect(self(p).totalPresenceDuration).toBe(15);
    expect(self(p).currentlyPresent).toBe(false);
  });
});
