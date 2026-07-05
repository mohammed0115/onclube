import { describe, it, expect, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthProvider";
import { tokenStore } from "@/api";
import { server } from "./server";
import { http, HttpResponse } from "msw";
import { VideoRoom } from "@/components/session/VideoRoom";
import { WaitingRoomPage } from "@/pages/student/WaitingRoomPage";
import {
  VideoRoomProviderContext,
  mapRoomCredential,
  VideoRoomError,
} from "@/lib/video";
import type {
  JoinOptions,
  RoomCredential,
  VideoRoomErrorCode,
  VideoRoomEvents,
  VideoRoomProvider,
} from "@/lib/video";

// A fully controllable fake adapter — the UI must drive the room purely through
// this port (proves the provider abstraction + injection).
class FakeProvider implements VideoRoomProvider {
  calls: string[] = [];
  joinCount = 0;
  lastJoin: JoinOptions | null = null;
  failWith: VideoRoomErrorCode | null = null;
  autoConnect = true;
  remoteName: string | null = "Sarah Mitchell";
  private events: VideoRoomEvents | null = null;

  async join(o: JoinOptions): Promise<void> {
    this.calls.push("join");
    this.joinCount += 1;
    this.lastJoin = o;
    this.events = o.events;
    if (this.failWith) throw new VideoRoomError(this.failWith);
    o.events.onConnectionState("connecting");
    if (this.autoConnect) {
      o.events.onConnectionState("connected");
      if (this.remoteName) {
        o.events.onParticipantsChanged([{ id: "r1", name: this.remoteName, cameraOn: true, micOn: true }]);
      }
    }
  }
  async leave(): Promise<void> {
    this.calls.push("leave");
    if (this.sharing) {
      this.sharing = false;
      this.calls.push("stopScreenShare(on-leave)");
    }
    this.events?.onConnectionState("disconnected");
  }
  async setCameraEnabled(on: boolean): Promise<void> {
    this.calls.push(`cam:${on}`);
    this.events?.onLocalMediaChanged({ cameraOn: on, micOn: true });
  }
  async setMicrophoneEnabled(on: boolean): Promise<void> {
    this.calls.push(`mic:${on}`);
    this.events?.onLocalMediaChanged({ cameraOn: true, micOn: on });
  }
  attachLocalVideo(): void {}
  attachRemoteVideo(): void {}
  getConnectionState() {
    return "connected" as const;
  }

  // ── screen share ──
  sharing = false;
  failShareWith: VideoRoomErrorCode | null = null;
  async startScreenShare(): Promise<void> {
    this.calls.push("startScreenShare");
    if (this.failShareWith) {
      this.events?.onError(new VideoRoomError(this.failShareWith));
      return;
    }
    this.sharing = true;
    this.events?.onScreenShareChanged({ active: true, sharer: "local", participantId: null, participantName: null });
  }
  async stopScreenShare(): Promise<void> {
    this.calls.push("stopScreenShare");
    this.sharing = false;
    this.events?.onScreenShareChanged({ active: false, sharer: null, participantId: null, participantName: null });
  }
  isScreenSharing() {
    return this.sharing;
  }
  attachSharedScreen(): void {}
  attachRemoteScreen(): void {}

  // test drivers
  emit(state: "reconnecting" | "connected" | "disconnected") {
    this.events?.onConnectionState(state);
  }
  emitError(code: VideoRoomErrorCode) {
    this.events?.onError(new VideoRoomError(code));
  }
  emitRemoteShare(name: string, id = "r1") {
    this.events?.onScreenShareChanged({ active: true, sharer: "remote", participantId: id, participantName: name });
  }
  emitRemoteShareStopped() {
    this.events?.onScreenShareChanged({ active: false, sharer: null, participantId: null, participantName: null });
  }
}

const CRED: RoomCredential = {
  sessionId: "s1",
  provider: "stub",
  appId: "app-1",
  channel: "session-s1",
  token: "t-1",
  uid: "u1",
  expiresAt: null,
};

function renderRoom(fake: FakeProvider, props?: Partial<Parameters<typeof VideoRoom>[0]>) {
  const onLeave = props?.onLeave ?? vi.fn();
  const result = render(
    <VideoRoomProviderContext.Provider value={() => fake}>
      <MemoryRouter>
        <VideoRoom credential={CRED} displayName="Nadia Ali" topicTitle="Job Interview Practice" onLeave={onLeave} {...props} />
      </MemoryRouter>
    </VideoRoomProviderContext.Provider>
  );
  return { onLeave, ...result };
}

describe("Video room — Journey 5 conference core", () => {
  it("maps the wire DTO to a provider-neutral credential (no provider leakage in shape)", () => {
    const cred = mapRoomCredential({
      sessionId: "s1", provider: "stub", agoraAppId: "a", channel: "c",
      agoraToken: "t", uid: "u1", expiresAt: null,
    });
    expect(cred).toEqual({ sessionId: "s1", provider: "stub", appId: "a", channel: "c", token: "t", uid: "u1", expiresAt: null });
    expect(Object.keys(cred).some((k) => k.toLowerCase().includes("agora"))).toBe(false);
  });

  it("joins successfully and shows local + remote participants", async () => {
    const fake = new FakeProvider();
    renderRoom(fake);
    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Nadia Ali (You)")).toBeInTheDocument();
    expect(screen.getByText("Sarah Mitchell")).toBeInTheDocument();
    // The UI drove the provider only through the port.
    expect(fake.calls).toContain("join");
    expect(fake.lastJoin?.credential.channel).toBe("session-s1");
    expect(fake.lastJoin?.displayName).toBe("Nadia Ali");
  });

  it("renders the student's own name when the instructor is the remote peer", async () => {
    const fake = new FakeProvider();
    fake.remoteName = "Sarah Mitchell";
    renderRoom(fake, { displayName: "Nadia Ali" });
    expect(await screen.findByText("Nadia Ali (You)")).toBeInTheDocument();
    expect(screen.getByText("Sarah Mitchell")).toBeInTheDocument();
  });

  it("renders the instructor's own name when the student is the remote peer", async () => {
    const fake = new FakeProvider();
    fake.remoteName = "Nadia Ali";
    renderRoom(fake, { displayName: "Sarah Mitchell" });
    expect(await screen.findByText("Sarah Mitchell (You)")).toBeInTheDocument();
    expect(screen.getByText("Nadia Ali")).toBeInTheDocument();
  });

  it("shows a joining loader until connected", async () => {
    const fake = new FakeProvider();
    fake.autoConnect = false; // stay connecting
    renderRoom(fake);
    expect(await screen.findByText(/Joining the room/i)).toBeInTheDocument();
  });

  it("shows a reconnecting indicator and recovers", async () => {
    const fake = new FakeProvider();
    renderRoom(fake);
    await screen.findByText("Connected");
    act(() => fake.emit("reconnecting"));
    expect(screen.getAllByText(/Reconnecting/i).length).toBeGreaterThan(0);
    act(() => fake.emit("connected"));
    await waitFor(() => expect(screen.queryByText(/Reconnecting…/i)).not.toBeInTheDocument());
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("toggles microphone and camera through the provider port", async () => {
    const fake = new FakeProvider();
    renderRoom(fake);
    await screen.findByText("Connected");
    await userEvent.click(screen.getByRole("button", { name: /Mute microphone/i }));
    await userEvent.click(screen.getByRole("button", { name: /Turn camera off/i }));
    expect(fake.calls).toContain("mic:false");
    expect(fake.calls).toContain("cam:false");
  });

  it("leaves the meeting through the provider and calls onLeave", async () => {
    const fake = new FakeProvider();
    const onLeave = vi.fn();
    renderRoom(fake, { onLeave });
    await screen.findByText("Connected");
    await userEvent.click(screen.getByRole("button", { name: /Leave meeting/i }));
    await waitFor(() => expect(onLeave).toHaveBeenCalled());
    expect(fake.calls).toContain("leave");
  });

  it("shows a friendly, non-blocking hint when the camera is denied", async () => {
    const fake = new FakeProvider();
    renderRoom(fake);
    await screen.findByText("Connected");
    act(() => fake.emitError("camera_denied"));
    expect(await screen.findByText(/couldn’t access your camera/i)).toBeInTheDocument();
    // Non-fatal: still connected, tiles still present.
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Nadia Ali (You)")).toBeInTheDocument();
  });

  it("shows a blocking error when the provider is unavailable, with retry", async () => {
    const fake = new FakeProvider();
    fake.failWith = "provider_unavailable";
    renderRoom(fake);
    expect(await screen.findByText(/Couldn’t join the room/i)).toBeInTheDocument();
    expect(screen.getByText(/video service is temporarily unavailable/i)).toBeInTheDocument();
    // Retry re-joins through the provider.
    fake.failWith = null;
    fake.autoConnect = true;
    await userEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(fake.joinCount).toBeGreaterThanOrEqual(2);
  });

  it("shows a token-expired error and routes the student to leave", async () => {
    const fake = new FakeProvider();
    fake.failWith = "token_expired";
    const onLeave = vi.fn();
    renderRoom(fake, { onLeave });
    expect(await screen.findByText(/session pass expired/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Leave$/i }));
    await waitFor(() => expect(onLeave).toHaveBeenCalled());
  });
});

// End-to-end wiring: the waiting room stays the sole entry point into the room.
describe("Waiting room → video room handoff", () => {
  function renderWaiting(fake: FakeProvider) {
    tokenStore.set({ access: "access-1", refresh: "refresh-1" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <VideoRoomProviderContext.Provider value={() => fake}>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={["/student/session/s1"]}>
            <AuthProvider>
              <Routes>
                <Route path="/student/session/:id" element={<WaitingRoomPage />} />
                <Route path="/student" element={<div>DASHBOARD STUB</div>} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </VideoRoomProviderContext.Provider>
    );
  }

  it("enters the live room only after the gated Join succeeds", async () => {
    const fake = new FakeProvider();
    fake.remoteName = "Sarah Mitchell";
    renderWaiting(fake);
    // Waiting room first.
    await screen.findByRole("button", { name: /Join session/i });
    await userEvent.click(screen.getByRole("button", { name: /Join session/i }));
    // Then the live room, driven by the injected provider.
    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(fake.calls).toContain("join");
    expect(fake.lastJoin?.credential.channel).toBe("session-s1");
  });

  it("does not enter the room if the server rejects the join", async () => {
    server.use(
      http.post("*/api/v1/sessions/:id/join/", () =>
        HttpResponse.json({ code: "session_not_joinable", detail: "closed" }, { status: 409 })
      )
    );
    const fake = new FakeProvider();
    renderWaiting(fake);
    await userEvent.click(await screen.findByRole("button", { name: /Join session/i }));
    expect(await screen.findByText(/Couldn’t join right now/i)).toBeInTheDocument();
    // Never handed off to the provider.
    expect(fake.calls).not.toContain("join");
  });
});

describe("Video room — screen sharing (Sprint 8.2)", () => {
  async function joined(fake: FakeProvider, props?: Parameters<typeof renderRoom>[1]) {
    const r = renderRoom(fake, props);
    await screen.findByText("Connected");
    return r;
  }

  it("starts a screen share and shows the local sharing banner + stop control", async () => {
    const fake = new FakeProvider();
    await joined(fake);
    await userEvent.click(screen.getByRole("button", { name: /Share your screen/i }));
    expect(await screen.findByText(/You are sharing your screen/i)).toBeInTheDocument();
    expect(fake.calls).toContain("startScreenShare");
    expect(screen.getByRole("button", { name: /Stop sharing your screen/i })).toBeInTheDocument();
  });

  it("stops sharing and returns to the camera layout", async () => {
    const fake = new FakeProvider();
    await joined(fake);
    await userEvent.click(screen.getByRole("button", { name: /Share your screen/i }));
    await screen.findByText(/You are sharing your screen/i);
    await userEvent.click(screen.getByRole("button", { name: /Stop sharing your screen/i }));
    await waitFor(() => expect(screen.queryByText(/You are sharing your screen/i)).not.toBeInTheDocument());
    expect(fake.calls).toContain("stopScreenShare");
    // Camera layout is back (share button available again).
    expect(screen.getByRole("button", { name: /Share your screen/i })).toBeInTheDocument();
  });

  it("shows a remote participant's shared screen", async () => {
    const fake = new FakeProvider();
    await joined(fake);
    act(() => fake.emitRemoteShare("Sarah Mitchell"));
    expect(await screen.findByText(/Sarah Mitchell is sharing/i)).toBeInTheDocument();
    act(() => fake.emitRemoteShareStopped());
    await waitFor(() => expect(screen.queryByText(/Sarah Mitchell is sharing/i)).not.toBeInTheDocument());
  });

  it("keeps the call connected when screen-share permission is denied", async () => {
    const fake = new FakeProvider();
    fake.failShareWith = "screen_share_denied";
    await joined(fake);
    await userEvent.click(screen.getByRole("button", { name: /Share your screen/i }));
    expect(await screen.findByText(/Screen sharing was blocked/i)).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.queryByText(/You are sharing your screen/i)).not.toBeInTheDocument();
  });

  it("shows a friendly message when the browser doesn't support screen sharing", async () => {
    const fake = new FakeProvider();
    fake.failShareWith = "screen_share_unsupported";
    await joined(fake);
    await userEvent.click(screen.getByRole("button", { name: /Share your screen/i }));
    expect(await screen.findByText(/doesn’t support screen sharing/i)).toBeInTheDocument();
  });

  it("survives a network interruption during a share without ending the meeting", async () => {
    const fake = new FakeProvider();
    await joined(fake);
    await userEvent.click(screen.getByRole("button", { name: /Share your screen/i }));
    await screen.findByText(/You are sharing your screen/i);
    act(() => fake.emit("reconnecting"));
    expect(screen.getAllByText(/Reconnecting/i).length).toBeGreaterThan(0);
    act(() => fake.emit("connected"));
    await waitFor(() => expect(screen.queryByText(/Reconnecting…/i)).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Leave meeting/i })).toBeInTheDocument();
  });

  it("stops sharing when the user leaves the meeting", async () => {
    const fake = new FakeProvider();
    const onLeave = vi.fn();
    await joined(fake, { onLeave });
    await userEvent.click(screen.getByRole("button", { name: /Share your screen/i }));
    await screen.findByText(/You are sharing your screen/i);
    await userEvent.click(screen.getByRole("button", { name: /Leave meeting/i }));
    await waitFor(() => expect(onLeave).toHaveBeenCalled());
    expect(fake.calls).toContain("stopScreenShare(on-leave)");
  });

  it("stops sharing when the room unmounts (session end)", async () => {
    const fake = new FakeProvider();
    const { unmount } = await joined(fake);
    await userEvent.click(screen.getByRole("button", { name: /Share your screen/i }));
    await screen.findByText(/You are sharing your screen/i);
    unmount();
    expect(fake.calls).toContain("leave");
    expect(fake.calls).toContain("stopScreenShare(on-leave)");
  });

  it("drives screen sharing exclusively through the injected provider (component stays pure)", async () => {
    const fake = new FakeProvider();
    await joined(fake);
    await userEvent.click(screen.getByRole("button", { name: /Share your screen/i }));
    await screen.findByText(/You are sharing your screen/i);
    await userEvent.click(screen.getByRole("button", { name: /Stop sharing your screen/i }));
    // Every recorded interaction is a known port operation — no side channel.
    const allowed = /^(join|leave|cam:|mic:|startScreenShare|stopScreenShare)/;
    expect(fake.calls.every((c) => allowed.test(c))).toBe(true);
    expect(fake.calls).toEqual(expect.arrayContaining(["startScreenShare", "stopScreenShare"]));
  });
});
