// Provider-neutral video-room contract.
//
// This is the ONLY surface the UI/hooks talk to. No Agora/Daily/Zoom/LiveKit
// type ever crosses this boundary — swapping providers means writing a new
// adapter that implements `VideoRoomProvider`, with zero changes to the hook,
// the page, or the domain/API.

export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";

/**
 * Server-minted join credential, mapped to a provider-neutral shape at the API
 * boundary (see mapRoomCredential). The frontend NEVER mints these.
 */
export interface RoomCredential {
  sessionId: string;
  provider: string;
  appId: string | null;
  channel: string;
  token: string;
  uid: string;
  expiresAt: string | null;
}

export interface RemoteParticipant {
  id: string;
  name: string;
  cameraOn: boolean;
  micOn: boolean;
}

/**
 * Who (if anyone) is sharing their screen. Exactly one share can be active at a
 * time; a new share replaces the previous. `sharer` distinguishes the local user
 * from a remote peer so the UI can label it. No browser MediaStream ever appears
 * here — the provider owns the pixels and attaches them to a DOM node on request.
 */
export interface ScreenShareState {
  active: boolean;
  sharer: "local" | "remote" | null;
  participantId: string | null;
  participantName: string | null;
}

export type VideoRoomErrorCode =
  | "camera_denied"
  | "microphone_denied"
  | "network_disconnected"
  | "token_expired"
  | "provider_unavailable"
  | "room_unavailable"
  | "join_timeout"
  | "device_unavailable"
  | "screen_share_denied"
  | "screen_share_unsupported"
  | "screen_share_cancelled"
  | "display_disconnected"
  | "unknown";

export class VideoRoomError extends Error {
  code: VideoRoomErrorCode;
  constructor(code: VideoRoomErrorCode, message?: string) {
    super(message ?? code);
    this.name = "VideoRoomError";
    this.code = code;
  }
}

/** Provider → app event callbacks. The adapter pushes state; it never pulls. */
export interface VideoRoomEvents {
  onConnectionState(state: ConnectionState): void;
  onParticipantsChanged(participants: RemoteParticipant[]): void;
  onLocalMediaChanged(state: { cameraOn: boolean; micOn: boolean }): void;
  onScreenShareChanged(state: ScreenShareState): void;
  onError(error: VideoRoomError): void;
}

export interface JoinOptions {
  credential: RoomCredential;
  displayName: string;
  cameraOn: boolean;
  micOn: boolean;
  events: VideoRoomEvents;
}

/**
 * The video-room port. A real adapter (Agora/Daily/LiveKit/…) implements this
 * and lives entirely in infrastructure. Media attachment is done by handing the
 * adapter a DOM node — the UI owns layout, the adapter owns pixels.
 */
export interface VideoRoomProvider {
  join(opts: JoinOptions): Promise<void>;
  leave(): Promise<void>;
  setCameraEnabled(on: boolean): Promise<void>;
  setMicrophoneEnabled(on: boolean): Promise<void>;
  /** Attach (or detach with null) the local preview to a DOM node. */
  attachLocalVideo(el: HTMLElement | null): void;
  /** Attach (or detach with null) a remote participant's video to a DOM node. */
  attachRemoteVideo(participantId: string, el: HTMLElement | null): void;
  getConnectionState(): ConnectionState;

  // ── screen sharing (Sprint 8.2) ─────────────────────────────────────────────
  // The provider owns the browser capture API entirely; callers never touch
  // getDisplayMedia. Starting a share replaces any existing one. Denial/failure
  // must NOT drop the call — the provider reports via onError and stays connected.
  startScreenShare(): Promise<void>;
  stopScreenShare(): Promise<void>;
  isScreenSharing(): boolean;
  /** Attach (or detach with null) the LOCAL shared surface to a DOM node. */
  attachSharedScreen(el: HTMLElement | null): void;
  /** Attach (or detach with null) a REMOTE participant's shared surface. */
  attachRemoteScreen(participantId: string, el: HTMLElement | null): void;
}

export type VideoRoomProviderFactory = () => VideoRoomProvider;
