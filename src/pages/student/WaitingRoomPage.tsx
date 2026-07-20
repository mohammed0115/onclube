import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { Camera, CameraOff, Clock, Mic, MicOff, User, Video } from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { Button } from "@/components/ui/button";
import { Loading, ErrorState } from "@/components/states";
import { useAuth } from "@/auth/AuthProvider";
import { VideoRoom } from "@/components/session/VideoRoom";
import { mapRoomCredential } from "@/lib/video";
import type { RoomCredential } from "@/lib/video";
import { useWaitingRoom, useJoinSession, useLeaveSession, useStartSession, useEndSession } from "@/hooks";
import { useI18n } from "@/i18n";
import type { SessionPhase } from "@/api/types";

// ── countdown helpers ─────────────────────────────────────────────────────────
function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const PHASE_COPY: Record<SessionPhase, { badge: string; tone: string }> = {
  waiting: { badge: "Waiting room", tone: "bg-blue-50 text-blue-700" },
  live: { badge: "Live now", tone: "bg-red-50 text-red-600" },
  completed: { badge: "Session ended", tone: "bg-emerald-50 text-emerald-700" },
  cancelled: { badge: "Cancelled", tone: "bg-surface text-muted-foreground" },
  expired: { badge: "Missed", tone: "bg-amber-50 text-amber-700" },
};

export function WaitingRoomPage() {
  const { tx } = useI18n();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const roomQuery = useWaitingRoom(id);
  const join = useJoinSession();
  const leave = useLeaveSession();
  const startSession = useStartSession();
  const endSession = useEndSession();

  // Device-check placeholders — local, non-functional toggles (real media is a
  // later sprint). They let the student rehearse the pre-join gesture.
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  // Server-minted credential; its presence flips this page into the live room.
  const [credential, setCredential] = useState<RoomCredential | null>(null);

  const now = useNow();

  if (roomQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-2">
        <Loading label="Loading your waiting room…" />
      </div>
    );
  }
  if (roomQuery.isError || !roomQuery.data) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-2 p-8">
        <div className="w-full max-w-md">
          <ErrorState error={roomQuery.error} onRetry={() => roomQuery.refetch()} title="Couldn’t open this room" />
        </div>
      </div>
    );
  }

  const room = roomQuery.data;
  const isInstructor = room.viewerRole === "instructor";

  // Once the server hands us a credential the waiting room becomes the live room.
  // The waiting room stays the sole entry point — the room is never reached
  // without passing this gate.
  if (credential) {
    return (
      <VideoRoom
        credential={credential}
        displayName={user?.fullName ?? "You"}
        topicTitle={room.topicTitle}
        onLeave={onLeave}
        viewerRole={room.viewerRole}
      />
    );
  }

  const phase = PHASE_COPY[room.phase] ?? PHASE_COPY.waiting;
  const opensMs = new Date(room.joinOpensAt).getTime() - now;
  const startsMs = new Date(room.scheduledAt).getTime() - now;

  function statusLine(): string {
    if (room.phase === "expired") return "The join window has closed. This session was missed.";
    if (room.phase === "cancelled") return "This session was cancelled.";
    if (room.phase === "completed") return "This session has ended.";
    if (room.canJoin) return "You can join now.";
    if (opensMs > 0) return `Doors open in ${formatCountdown(opensMs)}.`;
    return "Waiting for the room to open…";
  }

  async function onJoin() {
    try {
      const cred = await join.mutateAsync(id);
      // The instructor starting the room transitions the session to LIVE.
      if (isInstructor) await startSession.mutateAsync(id).catch(() => {});
      setCredential(mapRoomCredential(cred));
    } catch {
      /* surfaced inline below */
    }
  }

  async function onLeave() {
    try {
      await leave.mutateAsync(id);
    } catch {
      /* leave the room regardless */
    }
    setCredential(null);
    // The instructor ending the room completes the session, which generates the
    // AI report; take them straight to it. Students just return to their dashboard.
    if (isInstructor) {
      try {
        await endSession.mutateAsync(id);
      } catch {
        /* still navigate; the report can be generated/regenerated later */
      }
      navigate(`/student/report/${id}`);
      return;
    }
    navigate("/student");
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-2 text-foreground">
      <header className="flex items-center justify-between border-b border-border bg-card px-5 py-3">
        <Logo />
        <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${phase.tone}`}>
          {room.phase === "live" && <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />}
          {phase.badge}
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-4xl flex-1 gap-6 p-6 lg:grid-cols-[1.1fr_1fr]">
        {/* Device-check preview (placeholder) */}
        <section aria-label={tx("Device check")} className="flex flex-col gap-3">
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border border-border bg-slate-900 text-slate-300">
            {camOn ? (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <Video size={34} />
                <span className="text-xs">{tx("Camera preview coming soon")}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-500">
                <CameraOff size={34} />
                <span className="text-xs">{tx("Camera is off")}</span>
              </div>
            )}
            <span className="absolute bottom-3 left-3 rounded-md bg-black/40 px-2 py-1 text-xs text-white">
              {tx("Device check")}
            </span>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              aria-pressed={camOn}
              aria-label={camOn ? tx("Turn camera off") : tx("Turn camera on")}
              onClick={() => setCamOn((v) => !v)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-surface"
            >
              {camOn ? <Camera size={18} /> : <CameraOff size={18} className="text-red-500" />}
            </button>
            <button
              type="button"
              aria-pressed={micOn}
              aria-label={micOn ? tx("Mute microphone") : tx("Unmute microphone")}
              onClick={() => setMicOn((v) => !v)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-surface"
            >
              {micOn ? <Mic size={18} /> : <MicOff size={18} className="text-red-500" />}
            </button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {tx("Camera and microphone are placeholders — live video arrives in a later update.")}
          </p>
        </section>

        {/* Session info + join */}
        <section aria-label={tx("Session details")} className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <h1 className="text-xl font-bold text-foreground">{room.topicTitle}</h1>
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <User size={15} /> with {room.instructorName}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-surface p-3">
              <dt className="text-xs text-muted-foreground">{tx("Scheduled")}</dt>
              <dd className="mt-0.5 font-medium text-foreground">{formatWhen(room.scheduledAt)}</dd>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <dt className="text-xs text-muted-foreground">{tx("Duration")}</dt>
              <dd className="mt-0.5 font-medium text-foreground">{room.durationMinutes} min</dd>
            </div>
          </dl>

          {/* Countdown / status */}
          <div className="flex items-center gap-3 rounded-xl bg-surface p-4" role="status" aria-live="polite">
            <Clock size={20} className="text-primary" />
            <div>
              {room.phase === "waiting" && !room.canJoin && startsMs > 0 && (
                <div className="text-lg font-bold tabular-nums text-foreground">{formatCountdown(startsMs)}</div>
              )}
              <div className="text-sm text-muted-foreground">{statusLine()}</div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button onClick={onJoin} disabled={!room.canJoin || join.isPending} className="w-full">
              {join.isPending ? tx("Joining…") : tx("Join session")}
            </Button>
            {join.isError && (
              <p className="text-sm text-red-600" role="alert">
                {tx("Couldn’t join right now. Please try again in a moment.")}
              </p>
            )}
            {!room.canJoin && room.viewerRole === "admin" && (
              <p className="text-xs text-muted-foreground">{tx("Admins can view this room but cannot join.")}</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
