import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Static architecture guard (Sprint 2.0.1A): the placement-interview frontend
// modules must contain NO LLM/prompt code, and must not call the browser speech
// APIs directly — those live only in the provider adapters (voice.ts / speech.ts).

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");
const read = (rel: string) => readFileSync(resolve(SRC, rel), "utf8");

const INTERVIEW_MODULES = [
  "components/placement/interview/TutorInterview.tsx",
  "components/placement/interview/machine.ts",
  "components/placement/interview/ReadinessScreen.tsx",
  "components/placement/interview/Timeline.tsx",
];

const LLM_MARKERS = [/openai/i, /anthropic/i, /gemini/i, /\bllm\b/i, /chat\.completions/i, /promptbuilder/i, /system_?message/i];

describe("interview frontend — no LLM / prompt code", () => {
  for (const mod of INTERVIEW_MODULES) {
    it(`${mod} references no LLM/prompt code`, () => {
      const src = read(mod);
      for (const re of LLM_MARKERS) expect(src).not.toMatch(re);
    });
  }
});

describe("interview frontend — browser speech APIs only in provider adapters", () => {
  it("interview components do not call speechSynthesis or SpeechRecognition directly", () => {
    for (const mod of INTERVIEW_MODULES) {
      const src = read(mod);
      expect(src).not.toMatch(/speechSynthesis/);
      expect(src).not.toMatch(/webkitSpeechRecognition|new\s+SpeechRecognition/);
    }
  });

  it("browser TTS is confined to the voice provider adapter", () => {
    expect(read("lib/voice.ts")).toMatch(/speechSynthesis/);
  });

  it("browser speech recognition is confined to the speech provider adapter", () => {
    expect(read("lib/speech.ts")).toMatch(/webkitSpeechRecognition|SpeechRecognition/);
  });
});
