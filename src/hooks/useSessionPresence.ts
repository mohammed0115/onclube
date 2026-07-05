// Session-presence lifecycle hook — the single home for attendance orchestration.
// It announces join on entry, heartbeats while present, announces leave on exit,
// holds the provider's attendance snapshot, and handles reconnect. It NEVER
// calculates attendance itself — the provider is the source of truth. The UI is
// pure presentation and only consumes this hook.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePresenceProviderFactory } from "@/lib/presence";
import type {
  AttendanceRecord,
  PresenceConnectionState,
  PresenceError as PresenceErrorType,
  PresenceEvents,
  PresenceProvider,
  ParticipantRole,
  SessionAttendance,
} from "@/lib/presence";
import { PresenceError } from "@/lib/presence";

const HEARTBEAT_INTERVAL_MS = 1000;

export interface UseSessionPresenceArgs {
  sessionId: string;
  participantId: string;
  participantName: string;
  role: ParticipantRole;
}

export interface SessionPresenceController {
  connectionState: PresenceConnectionState;
  attendance: SessionAttendance;
  participants: AttendanceRecord[];
  presentCount: number;
  error: PresenceErrorType | null;
  retry: () => void;
}

const EMPTY: SessionAttendance = { sessionId: "", participants: [], finalized: false };

export function useSessionPresence({ sessionId, participantId, participantName, role }: UseSessionPresenceArgs): SessionPresenceController {
  const factory = usePresenceProviderFactory();
  const providerRef = useRef<PresenceProvider | null>(null);

  const [connectionState, setConnectionState] = useState<PresenceConnectionState>("connecting");
  const [attendance, setAttendance] = useState<SessionAttendance>(EMPTY);
  const [error, setError] = useState<PresenceErrorType | null>(null);
  const [attempt, setAttempt] = useState(0);

  const identity = useRef({ participantId, participantName, role });
  identity.current = { participantId, participantName, role };

  useEffect(() => {
    let cancelled = false;
    const provider = factory();
    providerRef.current = provider;
    setError(null);
    setConnectionState("connecting");
    setAttendance(EMPTY);

    const events: PresenceEvents = {
      onConnectionState: (s) => {
        if (cancelled) return;
        setConnectionState(s);
        // Rejoining continues the SAME record (idempotent join in the provider).
        if (s === "connected") provider.participantJoined();
      },
      onParticipantJoined: () => !cancelled && setAttendance(provider.getPresence()),
      onParticipantLeft: () => !cancelled && setAttendance(provider.getPresence()),
      onHeartbeat: () => !cancelled && setAttendance(provider.getPresence()),
      onPresenceUpdated: (a) => !cancelled && setAttendance(a),
    };

    provider
      .connect({ sessionId, identity: identity.current, events })
      .then(() => {
        if (cancelled) return;
        provider.participantJoined(); // announce presence (idempotent)
        setAttendance(provider.getPresence());
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof PresenceError ? e : new PresenceError("provider_unavailable"));
        setConnectionState("failed");
      });

    const hb = setInterval(() => provider.heartbeat(), HEARTBEAT_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(hb);
      // Leaving updates presence, then detaches. (Session finalization is the
      // provider/domain's job, not the leaver's.)
      provider.participantLeft();
      void provider.disconnect();
      providerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factory, sessionId, participantId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const participants = attendance.participants;
  const presentCount = participants.filter((p) => p.currentlyPresent).length;

  return useMemo(
    () => ({ connectionState, attendance, participants, presentCount, error, retry }),
    [connectionState, attendance, participants, presentCount, error, retry]
  );
}
