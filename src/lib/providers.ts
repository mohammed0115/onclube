// Live-session provider composition root (Sprint 10).
//
// The SINGLE place that selects production vs stub adapters, driven by
// environment. Hooks/pages/components never change — they resolve their provider
// from context, and this module decides which factory each context gets. In
// development/testing (or when a provider is unconfigured) the stub is used, so
// nothing ever crashes without infrastructure.
import { createStubChatTransport, type ChatTransportFactory } from "@/lib/chat";
import { WebSocketChatTransport } from "@/lib/chat/wsTransport";
import { createStubParticipantSignalProvider, type ParticipantSignalProviderFactory } from "@/lib/signals";
import { WebSocketParticipantSignalProvider } from "@/lib/signals/wsProvider";
import { createStubPresenceProvider, type PresenceProviderFactory } from "@/lib/presence";
import { WebSocketPresenceProvider } from "@/lib/presence/wsProvider";
import { createStubTranscriptProvider, type TranscriptProviderFactory } from "@/lib/transcript";
import { WebSocketTranscriptProvider } from "@/lib/transcript/wsProvider";
import { createStubFileSharingProvider, type FileSharingProviderFactory } from "@/lib/files";
import { HttpFileSharingProvider } from "@/lib/files/httpProvider";
import { createStubVideoRoomProvider, type VideoRoomProviderFactory } from "@/lib/video";
import { AgoraVideoRoomProvider } from "@/lib/video/agoraProvider";
import { createStubRecordingProvider, type RecordingProviderFactory } from "@/lib/recording";
import { CloudRecordingProvider } from "@/lib/recording/cloudProvider";
import { createStubWhiteboardProvider, type WhiteboardProviderFactory } from "@/lib/whiteboard";
import { WebSocketWhiteboardProvider } from "@/lib/whiteboard/wsProvider";

export interface ProviderEnv {
  /** development | testing | staging | production */
  providerMode?: string;
  /** Vite build mode fallback (import.meta.env.MODE). */
  mode?: string;
  chatWsUrl?: string;
  signalsWsUrl?: string;
  presenceWsUrl?: string;
  transcriptWsUrl?: string;
  whiteboardWsUrl?: string;
  fileUploadUrl?: string;
  recordingControlUrl?: string;
  agoraAppId?: string;
}

export interface ResolvedProviders {
  chat: ChatTransportFactory;
  signals: ParticipantSignalProviderFactory;
  presence: PresenceProviderFactory;
  transcript: TranscriptProviderFactory;
  files: FileSharingProviderFactory;
  video: VideoRoomProviderFactory;
  recording: RecordingProviderFactory;
  whiteboard: WhiteboardProviderFactory;
}

export function isProductionMode(env: ProviderEnv): boolean {
  const m = env.providerMode ?? env.mode ?? "development";
  return m === "staging" || m === "production";
}

/** Read provider configuration from the Vite environment (never hard-coded). */
export function readProviderEnv(): ProviderEnv {
  const e = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return {
    providerMode: e.VITE_PROVIDER_MODE,
    mode: e.MODE,
    chatWsUrl: e.VITE_CHAT_WS_URL,
    signalsWsUrl: e.VITE_SIGNALS_WS_URL,
    presenceWsUrl: e.VITE_PRESENCE_WS_URL,
    transcriptWsUrl: e.VITE_TRANSCRIPT_WS_URL,
    whiteboardWsUrl: e.VITE_WHITEBOARD_WS_URL,
    fileUploadUrl: e.VITE_FILE_UPLOAD_URL,
    recordingControlUrl: e.VITE_RECORDING_CONTROL_URL,
    agoraAppId: e.VITE_AGORA_APP_ID,
  };
}

/**
 * Select the factory for each live-session provider. Production adapters are
 * chosen ONLY in staging/production AND only when that provider is configured;
 * otherwise the stub is used (fallback). This is the only provider-aware code
 * outside the adapters themselves.
 */
export function resolveProviders(env: ProviderEnv = readProviderEnv()): ResolvedProviders {
  const prod = isProductionMode(env);
  return {
    chat: prod && env.chatWsUrl ? () => new WebSocketChatTransport(env.chatWsUrl!) : createStubChatTransport,
    signals: prod && env.signalsWsUrl ? () => new WebSocketParticipantSignalProvider(env.signalsWsUrl!) : createStubParticipantSignalProvider,
    presence: prod && env.presenceWsUrl ? () => new WebSocketPresenceProvider(env.presenceWsUrl!) : createStubPresenceProvider,
    transcript: prod && env.transcriptWsUrl ? () => new WebSocketTranscriptProvider(env.transcriptWsUrl!) : createStubTranscriptProvider,
    files: prod && env.fileUploadUrl ? () => new HttpFileSharingProvider(env.fileUploadUrl!) : createStubFileSharingProvider,
    video: prod && env.agoraAppId ? () => new AgoraVideoRoomProvider(env.agoraAppId!) : createStubVideoRoomProvider,
    recording: prod && env.recordingControlUrl ? () => new CloudRecordingProvider(env.recordingControlUrl!) : createStubRecordingProvider,
    whiteboard: prod && env.whiteboardWsUrl ? () => new WebSocketWhiteboardProvider(env.whiteboardWsUrl!) : createStubWhiteboardProvider,
  };
}
