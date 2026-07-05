// Stub video-room provider — SIMULATION ONLY.
//
// This is the default adapter for dev/preview. It performs NO real signaling and
// loads NO SDK. It simulates the connection lifecycle and a single remote peer
// so the room UI is exercisable end-to-end. A real adapter (Agora/Daily/LiveKit)
// implements the same `VideoRoomProvider` port and replaces this with zero UI
// changes. It optionally shows a real local camera preview when the browser
// grants it, but never fails the join if media is unavailable (e.g. jsdom).
import type {
  ConnectionState,
  JoinOptions,
  RemoteParticipant,
  VideoRoomEvents,
  VideoRoomProvider,
} from "./types";
import { VideoRoomError } from "./types";

const CONNECT_DELAY_MS = 350;
const REMOTE_DELAY_MS = 650;

export class StubVideoRoomProvider implements VideoRoomProvider {
  private state: ConnectionState = "idle";
  private events: VideoRoomEvents | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private remotes: RemoteParticipant[] = [];
  private localStream: MediaStream | null = null;
  private localEl: HTMLElement | null = null;
  private cameraOn = true;
  private micOn = true;
  private sharing = false;
  private shareStream: MediaStream | null = null;
  private sharedEl: HTMLElement | null = null;
  // Dev fallback: when the browser lacks getDisplayMedia, simulate a share
  // rather than erroring (a real adapter never needs this).
  private simulate = true;

  async join(opts: JoinOptions): Promise<void> {
    this.events = opts.events;
    this.cameraOn = opts.cameraOn;
    this.micOn = opts.micOn;
    this.setState("connecting");

    // Best-effort local preview; never fatal (guarded for jsdom / no-permission).
    void this.acquireLocalPreview();

    this.timers.push(
      setTimeout(() => {
        this.setState("connected");
        // Simulate the peer arriving shortly after we connect.
        this.timers.push(
          setTimeout(() => {
            this.remotes = [{ id: "peer-1", name: "Participant", cameraOn: true, micOn: true }];
            this.events?.onParticipantsChanged([...this.remotes]);
          }, REMOTE_DELAY_MS)
        );
      }, CONNECT_DELAY_MS)
    );
  }

  private async acquireLocalPreview(): Promise<void> {
    try {
      const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
      if (!md?.getUserMedia) return; // no media layer (e.g. tests) — simulate silently
      this.localStream = await md.getUserMedia({ video: true, audio: true });
      this.renderLocal();
    } catch (err) {
      // Denied/unavailable devices are non-fatal — stay connected, surface a hint.
      const code =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "camera_denied"
          : "device_unavailable";
      this.events?.onError(new VideoRoomError(code));
    }
  }

  private renderLocal(): void {
    if (!this.localEl || !this.localStream) return;
    const existing = this.localEl.querySelector("video");
    const video = existing ?? document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    (video as HTMLVideoElement).playsInline = true;
    video.srcObject = this.cameraOn ? this.localStream : null;
    video.className = "h-full w-full object-cover";
    if (!existing) this.localEl.appendChild(video);
  }

  async leave(): Promise<void> {
    this.clearTimers();
    // Leaving must always stop an in-progress share (business rule).
    this.teardownShare();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.remotes = [];
    this.setState("disconnected");
    this.events = null;
  }

  // ── screen sharing ─────────────────────────────────────────────────────────
  async startScreenShare(): Promise<void> {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (md?.getDisplayMedia) {
      try {
        this.shareStream = await md.getDisplayMedia({ video: true });
        // Stop when the user ends the share from the browser's own UI.
        this.shareStream.getVideoTracks()[0]?.addEventListener("ended", () => void this.stopScreenShare());
      } catch (err) {
        // Denied/cancelled is NON-FATAL — the call keeps running.
        const code =
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "screen_share_denied"
            : "screen_share_cancelled";
        this.events?.onError(new VideoRoomError(code));
        return;
      }
    } else if (typeof navigator !== "undefined" && !md?.getDisplayMedia && !this.simulate) {
      this.events?.onError(new VideoRoomError("screen_share_unsupported"));
      return;
    }
    // Only one active share at a time — starting replaces the previous.
    this.sharing = true;
    this.renderShared();
    this.events?.onScreenShareChanged({
      active: true,
      sharer: "local",
      participantId: null,
      participantName: null,
    });
  }

  async stopScreenShare(): Promise<void> {
    if (!this.sharing) return;
    this.teardownShare();
    this.events?.onScreenShareChanged({
      active: false,
      sharer: null,
      participantId: null,
      participantName: null,
    });
  }

  isScreenSharing(): boolean {
    return this.sharing;
  }

  attachSharedScreen(el: HTMLElement | null): void {
    this.sharedEl = el;
    this.renderShared();
  }

  attachRemoteScreen(): void {
    // No remote share stream in the stub; a real adapter plays the subscribed
    // remote screen track here.
  }

  private teardownShare(): void {
    this.shareStream?.getTracks().forEach((t) => t.stop());
    this.shareStream = null;
    this.sharing = false;
  }

  private renderShared(): void {
    if (!this.sharedEl || !this.shareStream) return;
    const existing = this.sharedEl.querySelector("video");
    const video = existing ?? document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    (video as HTMLVideoElement).playsInline = true;
    video.srcObject = this.shareStream;
    video.className = "h-full w-full object-contain";
    if (!existing) this.sharedEl.appendChild(video);
  }

  async setCameraEnabled(on: boolean): Promise<void> {
    this.cameraOn = on;
    this.localStream?.getVideoTracks().forEach((t) => (t.enabled = on));
    this.renderLocal();
    this.events?.onLocalMediaChanged({ cameraOn: this.cameraOn, micOn: this.micOn });
  }

  async setMicrophoneEnabled(on: boolean): Promise<void> {
    this.micOn = on;
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = on));
    this.events?.onLocalMediaChanged({ cameraOn: this.cameraOn, micOn: this.micOn });
  }

  attachLocalVideo(el: HTMLElement | null): void {
    this.localEl = el;
    this.renderLocal();
  }

  attachRemoteVideo(): void {
    // Stub has no real remote media stream to attach; the UI shows an avatar
    // placeholder. A real adapter plays the subscribed remote track here.
  }

  getConnectionState(): ConnectionState {
    return this.state;
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.events?.onConnectionState(state);
  }

  private clearTimers(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}

export const createStubVideoRoomProvider = (): VideoRoomProvider => new StubVideoRoomProvider();
