// Captures the local speaker's spoken answers during a live session (browser STT,
// reusing the same SpeechProvider seam as the placement interview) and persists
// them to the session transcript, so the AI report evaluates the REAL conversation
// instead of an empty transcript. No audio leaves the browser — only recognized text.
import { useEffect, useRef } from "react";
import { getSpeechProvider } from "@/lib/speech";
import { sessionsApi } from "@/api";

type Segment = { text: string; speaker: string; at: string };

/**
 * @param sessionId  the room's session id (transcript target)
 * @param enabled    capture only for the participant whose speech we evaluate (student)
 * @param speaker    display name attached to each segment
 */
export function useSessionSpeechCapture(sessionId: string, enabled: boolean, speaker: string) {
  const segments = useRef<Segment[]>([]);
  const stopped = useRef(false);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    const provider = getSpeechProvider();
    if (!provider.isSupported()) return; // Firefox etc. → report falls back gracefully

    stopped.current = false;
    let saveTimer: ReturnType<typeof setTimeout> | null = null;

    // Persist the FULL accumulated list (AttachTranscript replaces content), so the
    // latest POST always holds the complete transcript when the instructor ends.
    const persist = () => {
      if (segments.current.length === 0) return;
      sessionsApi.saveNotes(sessionId, segments.current).catch(() => {});
    };
    const scheduleSave = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 1500);
    };

    // The provider settles one utterance at a time; restart to keep capturing.
    const listen = () => {
      if (stopped.current) return;
      provider.start({
        onResult: (text) => {
          const clean = text.trim();
          if (clean) {
            segments.current.push({ text: clean, speaker, at: new Date().toISOString() });
            scheduleSave();
          }
        },
        onError: (kind) => {
          // Hard errors (no mic / denied / unsupported) → stop retrying; transient
          // ones (no-speech, network, aborted) → keep listening.
          if (kind === "permission-denied" || kind === "not-supported" || kind === "mic-unavailable") {
            stopped.current = true;
          }
        },
        onEnd: () => {
          if (!stopped.current) setTimeout(listen, 300);
        },
      });
    };
    listen();

    return () => {
      stopped.current = true;
      try {
        provider.stop();
      } catch {
        /* ignore */
      }
      if (saveTimer) clearTimeout(saveTimer);
      persist(); // final flush before leaving
    };
  }, [sessionId, enabled, speaker]);
}
