// Tutor voice (text-to-speech) provider seam.
//
// The interview UI depends ONLY on the abstract `TutorVoiceProvider` interface —
// never on the browser SpeechSynthesis API directly. This keeps the UI testable
// (tests inject a fake) and lets a server/cloud TTS adapter plug in later behind
// the same interface:
//
//   TutorVoiceProvider
//     ↳ BrowserTtsProvider   (now — browser SpeechSynthesis, dev fallback)
//     ↳ CloudTtsProvider     (future — server-minted audio; keys stay server-side)
//
// No provider secrets ever reach the browser here.

export type VoiceState = "idle" | "speaking" | "paused";

export interface VoiceInfo {
  id: string;
  name: string;
  lang: string;
}

export interface SpeakHandlers {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}

export interface TutorVoiceProvider {
  isSupported(): boolean;
  listVoices(): VoiceInfo[];
  /** Speak `text`. Resolves via handlers; safe to call repeatedly (cancels prior). */
  speak(text: string, handlers?: SpeakHandlers): void;
  stop(): void;
  pause(): void;
  resume(): void;
  getState(): VoiceState;
}

const RATE = 0.8; // calm, natural pace

/** Choose the most natural English voice the browser offers. */
function pickNaturalVoice(): SpeechSynthesisVoice | null {
  try {
    const voices = window.speechSynthesis?.getVoices?.() ?? [];
    if (!voices.length) return null;
    const en = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
    const pool = en.length ? en : voices;
    const score = (v: SpeechSynthesisVoice) => {
      const n = v.name.toLowerCase();
      if (/(natural|neural)/.test(n)) return 6;
      if (n.includes("google")) return 5;
      if (/(samantha|aria|jenny|zira|libby|sonia|ava|serena|allison)/.test(n)) return 4;
      if (/en-us/i.test(v.lang)) return 3;
      if (!v.localService) return 2;
      return 1;
    };
    return [...pool].sort((a, b) => score(b) - score(a))[0] ?? null;
  } catch {
    return null;
  }
}

/** Browser SpeechSynthesis adapter. The ONLY place that touches `speechSynthesis`. */
export const browserTtsProvider: TutorVoiceProvider = (() => {
  let state: VoiceState = "idle";

  // Warm up the (sometimes async) voice list.
  try {
    const s = window?.speechSynthesis;
    s?.getVoices();
    if (s && "onvoiceschanged" in s) s.onvoiceschanged = () => s.getVoices();
  } catch {
    /* ignore */
  }

  return {
    isSupported() {
      return typeof window !== "undefined" && !!window.speechSynthesis && typeof SpeechSynthesisUtterance !== "undefined";
    },
    listVoices() {
      try {
        return (window.speechSynthesis?.getVoices?.() ?? []).map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang }));
      } catch {
        return [];
      }
    },
    speak(text: string, handlers: SpeakHandlers = {}) {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        state = "idle";
        (ok ? handlers.onEnd : handlers.onError)?.();
      };
      // Safety timeout: some engines never fire onend — proceed anyway so the
      // interview flow can't hang waiting on TTS.
      const estimateMs = Math.min(12000, Math.max(1600, text.split(/\s+/).length * 460));
      const timer = setTimeout(() => finish(true), estimateMs);
      try {
        const synth = window.speechSynthesis;
        if (!synth) {
          clearTimeout(timer);
          return finish(false);
        }
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const v = pickNaturalVoice();
        if (v) u.voice = v;
        u.lang = v?.lang || "en-US";
        u.rate = RATE;
        u.pitch = 1;
        u.onstart = () => {
          state = "speaking";
          handlers.onStart?.();
        };
        u.onend = () => {
          clearTimeout(timer);
          finish(true);
        };
        u.onerror = () => {
          clearTimeout(timer);
          finish(false);
        };
        state = "speaking";
        synth.speak(u);
      } catch {
        clearTimeout(timer);
        finish(false);
      }
    },
    stop() {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
      state = "idle";
    },
    pause() {
      try {
        window.speechSynthesis?.pause();
        state = "paused";
      } catch {
        /* ignore */
      }
    },
    resume() {
      try {
        window.speechSynthesis?.resume();
        state = "speaking";
      } catch {
        /* ignore */
      }
    },
    getState() {
      return state;
    },
  };
})();

let active: TutorVoiceProvider = browserTtsProvider;
export const getTutorVoiceProvider = (): TutorVoiceProvider => active;
export const setTutorVoiceProvider = (p: TutorVoiceProvider): void => {
  active = p;
};
export const resetTutorVoiceProvider = (): void => {
  active = browserTtsProvider;
};
