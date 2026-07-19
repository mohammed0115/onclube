import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, MessageSquare, Mic, MicOff, MonitorUp, MonitorX, Paperclip, PenTool, PhoneOff, Wifi, WifiOff } from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useVideoRoom } from "@/hooks";
import type { RoomCredential, ScreenShareState, VideoRoomErrorCode } from "@/lib/video";
import { SessionChat } from "./SessionChat";
import { SessionWhiteboard } from "./SessionWhiteboard";
import { SessionFiles } from "./SessionFiles";
import { SessionSignals } from "./SessionSignals";
import { SessionRecording } from "./SessionRecording";
import { SessionPresence } from "./SessionPresence";
import { SessionTranscript } from "./SessionTranscript";

function initialsOf(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
}

const ERROR_COPY: Record<VideoRoomErrorCode, string> = {
  camera_denied: "We couldn’t access your camera. Check your browser permissions and try again.",
  microphone_denied: "We couldn’t access your microphone. Check your browser permissions and try again.",
  network_disconnected: "Your connection dropped. We’ll keep trying to reconnect.",
  token_expired: "Your session pass expired. Please return to the waiting room to rejoin.",
  provider_unavailable: "The video service is temporarily unavailable. Please try again in a moment.",
  room_unavailable: "This room isn’t available right now. Please try again shortly.",
  join_timeout: "Joining took too long. Please check your connection and try again.",
  device_unavailable: "No camera or microphone was found. You can still join to listen.",
  screen_share_denied: "Screen sharing was blocked. You can keep talking — try sharing again anytime.",
  screen_share_unsupported: "Your browser doesn’t support screen sharing.",
  screen_share_cancelled: "Screen share cancelled.",
  display_disconnected: "The shared display was disconnected. Your call is still connected.",
  unknown: "Something went wrong connecting to the room. Please try again.",
};

const CONNECTION_COPY: Record<string, { label: string; tone: string; pulse?: boolean }> = {
  idle: { label: "Preparing…", tone: "text-slate-300" },
  connecting: { label: "Connecting…", tone: "text-amber-400", pulse: true },
  connected: { label: "Connected", tone: "text-emerald-400" },
  reconnecting: { label: "Reconnecting…", tone: "text-amber-400", pulse: true },
  disconnected: { label: "Disconnected", tone: "text-red-400" },
  failed: { label: "Connection failed", tone: "text-red-400" },
};

/** A single participant video surface with an avatar fallback. */
function ParticipantTile({
  name,
  self,
  cameraOn,
  micOn,
  attach,
}: {
  name: string;
  self?: boolean;
  cameraOn: boolean;
  micOn: boolean;
  attach: (el: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    attach(ref.current);
    return () => attach(null);
  }, [attach]);

  return (
    <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 ring-1 ring-white/5">
      {/* Provider attaches the <video> here when a track is available. */}
      <div ref={ref} className={cn("absolute inset-0", !cameraOn && "hidden")} />
      {!cameraOn && (
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-2xl font-bold text-white shadow-lg">
            {initialsOf(name)}
          </div>
        </div>
      )}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5">
        <span className="text-xs font-medium text-white">{self ? `${name} (You)` : name}</span>
        {!micOn && <MicOff size={12} className="text-red-400" />}
      </div>
    </div>
  );
}

/** The active shared-screen surface (local or remote). Provider owns the pixels. */
function SharedScreen({ share, attach }: { share: ScreenShareState; attach: (el: HTMLElement | null) => void }) {
  const { tx } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    attach(ref.current);
    return () => attach(null);
  }, [attach]);

  const label =
    share.sharer === "local"
      ? tx("You are sharing your screen.")
      : `${share.participantName ?? "A participant"} is sharing.`;

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
      <div ref={ref} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-500">
        <MonitorUp size={40} />
      </div>
      <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-emerald-600/90 px-3 py-1.5" role="status" aria-live="polite">
        <MonitorUp size={13} className="text-white" />
        <span className="text-xs font-semibold text-white">{label}</span>
      </div>
    </div>
  );
}

export function VideoRoom({
  credential,
  displayName,
  topicTitle,
  onLeave,
  viewerRole = "student",
}: {
  credential: RoomCredential;
  displayName: string;
  topicTitle: string;
  onLeave: () => void;
  viewerRole?: "student" | "instructor" | "admin";
}) {
  const { tx } = useI18n();
  const room = useVideoRoom({ credential, displayName });
  const [panel, setPanel] = useState<"none" | "chat" | "whiteboard" | "files">("none");
  const chatOpen = panel === "chat";
  const boardOpen = panel === "whiteboard";
  const filesOpen = panel === "files";
  const conn = CONNECTION_COPY[room.connectionState] ?? CONNECTION_COPY.idle;
  const joining = room.connectionState === "connecting" && !room.error;
  const reconnecting = room.connectionState === "reconnecting";
  const share = room.screenShare;
  const sharingLocally = share.active && share.sharer === "local";
  // A denied device is non-fatal; only surface a blocking error for real failures.
  const blockingError =
    room.error && ["token_expired", "provider_unavailable", "room_unavailable", "join_timeout"].includes(room.error.code)
      ? room.error
      : null;

  async function handleLeave() {
    await room.leave();
    onLeave();
  }

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <Logo />
        <div className="truncate px-4 text-sm font-medium text-slate-200">{topicTitle}</div>
        <div className="flex items-center gap-2 text-xs font-semibold" role="status" aria-live="polite">
          {room.connectionState === "connected" ? (
            <Wifi size={14} className={conn.tone} />
          ) : (
            <WifiOff size={14} className={conn.tone} />
          )}
          <span className={cn(conn.tone, conn.pulse && "animate-pulse")}>{tx(conn.label)}</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
      <main className="relative min-h-0 flex-1 p-4">
        {/* Non-blocking device hint (e.g. camera/mic denied) */}
        {room.error && !blockingError && (
          <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-lg bg-amber-500/90 px-4 py-2 text-sm text-white shadow-lg" role="alert">
            {tx(ERROR_COPY[room.error.code])}
          </div>
        )}

        {/* Reconnecting overlay banner */}
        {reconnecting && (
          <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-lg bg-slate-800/95 px-4 py-2 text-sm text-amber-300 shadow-lg" role="status">
            {tx("Reconnecting…")}
          </div>
        )}

        {/* Blocking join failure */}
        {blockingError ? (
          <div className="flex h-full items-center justify-center" role="alert">
            <div className="max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-8 text-center">
              <div className="mb-3 text-lg font-semibold">{tx("Couldn’t join the room")}</div>
              <p className="mb-5 text-sm text-slate-300">{tx(ERROR_COPY[blockingError.code])}</p>
              <div className="flex justify-center gap-3">
                <Button variant="soft" onClick={handleLeave}>{tx("Leave")}</Button>
                <Button onClick={room.retry}>{tx("Try again")}</Button>
              </div>
            </div>
          </div>
        ) : joining ? (
          <div className="flex h-full items-center justify-center" role="status" aria-live="polite">
            <div className="flex flex-col items-center gap-3 text-slate-300">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-white" />
              <span className="text-sm">{tx("Joining the room…")}</span>
            </div>
          </div>
        ) : share.active ? (
          // Presentation layout: shared screen large, cameras as a filmstrip.
          <div className="flex h-full flex-col gap-3">
            <SharedScreen
              share={share}
              attach={
                share.sharer === "local"
                  ? room.attachSharedScreen
                  : (el) => room.attachRemoteScreen(share.participantId ?? "", el)
              }
            />
            <div className="flex h-28 flex-shrink-0 gap-3 overflow-x-auto">
              {room.remoteParticipants.map((p) => (
                <div key={p.id} className="aspect-video h-full flex-shrink-0">
                  <ParticipantTile name={p.name} cameraOn={p.cameraOn} micOn={p.micOn} attach={(el) => room.attachRemoteVideo(p.id, el)} />
                </div>
              ))}
              <div className="aspect-video h-full flex-shrink-0">
                <ParticipantTile name={displayName} self cameraOn={room.cameraOn} micOn={room.micOn} attach={room.attachLocalVideo} />
              </div>
            </div>
          </div>
        ) : (
          // Camera grid — the layout we auto-return to when sharing stops.
          <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-2">
            {room.remoteParticipants.map((p) => (
              <ParticipantTile
                key={p.id}
                name={p.name}
                cameraOn={p.cameraOn}
                micOn={p.micOn}
                attach={(el) => room.attachRemoteVideo(p.id, el)}
              />
            ))}
            <ParticipantTile
              name={displayName}
              self
              cameraOn={room.cameraOn}
              micOn={room.micOn}
              attach={room.attachLocalVideo}
            />
          </div>
        )}

        {/* Recording indicator (all) + controls (instructor only) */}
        {!joining && !blockingError && (
          <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
            <SessionRecording
              sessionId={credential.sessionId}
              participantId={credential.uid}
              canControl={viewerRole === "instructor"}
            />
            {/* Attendance & presence — admins never enter, so role is student/instructor */}
            <SessionPresence
              sessionId={credential.sessionId}
              participantId={credential.uid}
              participantName={displayName}
              role={viewerRole === "instructor" ? "instructor" : "student"}
            />
            {/* Live transcript pipeline (capture/transport/present only — no AI) */}
            <SessionTranscript
              sessionId={credential.sessionId}
              participantId={credential.uid}
              speakerName={displayName}
              role={viewerRole === "instructor" ? "instructor" : "student"}
            />
          </div>
        )}

        {/* Raise hand + reactions overlay (own provider; only while in the room) */}
        {!joining && !blockingError && (
          <SessionSignals
            sessionId={credential.sessionId}
            participantId={credential.uid}
            participantName={displayName}
          />
        )}
      </main>

        {chatOpen && (
          <div className="w-full max-w-sm flex-shrink-0 overflow-hidden border-l border-white/10">
            <SessionChat
              sessionId={credential.sessionId}
              senderId={credential.uid}
              senderName={displayName}
              onClose={() => setPanel("none")}
            />
          </div>
        )}
        {boardOpen && (
          <div className="relative w-full max-w-2xl flex-shrink-0 overflow-hidden border-l border-white/10">
            <SessionWhiteboard
              sessionId={credential.sessionId}
              authorId={credential.uid}
              onClose={() => setPanel("none")}
            />
          </div>
        )}
        {filesOpen && (
          <div className="w-full max-w-sm flex-shrink-0 overflow-hidden border-l border-white/10">
            <SessionFiles
              sessionId={credential.sessionId}
              uploaderId={credential.uid}
              uploaderName={displayName}
              onClose={() => setPanel("none")}
            />
          </div>
        )}
      </div>

      <footer className="flex items-center justify-center gap-3 border-t border-white/10 py-4">
        <button
          type="button"
          aria-pressed={room.micOn}
          aria-label={room.micOn ? tx("Mute microphone") : tx("Unmute microphone")}
          onClick={room.toggleMicrophone}
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full transition-all",
            room.micOn ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-red-500 text-white"
          )}
        >
          {room.micOn ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        <button
          type="button"
          aria-pressed={room.cameraOn}
          aria-label={room.cameraOn ? tx("Turn camera off") : tx("Turn camera on")}
          onClick={room.toggleCamera}
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full transition-all",
            room.cameraOn ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-red-500 text-white"
          )}
        >
          {room.cameraOn ? <Camera size={18} /> : <CameraOff size={18} />}
        </button>
        <button
          type="button"
          aria-pressed={sharingLocally}
          aria-label={sharingLocally ? tx("Stop sharing your screen") : tx("Share your screen")}
          onClick={sharingLocally ? room.stopScreenShare : room.startScreenShare}
          disabled={room.screenShareBusy || room.connectionState !== "connected"}
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full transition-all disabled:opacity-50",
            sharingLocally ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-slate-800 text-white hover:bg-slate-700"
          )}
        >
          {room.screenShareBusy ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-white" aria-hidden />
          ) : sharingLocally ? (
            <MonitorX size={18} />
          ) : (
            <MonitorUp size={18} />
          )}
        </button>
        <button
          type="button"
          aria-pressed={chatOpen}
          aria-label={chatOpen ? tx("Close chat") : tx("Open chat")}
          onClick={() => setPanel((p) => (p === "chat" ? "none" : "chat"))}
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full transition-all",
            chatOpen ? "bg-primary text-white" : "bg-slate-800 text-white hover:bg-slate-700"
          )}
        >
          <MessageSquare size={18} />
        </button>
        <button
          type="button"
          aria-pressed={boardOpen}
          aria-label={boardOpen ? tx("Close whiteboard") : tx("Open whiteboard")}
          onClick={() => setPanel((p) => (p === "whiteboard" ? "none" : "whiteboard"))}
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full transition-all",
            boardOpen ? "bg-primary text-white" : "bg-slate-800 text-white hover:bg-slate-700"
          )}
        >
          <PenTool size={18} />
        </button>
        <button
          type="button"
          aria-pressed={filesOpen}
          aria-label={filesOpen ? tx("Close files") : tx("Open files")}
          onClick={() => setPanel((p) => (p === "files" ? "none" : "files"))}
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full transition-all",
            filesOpen ? "bg-primary text-white" : "bg-slate-800 text-white hover:bg-slate-700"
          )}
        >
          <Paperclip size={18} />
        </button>
        <button
          type="button"
          aria-label={tx("Leave meeting")}
          onClick={handleLeave}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white transition-all hover:bg-red-600"
        >
          <PhoneOff size={18} />
        </button>
      </footer>
      {room.screenShareBusy && (
        <div className="sr-only" role="status" aria-live="polite">
          {tx("Requesting permission to share your screen…")}
        </div>
      )}
    </div>
  );
}
