// Wires the resolved live-session provider factories into their contexts.
// Mounted once at the app root — hooks/pages are unchanged and keep resolving
// their provider from context. Selection happens in @/lib/providers only.
import type { ReactNode } from "react";
import { ChatTransportContext } from "@/lib/chat";
import { ParticipantSignalProviderContext } from "@/lib/signals";
import { PresenceProviderContext } from "@/lib/presence";
import { TranscriptProviderContext } from "@/lib/transcript";
import { FileSharingProviderContext } from "@/lib/files";
import { VideoRoomProviderContext } from "@/lib/video";
import { RecordingProviderContext } from "@/lib/recording";
import { WhiteboardProviderContext } from "@/lib/whiteboard";
import { resolveProviders, type ResolvedProviders } from "@/lib/providers";

export function LiveSessionProviders({
  children,
  providers,
}: {
  children: ReactNode;
  providers?: ResolvedProviders;
}) {
  const p = providers ?? resolveProviders();
  return (
    <ChatTransportContext.Provider value={p.chat}>
      <ParticipantSignalProviderContext.Provider value={p.signals}>
        <PresenceProviderContext.Provider value={p.presence}>
          <TranscriptProviderContext.Provider value={p.transcript}>
            <FileSharingProviderContext.Provider value={p.files}>
              <VideoRoomProviderContext.Provider value={p.video}>
                <RecordingProviderContext.Provider value={p.recording}>
                  <WhiteboardProviderContext.Provider value={p.whiteboard}>
                    {children}
                  </WhiteboardProviderContext.Provider>
                </RecordingProviderContext.Provider>
              </VideoRoomProviderContext.Provider>
            </FileSharingProviderContext.Provider>
          </TranscriptProviderContext.Provider>
        </PresenceProviderContext.Provider>
      </ParticipantSignalProviderContext.Provider>
    </ChatTransportContext.Provider>
  );
}
