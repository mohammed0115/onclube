// Session-recording lifecycle hook — the single home for recording business
// logic. Owns connect/disconnect (which does NOT stop an active recording),
// instructor-guarded + idempotent start/stop/cancel, the elapsed timer, late-join
// state, and reconnect. The UI is pure presentation and only consumes this hook.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecordingProviderFactory } from "@/lib/recording";
import type {
  Recording,
  RecordingConnectionState,
  RecordingError as RecordingErrorType,
  RecordingErrorCode,
  RecordingEvents,
  RecordingProvider,
  RecordingStatus,
} from "@/lib/recording";
import { RecordingError } from "@/lib/recording";

export interface UseSessionRecordingArgs {
  sessionId: string;
  participantId: string;
  /** Only the assigned instructor may control recording. */
  canControl: boolean;
}

export interface SessionRecordingController {
  connectionState: RecordingConnectionState;
  recording: Recording | null;
  status: RecordingStatus;
  isRecording: boolean;
  canControl: boolean;
  elapsedSeconds: number;
  error: RecordingErrorType | null;
  start: () => void;
  stop: () => void;
  cancel: () => void;
  retry: () => void;
}

function elapsedFrom(startedAt: string | null): number {
  if (!startedAt) return 0;
  return Math.max(0, Math.round((Date.now() - Date.parse(startedAt)) / 1000));
}

export function useSessionRecording({ sessionId, participantId, canControl }: UseSessionRecordingArgs): SessionRecordingController {
  const factory = useRecordingProviderFactory();
  const providerRef = useRef<RecordingProvider | null>(null);

  const [connectionState, setConnectionState] = useState<RecordingConnectionState>("connecting");
  const [recording, setRecording] = useState<Recording | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<RecordingErrorType | null>(null);
  const [attempt, setAttempt] = useState(0);

  const status: RecordingStatus = recording?.status ?? "idle";
  // Synchronous mirror so start/stop are idempotent across rapid calls.
  const statusRef = useRef<RecordingStatus>("idle");
  statusRef.current = status;

  useEffect(() => {
    let cancelled = false;
    const provider = factory();
    providerRef.current = provider;
    setError(null);
    setConnectionState("connecting");

    const events: RecordingEvents = {
      onConnectionState: (s) => !cancelled && setConnectionState(s),
      onRecordingStarted: (r) => {
        if (cancelled) return;
        setRecording(r);
        setElapsedSeconds(elapsedFrom(r.startedAt));
      },
      onRecordingStopped: (r) => !cancelled && setRecording(r), // → processing
      onRecordingUploaded: (r) => !cancelled && setRecording(r), // → completed
      onRecordingFailed: ({ code }) => {
        if (cancelled) return;
        setRecording((prev) => (prev ? { ...prev, status: "failed" } : prev));
        setError(new RecordingError(code));
      },
      onRecordingCancelled: () => !cancelled && setRecording((prev) => (prev ? { ...prev, status: "cancelled" } : prev)),
    };

    provider
      .connect({ sessionId, identity: { participantId }, events })
      .then(() => {
        if (cancelled) return;
        // Late join: reflect any in-progress recording — never (re)start it.
        const state = provider.getRecordingState();
        if (state) {
          setRecording(state);
          setElapsedSeconds(elapsedFrom(state.startedAt));
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof RecordingError ? e : new RecordingError("provider_unavailable"));
        setConnectionState("failed");
      });

    return () => {
      cancelled = true;
      // Leaving the session does NOT stop recording — just detach the controller.
      void provider.disconnect();
      providerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factory, sessionId, participantId, attempt]);

  // Elapsed timer — ticks only while actively recording.
  useEffect(() => {
    if (status !== "recording") return;
    const t = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  const run = useCallback((fn: () => Promise<unknown>, code: RecordingErrorCode) => {
    fn().catch(() => setError(new RecordingError(code)));
  }, []);

  const start = useCallback(() => {
    if (!canControl) return; // students/admin can never control
    if (statusRef.current === "recording" || statusRef.current === "processing") return; // idempotent / single active
    statusRef.current = "recording"; // optimistic guard against rapid double-start
    run(() => providerRef.current!.startRecording(), "start_failed");
  }, [canControl, run]);

  const stop = useCallback(() => {
    if (!canControl) return;
    if (statusRef.current !== "recording") return; // idempotent
    statusRef.current = "processing"; // optimistic guard against rapid double-stop
    run(() => providerRef.current!.stopRecording(), "stop_failed");
  }, [canControl, run]);

  const cancel = useCallback(() => {
    if (!canControl) return;
    if (statusRef.current !== "recording") return;
    statusRef.current = "cancelled";
    run(() => providerRef.current!.cancelRecording(), "stop_failed");
  }, [canControl, run]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return useMemo(
    () => ({
      connectionState,
      recording,
      status,
      isRecording: status === "recording",
      canControl,
      elapsedSeconds,
      error,
      start,
      stop,
      cancel,
      retry,
    }),
    [connectionState, recording, status, canControl, elapsedSeconds, error, start, stop, cancel, retry]
  );
}
