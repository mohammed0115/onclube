// Production video-room provider — Agora Web SDK (agora-rtc-sdk-ng).
//
// Implements the UNCHANGED VideoRoomProvider port. The SDK is imported LAZILY via
// a runtime specifier so it stays optional: if it can't load (jsdom/tests, or the
// package isn't installed) the adapter transparently uses the stub media engine so
// a session NEVER fails to start. No SDK object leaks past this module.
//
// The server mints the Agora token for a NUMERIC uid (crc32 of the identity) and
// returns that uid on the credential — we join with exactly that uid or the token
// is rejected. The public app id + channel + short-lived token also come from the
// server; the app never mints credentials.
import { StubVideoRoomProvider } from "./stubProvider";
import {
  VideoRoomError,
  type ConnectionState,
  type JoinOptions,
  type RemoteParticipant,
  type VideoRoomEvents,
  type VideoRoomProvider,
} from "./types";

const AGORA_SDK = "agora-rtc-sdk-ng"; // runtime specifier — not resolved at build time

// The SDK is loaded dynamically and typed loosely (its TS types aren't pulled into
// the build graph); we only depend on the small, stable v4 surface used below.
/* eslint-disable @typescript-eslint/no-explicit-any */

function mapConnectionState(s: string): ConnectionState {
  switch (s) {
    case "CONNECTING":
      return "connecting";
    case "CONNECTED":
      return "connected";
    case "RECONNECTING":
      return "reconnecting";
    case "DISCONNECTING":
    case "DISCONNECTED":
      return "disconnected";
    default:
      return "idle";
  }
}

/** The real Agora engine. Constructed only once the SDK module has loaded. */
class AgoraEngine implements VideoRoomProvider {
  private client: any;
  private mic: any = null;
  private cam: any = null;
  private screen: any = null;
  private readonly remotes = new Map<string, any>();
  private readonly remoteEls = new Map<string, HTMLElement>();
  private localEl: HTMLElement | null = null;
  private sharedEl: HTMLElement | null = null;
  private events!: VideoRoomEvents;
  private state: ConnectionState = "idle";
  private cameraOn = true;
  private micOn = true;
  private sharing = false;

  constructor(private readonly AgoraRTC: any) {}

  private setState(s: ConnectionState) {
    this.state = s;
    this.events?.onConnectionState(s);
  }

  private emitParticipants() {
    const list: RemoteParticipant[] = [...this.remotes.values()].map((u) => ({
      id: String(u.uid),
      name: "Participant",
      cameraOn: !!u.videoTrack,
      micOn: !!u.audioTrack,
    }));
    this.events.onParticipantsChanged(list);
  }

  private wireClientEvents() {
    this.client.on("connection-state-change", (cur: string) => this.setState(mapConnectionState(cur)));
    this.client.on("user-joined", (user: any) => {
      this.remotes.set(String(user.uid), user);
      this.emitParticipants();
    });
    this.client.on("user-left", (user: any) => {
      this.remotes.delete(String(user.uid));
      this.remoteEls.delete(String(user.uid));
      this.emitParticipants();
    });
    this.client.on("user-published", async (user: any, mediaType: string) => {
      try {
        await this.client.subscribe(user, mediaType);
      } catch {
        return;
      }
      this.remotes.set(String(user.uid), user);
      if (mediaType === "audio") user.audioTrack?.play();
      if (mediaType === "video") {
        const el = this.remoteEls.get(String(user.uid));
        if (el) user.videoTrack?.play(el);
      }
      this.emitParticipants();
    });
    this.client.on("user-unpublished", (user: any) => {
      this.remotes.set(String(user.uid), user);
      this.emitParticipants();
    });
  }

  async join(opts: JoinOptions): Promise<void> {
    this.events = opts.events;
    this.cameraOn = opts.cameraOn;
    this.micOn = opts.micOn;
    const { appId, channel, token, uid } = opts.credential;
    try {
      this.AgoraRTC.setLogLevel?.(2); // warnings+ only
      this.client = this.AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      this.wireClientEvents();
      this.setState("connecting");
      const numericUid = Number(uid);
      await this.client.join(appId, channel, token || null, Number.isFinite(numericUid) ? numericUid : null);

      [this.mic, this.cam] = await this.AgoraRTC.createMicrophoneAndCameraTracks();
      await this.mic.setEnabled(this.micOn);
      await this.cam.setEnabled(this.cameraOn);
      if (this.localEl) this.cam.play(this.localEl);
      await this.client.publish([this.mic, this.cam]);

      this.setState("connected");
      this.events.onLocalMediaChanged({ cameraOn: this.cameraOn, micOn: this.micOn });
    } catch (err: any) {
      this.setState("failed");
      const name = String(err?.code || err?.name || "");
      const code =
        /PERMISSION|NOT_ALLOWED|DENIED/i.test(name)
          ? "camera_denied"
          : /TIMEOUT/i.test(name)
            ? "join_timeout"
            : /TOKEN/i.test(name)
              ? "token_expired"
              : "provider_unavailable";
      this.events.onError(new VideoRoomError(code as any, err?.message));
      throw err;
    }
  }

  async leave(): Promise<void> {
    try {
      this.cam?.stop();
      this.cam?.close();
      this.mic?.stop();
      this.mic?.close();
      this.screen?.stop();
      this.screen?.close();
      await this.client?.leave();
    } catch {
      /* leaving must never throw */
    }
    this.remotes.clear();
    this.remoteEls.clear();
    this.setState("disconnected");
  }

  async setCameraEnabled(on: boolean): Promise<void> {
    this.cameraOn = on;
    if (this.cam) await this.cam.setEnabled(on);
    this.events?.onLocalMediaChanged({ cameraOn: on, micOn: this.micOn });
  }

  async setMicrophoneEnabled(on: boolean): Promise<void> {
    this.micOn = on;
    if (this.mic) await this.mic.setEnabled(on);
    this.events?.onLocalMediaChanged({ cameraOn: this.cameraOn, micOn: on });
  }

  attachLocalVideo(el: HTMLElement | null): void {
    this.localEl = el;
    if (el && this.cam) this.cam.play(el);
  }

  attachRemoteVideo(participantId: string, el: HTMLElement | null): void {
    if (el) this.remoteEls.set(participantId, el);
    else this.remoteEls.delete(participantId);
    const user = this.remotes.get(participantId);
    if (el && user?.videoTrack) user.videoTrack.play(el);
  }

  getConnectionState(): ConnectionState {
    return this.state;
  }

  async startScreenShare(): Promise<void> {
    try {
      this.screen = await this.AgoraRTC.createScreenVideoTrack({}, "disable");
    } catch (err: any) {
      const name = String(err?.code || err?.name || "");
      const code = /CANCEL|NotAllowed|Permission/i.test(name) ? "screen_share_cancelled" : "screen_share_denied";
      this.events.onError(new VideoRoomError(code as any, err?.message));
      this.screen = null;
      return; // never drop the call on a share failure
    }
    try {
      if (this.cam) await this.client.unpublish([this.cam]);
      await this.client.publish([this.screen]);
    } catch {
      /* keep going; presentation still shows locally */
    }
    this.sharing = true;
    if (this.sharedEl) this.screen.play(this.sharedEl);
    this.screen.on?.("track-ended", () => void this.stopScreenShare());
    this.events.onScreenShareChanged({ active: true, sharer: "local", participantId: null, participantName: null });
  }

  async stopScreenShare(): Promise<void> {
    if (this.screen) {
      try {
        await this.client.unpublish([this.screen]);
      } catch {
        /* ignore */
      }
      this.screen.stop();
      this.screen.close();
      this.screen = null;
    }
    if (this.cam) {
      try {
        await this.client.publish([this.cam]);
      } catch {
        /* ignore */
      }
    }
    this.sharing = false;
    this.events.onScreenShareChanged({ active: false, sharer: null, participantId: null, participantName: null });
  }

  isScreenSharing(): boolean {
    return this.sharing;
  }

  attachSharedScreen(el: HTMLElement | null): void {
    this.sharedEl = el;
    if (el && this.screen) this.screen.play(el);
  }

  attachRemoteScreen(participantId: string, el: HTMLElement | null): void {
    // Remote screen shares arrive as that peer's video track (rtc mode); reuse the
    // remote-video attach path so the presentation surface still renders.
    this.attachRemoteVideo(participantId, el);
  }
}

/**
 * Public adapter. Lazily loads the SDK on join; if it isn't available the stub
 * engine takes over so the call always starts (dev/tests, or SDK not installed).
 */
export class AgoraVideoRoomProvider implements VideoRoomProvider {
  private impl: VideoRoomProvider = new StubVideoRoomProvider();

  constructor(private appId: string) {}

  async join(opts: JoinOptions): Promise<void> {
    try {
      const mod: any = await import(/* @vite-ignore */ AGORA_SDK);
      const AgoraRTC = mod?.default ?? mod;
      if (AgoraRTC?.createClient) this.impl = new AgoraEngine(AgoraRTC);
    } catch {
      /* SDK unavailable → keep the stub engine */
    }
    return this.impl.join(opts);
  }

  async leave() {
    return this.impl.leave();
  }
  async setCameraEnabled(on: boolean) {
    return this.impl.setCameraEnabled(on);
  }
  async setMicrophoneEnabled(on: boolean) {
    return this.impl.setMicrophoneEnabled(on);
  }
  attachLocalVideo(el: HTMLElement | null) {
    this.impl.attachLocalVideo(el);
  }
  attachRemoteVideo(participantId: string, el: HTMLElement | null) {
    this.impl.attachRemoteVideo(participantId, el);
  }
  getConnectionState() {
    return this.impl.getConnectionState();
  }
  async startScreenShare() {
    return this.impl.startScreenShare();
  }
  async stopScreenShare() {
    return this.impl.stopScreenShare();
  }
  isScreenSharing() {
    return this.impl.isScreenSharing();
  }
  attachSharedScreen(el: HTMLElement | null) {
    this.impl.attachSharedScreen(el);
  }
  attachRemoteScreen(participantId: string, el: HTMLElement | null) {
    this.impl.attachRemoteScreen(participantId, el);
  }
}
