import { describe, it, expect } from "vitest";
import { resolveProviders, isProductionMode, type ProviderEnv } from "@/lib/providers";
import { createStubChatTransport } from "@/lib/chat";
import { WebSocketChatTransport } from "@/lib/chat/wsTransport";
import { createStubVideoRoomProvider } from "@/lib/video";
import { AgoraVideoRoomProvider } from "@/lib/video/agoraProvider";
import { HttpFileSharingProvider } from "@/lib/files/httpProvider";
import { WebSocketPresenceProvider } from "@/lib/presence/wsProvider";
import { WebSocketParticipantSignalProvider } from "@/lib/signals/wsProvider";
import { WebSocketTranscriptProvider } from "@/lib/transcript/wsProvider";
import { CloudRecordingProvider } from "@/lib/recording/cloudProvider";
import { WebSocketWhiteboardProvider } from "@/lib/whiteboard/wsProvider";

const FULL_PROD: ProviderEnv = {
  providerMode: "production",
  chatWsUrl: "wss://chat.example",
  signalsWsUrl: "wss://signals.example",
  presenceWsUrl: "wss://presence.example",
  transcriptWsUrl: "wss://transcript.example",
  whiteboardWsUrl: "wss://board.example",
  fileUploadUrl: "https://files.example/upload",
  recordingControlUrl: "https://rec.example",
  agoraAppId: "app-123",
};

describe("Provider composition root (Sprint 10)", () => {
  it("selects STUB adapters in development (even with URLs present)", () => {
    const dev = resolveProviders({ ...FULL_PROD, providerMode: "development" });
    expect(dev.chat).toBe(createStubChatTransport);
    expect(dev.video).toBe(createStubVideoRoomProvider);
  });

  it("selects STUB adapters in testing", () => {
    const t = resolveProviders({ ...FULL_PROD, providerMode: "testing" });
    expect(t.chat).toBe(createStubChatTransport);
  });

  it("selects PRODUCTION adapters in production when configured", () => {
    const p = resolveProviders(FULL_PROD);
    expect(p.chat()).toBeInstanceOf(WebSocketChatTransport);
    expect(p.signals()).toBeInstanceOf(WebSocketParticipantSignalProvider);
    expect(p.presence()).toBeInstanceOf(WebSocketPresenceProvider);
    expect(p.transcript()).toBeInstanceOf(WebSocketTranscriptProvider);
    expect(p.files()).toBeInstanceOf(HttpFileSharingProvider);
    expect(p.video()).toBeInstanceOf(AgoraVideoRoomProvider);
    expect(p.recording()).toBeInstanceOf(CloudRecordingProvider);
    expect(p.whiteboard()).toBeInstanceOf(WebSocketWhiteboardProvider);
  });

  it("staging counts as production", () => {
    expect(isProductionMode({ providerMode: "staging" })).toBe(true);
    expect(resolveProviders({ ...FULL_PROD, providerMode: "staging" }).chat()).toBeInstanceOf(WebSocketChatTransport);
  });

  it("falls back to STUB per-provider when that provider is unconfigured (except video)", () => {
    // Production mode, but no URLs/keys → URL-driven providers degrade to their stub.
    const p = resolveProviders({ providerMode: "production" });
    expect(p.chat).toBe(createStubChatTransport);
    // Video is the exception: it must use the real Agora adapter in production even
    // without a build-time appId, because appId/channel/token come from the server
    // /join response. Falling back to the stub here would isolate participants.
    expect(p.video()).toBeInstanceOf(AgoraVideoRoomProvider);
  });

  it("video uses real Agora in production regardless of build-time appId (server supplies it)", () => {
    expect(resolveProviders({ providerMode: "production" }).video()).toBeInstanceOf(AgoraVideoRoomProvider);
    expect(resolveProviders({ providerMode: "staging" }).video()).toBeInstanceOf(AgoraVideoRoomProvider);
    // still stub outside production
    expect(resolveProviders({ providerMode: "development" }).video).toBe(createStubVideoRoomProvider);
  });

  it("mixes: configured providers go production, unconfigured stay stub", () => {
    const p = resolveProviders({ providerMode: "production", chatWsUrl: "wss://only-chat" });
    expect(p.chat()).toBeInstanceOf(WebSocketChatTransport);
    expect(p.video()).toBeInstanceOf(AgoraVideoRoomProvider); // video not gated on appId
  });

  it("isProductionMode honours the mode ladder", () => {
    expect(isProductionMode({ providerMode: "development" })).toBe(false);
    expect(isProductionMode({ providerMode: "testing" })).toBe(false);
    expect(isProductionMode({ providerMode: "production" })).toBe(true);
    expect(isProductionMode({ mode: "staging" })).toBe(true);
  });
});
