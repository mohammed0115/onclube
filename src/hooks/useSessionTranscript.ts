// Live-transcript lifecycle hook — the single home for transcript orchestration.
// It connects, starts capture, seeds finalized segments for late joiners, merges
// incoming partial/final segments (ordered, de-duplicated, final-immutable), and
// handles reconnect. It ONLY captures/transports/presents — it never analyzes.
// The UI is pure presentation and only consumes this hook.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranscriptProviderFactory } from "@/lib/transcript";
import type {
  SpeakerRole,
  TranscriptConnectionState,
  TranscriptError as TranscriptErrorType,
  TranscriptEvents,
  TranscriptProvider,
  TranscriptSegment,
} from "@/lib/transcript";
import { TranscriptError } from "@/lib/transcript";

export interface UseSessionTranscriptArgs {
  sessionId: string;
  participantId: string;
  speakerName: string;
  role: SpeakerRole;
}

export interface SessionTranscriptController {
  connectionState: TranscriptConnectionState;
  segments: TranscriptSegment[];
  error: TranscriptErrorType | null;
  retry: () => void;
}

function order(map: Map<string, TranscriptSegment>): TranscriptSegment[] {
  return [...map.values()].sort(
    (a, b) => a.startedAt.localeCompare(b.startedAt) || a.segmentId.localeCompare(b.segmentId)
  );
}

export function useSessionTranscript({ sessionId, participantId, speakerName, role }: UseSessionTranscriptArgs): SessionTranscriptController {
  const factory = useTranscriptProviderFactory();
  const providerRef = useRef<TranscriptProvider | null>(null);

  const [connectionState, setConnectionState] = useState<TranscriptConnectionState>("connecting");
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [error, setError] = useState<TranscriptErrorType | null>(null);
  const [attempt, setAttempt] = useState(0);

  const identity = useRef({ participantId, speakerName, role });
  identity.current = { participantId, speakerName, role };

  // Merge: ordered by startedAt, de-duplicated by segmentId; a FINAL segment is
  // immutable, so later updates to it (duplicates/partials) are ignored.
  const merge = useCallback((seg: TranscriptSegment) => {
    setSegments((prev) => {
      const map = new Map(prev.map((s) => [s.segmentId, s]));
      const existing = map.get(seg.segmentId);
      if (existing?.isFinal) return prev; // immutable + duplicate suppression
      map.set(seg.segmentId, seg);
      return order(map);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const provider = factory();
    providerRef.current = provider;
    setError(null);
    setConnectionState("connecting");
    setSegments([]);

    const events: TranscriptEvents = {
      onConnectionState: (s) => !cancelled && setConnectionState(s),
      onSegmentReceived: (seg) => !cancelled && merge(seg),
      onPartialTranscript: (seg) => !cancelled && merge(seg),
      onFinalTranscript: (seg) => !cancelled && merge(seg),
      onError: (e) => !cancelled && setError(e),
    };

    provider
      .connect({ sessionId, identity: identity.current, events })
      .then(() => {
        if (cancelled) return;
        provider.start(); // begin capture (only assigned participants reach here)
        // Late join: seed with FINALIZED segments only.
        const seeded = new Map<string, TranscriptSegment>();
        provider.listSegments().forEach((s) => seeded.set(s.segmentId, s));
        setSegments(order(seeded));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof TranscriptError ? e : new TranscriptError("provider_unavailable"));
        setConnectionState("failed");
      });

    return () => {
      cancelled = true;
      provider.stop();
      void provider.disconnect();
      providerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factory, sessionId, participantId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return useMemo(
    () => ({ connectionState, segments, error, retry }),
    [connectionState, segments, error, retry]
  );
}
