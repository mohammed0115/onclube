// Video-room infrastructure barrel + dependency injection.
//
// The UI resolves its provider from context, so tests (and a future real
// adapter) inject a different factory without touching pages or hooks.
import { createContext, useContext } from "react";
import type { VideoJoin } from "@/api/types";
import type { RoomCredential, VideoRoomProviderFactory } from "./types";
import { createStubVideoRoomProvider } from "./stubProvider";

export * from "./types";
export { StubVideoRoomProvider, createStubVideoRoomProvider } from "./stubProvider";

/** Map the (provider-named) wire DTO onto a provider-neutral credential. */
export function mapRoomCredential(join: VideoJoin): RoomCredential {
  return {
    sessionId: join.sessionId,
    provider: join.provider,
    appId: join.agoraAppId,
    channel: join.channel,
    token: join.agoraToken,
    uid: join.uid,
    expiresAt: join.expiresAt,
  };
}

/**
 * Provider factory injection point. Defaults to the stub; the app wraps the real
 * adapter here later, and tests wrap a controllable fake. A factory (not an
 * instance) so each room mount gets its own provider.
 */
export const VideoRoomProviderContext = createContext<VideoRoomProviderFactory>(
  createStubVideoRoomProvider
);

export const useVideoRoomProviderFactory = (): VideoRoomProviderFactory =>
  useContext(VideoRoomProviderContext);
