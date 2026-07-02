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

/** Abstract speech-recognition provider. Implementations must not leak their SDK. */
export interface SpeechProvider {
  isSupported(): boolean;
  start(handlers: SpeechHandlers): void;
  stop(): void;
  abort(): void;
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

  return {
    isSupported() {
      return !!Ctor;
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
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.continuous = false;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
          const transcript = Array.from(event.results ?? [])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((r: any) => r?.[0]?.transcript ?? "")
            .join(" ")
            .trim();
          handlers.onResult(transcript);
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onerror = (event: any) => handlers.onError(mapErrorCode(event?.error));
        recognition.onend = () => handlers.onEnd();

        recognition.start();
      } catch {
        handlers.onError("unknown");
        handlers.onEnd();
      }
    },
    stop() {
      try {
        recognition?.stop();
      } catch {
        /* ignore */
      }
    },
    abort() {
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
