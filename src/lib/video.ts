// Video provider adapter seam.
//
// The backend mints the join credential (Agora app id / channel / token / uid).
// The real Agora Web SDK is NOT wired yet — this stub is the single seam where it
// will plug in. The frontend never generates tokens; it only consumes the
// server-minted credential.
import type { VideoJoin } from "@/api/types";

export interface VideoSession {
  channel: string;
  disconnect(): void;
}

export interface VideoProvider {
  connect(join: VideoJoin): Promise<VideoSession>;
}

/** Placeholder provider — logs the credential and returns a no-op session. */
export const stubVideoProvider: VideoProvider = {
  async connect(join: VideoJoin): Promise<VideoSession> {
    // Real implementation (later phase):
    //   const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    //   await client.join(join.agoraAppId, join.channel, join.agoraToken, join.uid);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[video] (stub) joining channel", join.channel, "as uid", join.uid);
    }
    return {
      channel: join.channel,
      disconnect() {
        /* real impl: client.leave() */
      },
    };
  },
};
