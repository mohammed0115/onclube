// Speech-recognition provider seam.
//
// Business logic (the interview UI) depends ONLY on the abstract `SpeechProvider`
// interface — never directly on the browser Web Speech API. The active provider
// is swappable, which keeps the UI testable (tests inject a fake) and lets other
// engines plug in later behind the same interface:
//
//   SpeechProvider
//     ↳ WebSpeechProvider   (now — browser Web Speech API)
//     ↳ AzureSpeechProvider  (future)
//     ↳ GoogleSpeechProvider (future)
//     ↳ WhisperProvider      (future)
//     ↳ DeepgramProvider     (future)
//
// No audio leaves the browser here — only the recognized transcript text. No
// pronunciation scoring.

export type SpeechErrorKind =
  | "not-supported"
  | "permission-denied"
  | "mic-unavailable"
  | "no-speech" // silence / timeout
  | "network"
  | "aborted"
  | "unknown";

export interface SpeechHandlers {
  /** Final recognized transcript for the utterance. */
  onResult: (transcript: string) => void;
  /** Recognition failed — the UI should offer a manual fallback. */
  onError: (kind: SpeechErrorKind) => void;
  /** Recognition session ended (after result or error). */
  onEnd: () => void;
}

export type RecognitionState = "idle" | "listening";

/** Abstract speech-recognition provider. Implementations must not leak their SDK.
 * The interview UI depends ONLY on this interface — never on the browser Web Speech
 * API directly — so a server/cloud STT adapter can replace it later. */
export interface SpeechProvider {
  isSupported(): boolean;
  start(handlers: SpeechHandlers): void;
  /** Stop and emit whatever transcript was captured. */
  stop(): void;
  /** Abort with no result (alias: cancel). */
  abort(): void;
  cancel(): void;
  getState(): RecognitionState;
}

function mapErrorCode(code: string | undefined): SpeechErrorKind {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "permission-denied";
    case "audio-capture":
      return "mic-unavailable";
    case "no-speech":
      return "no-speech";
    case "network":
      return "network";
    case "aborted":
      return "aborted";
    default:
      return "unknown";
  }
}

/** Concrete provider over the browser Web Speech API. */
export const webSpeechProvider: SpeechProvider = (() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = (typeof window !== "undefined" ? (window as any) : undefined) ?? {};
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let recognition: any = null;
  let state: RecognitionState = "idle";

  return {
    isSupported() {
      return !!Ctor;
    },
    getState() {
      return state;
    },
    cancel() {
      this.abort();
    },
    start(handlers: SpeechHandlers) {
      if (!Ctor) {
        handlers.onError("not-supported");
        handlers.onEnd();
        return;
      }
      try {
        recognition = new Ctor();
        recognition.lang = "en-US";
        // Continuous + interim so we capture the WHOLE spoken answer, not just the
        // first word before a natural pause. We accumulate final chunks and only
        // hand the transcript up once the speaker has been silent for a moment.
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.continuous = true;

        const SILENCE_MS = 2200; // stop only after a clear pause (tolerates mid-sentence pauses)
        const START_MS = 10000; // grace period to begin speaking
        const MAX_MS = 60000; // hard cap on one answer

        // Full transcript rebuilt from ALL segments on every event (final + interim),
        // so nothing is lost — even a trailing segment the engine hasn't finalized.
        let fullTranscript = "";
        let settled = false;
        let restarts = 0; // bounded auto-restarts if the engine ends while still talking
        let lastActivity = 0;
        let silenceTimer: ReturnType<typeof setTimeout> | null = null;
        let maxTimer: ReturnType<typeof setTimeout> | null = null;

        let forceTimer: ReturnType<typeof setTimeout> | null = null;
        const clearTimers = () => {
          if (silenceTimer) clearTimeout(silenceTimer);
          if (maxTimer) clearTimeout(maxTimer);
          if (forceTimer) clearTimeout(forceTimer);
          silenceTimer = maxTimer = forceTimer = null;
        };
        // Emit the final transcript exactly once.
        const settle = () => {
          if (settled) return;
          settled = true;
          state = "idle";
          clearTimers();
          const clean = fullTranscript.trim();
          if (clean) handlers.onResult(clean);
          else handlers.onError("no-speech");
        };
        // On a pause, ask the engine to FINALIZE (stop) rather than reading mid-flight.
        // Chrome then fires a final onresult (with the last word) and onend, where we
        // settle — so trailing words like "Kamal" are never dropped. A safety timer
        // settles anyway if onend never arrives.
        const finish = () => {
          if (settled) return;
          try {
            recognition.stop();
          } catch {
            return settle();
          }
          if (forceTimer) clearTimeout(forceTimer);
          forceTimer = setTimeout(settle, 1500);
        };
        const armSilence = (ms: number) => {
          if (silenceTimer) clearTimeout(silenceTimer);
          silenceTimer = setTimeout(finish, ms);
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
          // Rebuild the WHOLE transcript from every result (cumulative), so we keep
          // all words including a not-yet-finalized trailing segment.
          let full = "";
          for (let i = 0; i < event.results.length; i++) {
            full += event.results[i]?.[0]?.transcript ?? "";
          }
          if (full.trim()) fullTranscript = full;
          lastActivity = Date.now();
          // Speech is ongoing — reset the silence countdown.
          armSilence(SILENCE_MS);
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onerror = (event: any) => {
          if (settled) return;
          settled = true;
          state = "idle";
          clearTimers();
          handlers.onError(mapErrorCode(event?.error));
        };
        recognition.onend = () => {
          if (settled) return;
          // The engine can auto-end after a short pause even in continuous mode. If
          // the learner was recently speaking, restart to keep capturing (bounded);
          // otherwise settle with everything captured so far.
          const recentlySpoke = lastActivity > 0 && Date.now() - lastActivity < 1500;
          if (recentlySpoke && restarts < 4) {
            restarts += 1;
            try {
              recognition.start();
              return;
            } catch {
              /* fall through to settle */
            }
          }
          settle();
          handlers.onEnd();
        };

        recognition.start();
        state = "listening";
        armSilence(START_MS); // give them time to begin
        maxTimer = setTimeout(settle, MAX_MS);
      } catch {
        state = "idle";
        handlers.onError("unknown");
        handlers.onEnd();
      }
    },
    stop() {
      // Explicit stop → finish and submit what we have (onend triggers settle).
      try {
        recognition?.stop();
      } catch {
        /* ignore */
      }
    },
    abort() {
      state = "idle";
      try {
        recognition?.abort();
      } catch {
        /* ignore */
      }
    },
  };
})();

let active: SpeechProvider = webSpeechProvider;

export const getSpeechProvider = (): SpeechProvider => active;
export const setSpeechProvider = (provider: SpeechProvider): void => {
  active = provider;
};
export const resetSpeechProvider = (): void => {
  active = webSpeechProvider;
};
