import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthProvider";
import { tokenStore } from "@/api";
import { server } from "./server";
import { WaitingRoomPage } from "@/pages/student/WaitingRoomPage";
import { VideoRoomProviderContext } from "@/lib/video";
import type { JoinOptions, VideoRoomProvider } from "@/lib/video";

const B = "*/api/v1";

// Deterministic provider so the post-join room renders without real timers/media.
class RoomFake implements VideoRoomProvider {
  async join(o: JoinOptions) {
    o.events.onConnectionState("connected");
  }
  async leave() {}
  async setCameraEnabled() {}
  async setMicrophoneEnabled() {}
  attachLocalVideo() {}
  attachRemoteVideo() {}
  getConnectionState() {
    return "connected" as const;
  }
  async startScreenShare() {}
  async stopScreenShare() {}
  isScreenSharing() {
    return false;
  }
  attachSharedScreen() {}
  attachRemoteScreen() {}
}

function renderRoom(route = "/student/session/s1") {
  tokenStore.set({ access: "access-1", refresh: "refresh-1" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <VideoRoomProviderContext.Provider value={() => new RoomFake()}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>
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

describe("Waiting room — Journey 5 foundation", () => {
  beforeEach(() => tokenStore.set({ access: "access-1", refresh: "refresh-1" }));

  it("shows session info, instructor, duration and the waiting badge", async () => {
    renderRoom();
    expect(await screen.findByRole("heading", { name: "Job Interview Practice" })).toBeInTheDocument();
    expect(screen.getByText(/Sarah Mitchell/)).toBeInTheDocument();
    expect(screen.getByText("30 min")).toBeInTheDocument();
    expect(screen.getByText("Waiting room")).toBeInTheDocument();
    // Device-check placeholders are visible but marked as coming soon.
    expect(screen.getByLabelText(/Device check/i)).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it("enables Join when the window is open, then hands off into the live room", async () => {
    let joined = false;
    server.use(
      http.post(`${B}/sessions/:id/join/`, ({ params }) => {
        joined = true;
        return HttpResponse.json({
          sessionId: params.id, provider: "stub", agoraAppId: "a", channel: "c",
          agoraToken: "t", uid: "u1", expiresAt: null,
        });
      })
    );
    renderRoom();
    const joinBtn = await screen.findByRole("button", { name: /Join session/i });
    expect(joinBtn).toBeEnabled();
    await userEvent.click(joinBtn);
    await waitFor(() => expect(joined).toBe(true));
    // The live room is now mounted (its controls replace the waiting-room UI).
    expect(await screen.findByRole("button", { name: /Leave meeting/i })).toBeInTheDocument();
  });

  it("navigates back to the dashboard when leaving the room", async () => {
    renderRoom();
    await userEvent.click(await screen.findByRole("button", { name: /Join session/i }));
    await userEvent.click(await screen.findByRole("button", { name: /Leave meeting/i }));
    expect(await screen.findByText("DASHBOARD STUB")).toBeInTheDocument();
  });

  it("disables Join and shows the missed message when the window has expired", async () => {
    server.use(
      http.get(`${B}/sessions/:id/waiting-room/`, ({ params }) =>
        HttpResponse.json({
          sessionId: params.id, bookingId: "b1", topicTitle: "Job Interview Practice",
          instructorName: "Sarah Mitchell", scheduledAt: "2026-06-30T18:00:00Z", durationMinutes: 30,
          phase: "expired", canJoin: false,
          joinOpensAt: "2026-06-30T17:45:00Z", joinClosesAt: "2026-06-30T18:45:00Z", viewerRole: "student",
        })
      )
    );
    renderRoom();
    expect(await screen.findByText(/Missed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Join session/i })).toBeDisabled();
    expect(screen.getByText(/join window has closed/i)).toBeInTheDocument();
  });

  it("lets an admin view but not join", async () => {
    server.use(
      http.get(`${B}/sessions/:id/waiting-room/`, ({ params }) =>
        HttpResponse.json({
          sessionId: params.id, bookingId: "b1", topicTitle: "Job Interview Practice",
          instructorName: "Sarah Mitchell", scheduledAt: "2026-06-30T18:00:00Z", durationMinutes: 30,
          phase: "waiting", canJoin: false,
          joinOpensAt: "2026-06-30T17:45:00Z", joinClosesAt: "2026-06-30T18:45:00Z", viewerRole: "admin",
        })
      )
    );
    renderRoom();
    expect(await screen.findByText(/Admins can view this room but cannot join/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Join session/i })).toBeDisabled();
  });

  it("shows a loading state, then an error state with retry", async () => {
    server.use(
      http.get(`${B}/sessions/:id/waiting-room/`, () =>
        HttpResponse.json({ code: "error", detail: "boom" }, { status: 500 })
      )
    );
    renderRoom();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
  });
});
