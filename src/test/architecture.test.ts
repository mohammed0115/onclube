// Static architecture guards (Sprint 8.2).
//
// These assert the layering rules by scanning source — no browser Media APIs may
// appear in React pages, and getDisplayMedia/getUserMedia may live ONLY inside
// the video infrastructure adapter. This is what keeps screen sharing (and the
// whole video stack) provider-replaceable.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

function filesUnder(dir: string, exts = [".ts", ".tsx"]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full, exts));
    else if (exts.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

const MEDIA_APIS = ["getDisplayMedia", "getUserMedia", "navigator.mediaDevices"];

describe("Architecture — browser Media APIs stay inside infrastructure", () => {
  it("no React page calls a browser Media API", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(join(ROOT, "pages"))) {
      const src = readFileSync(file, "utf8");
      if (MEDIA_APIS.some((api) => src.includes(api))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("the VideoRoom presentation component calls no browser Media API", () => {
    const src = readFileSync(join(ROOT, "components/session/VideoRoom.tsx"), "utf8");
    expect(MEDIA_APIS.some((api) => src.includes(api))).toBe(false);
  });

  it("the useVideoRoom hook calls no browser Media API", () => {
    const src = readFileSync(join(ROOT, "hooks/useVideoRoom.ts"), "utf8");
    expect(MEDIA_APIS.some((api) => src.includes(api))).toBe(false);
  });

  it("getDisplayMedia / getUserMedia appear ONLY under src/lib/video (infrastructure)", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(ROOT)) {
      if (file.includes(`${ROOT}/lib/video`)) continue; // the allowed adapter home
      if (file.includes(`${ROOT}/test/`)) continue; // fakes/guards may reference the names
      const src = readFileSync(file, "utf8");
      if (src.includes("getDisplayMedia") || src.includes("getUserMedia")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

const TRANSPORT_APIS = ["WebSocket", "RTCDataChannel", "RTCPeerConnection", "EventSource"];

describe("Architecture — chat transports stay inside infrastructure", () => {
  it("no React page references a chat transport API", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(join(ROOT, "pages"))) {
      const src = readFileSync(file, "utf8");
      if (TRANSPORT_APIS.some((api) => src.includes(api))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("the ChatPanel presentation component imports no transport, hook, or SDK", () => {
    const src = readFileSync(join(ROOT, "components/session/ChatPanel.tsx"), "utf8");
    // Pure: no transport APIs, no lifecycle hook, no stub transport.
    expect(TRANSPORT_APIS.some((api) => src.includes(api))).toBe(false);
    expect(src.includes("useSessionChat")).toBe(false);
    expect(src.includes("stubTransport")).toBe(false);
    expect(src.includes("ChatTransport")).toBe(false); // no transport instance, type-only lives in the hook/container
  });

  it("useSessionChat is only consumed by the SessionChat container", () => {
    const consumers: string[] = [];
    for (const file of filesUnder(join(ROOT, "components")).concat(filesUnder(join(ROOT, "pages")))) {
      const src = readFileSync(file, "utf8");
      if (src.includes("useSessionChat")) consumers.push(file);
    }
    expect(consumers).toEqual([join(ROOT, "components/session/SessionChat.tsx")]);
  });

  it("transport primitives appear ONLY under src/lib (infrastructure), never in components/hooks/pages", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(ROOT)) {
      if (file.includes(`${ROOT}/lib/`)) continue; // infrastructure adapter homes
      if (file.includes(`${ROOT}/test/`)) continue;
      const src = readFileSync(file, "utf8");
      if (src.includes("new WebSocket") || src.includes("new RTCDataChannel") || src.includes(".createDataChannel")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

describe("Architecture — Canvas manipulation stays inside the whiteboard provider", () => {
  it("no React page manipulates a Canvas", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(join(ROOT, "pages"))) {
      const src = readFileSync(file, "utf8");
      if (src.includes("getContext") || src.includes("CanvasRenderingContext")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("the WhiteboardPanel presentation component performs no canvas work and no hook/provider logic", () => {
    const src = readFileSync(join(ROOT, "components/session/WhiteboardPanel.tsx"), "utf8");
    expect(src.includes("getContext")).toBe(false);
    expect(src.includes("useWhiteboard")).toBe(false);
    expect(src.includes("stubProvider")).toBe(false);
    expect(src.includes("WhiteboardProvider")).toBe(false);
  });

  it("useWhiteboard is only consumed by the SessionWhiteboard container", () => {
    const consumers: string[] = [];
    for (const file of filesUnder(join(ROOT, "components")).concat(filesUnder(join(ROOT, "pages")))) {
      const src = readFileSync(file, "utf8");
      if (src.includes("useWhiteboard")) consumers.push(file);
    }
    expect(consumers).toEqual([join(ROOT, "components/session/SessionWhiteboard.tsx")]);
  });

  it("getContext appears ONLY under src/lib/whiteboard (infrastructure)", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(ROOT)) {
      if (file.includes(`${ROOT}/lib/whiteboard`)) continue; // the allowed adapter home
      if (file.includes(`${ROOT}/test/`)) continue;
      const src = readFileSync(file, "utf8");
      if (src.includes(".getContext(")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

const FILE_APIS = ["FileReader", "createObjectURL", "dataTransfer", "new File(", ".arrayBuffer("];

describe("Architecture — browser File APIs stay inside the provider/hook", () => {
  it("no React page manipulates a browser File API", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(join(ROOT, "pages"))) {
      const src = readFileSync(file, "utf8");
      if (FILE_APIS.some((api) => src.includes(api))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("the FilePanel presentation component performs no File work and no hook/provider logic", () => {
    const src = readFileSync(join(ROOT, "components/session/FilePanel.tsx"), "utf8");
    expect(FILE_APIS.some((api) => src.includes(api))).toBe(false);
    expect(src.includes("useSessionFiles")).toBe(false);
    expect(src.includes("stubProvider")).toBe(false);
    expect(src.includes("FileSharingProvider")).toBe(false);
  });

  it("useSessionFiles is only consumed by the SessionFiles container", () => {
    const consumers: string[] = [];
    for (const file of filesUnder(join(ROOT, "components")).concat(filesUnder(join(ROOT, "pages")))) {
      const src = readFileSync(file, "utf8");
      if (src.includes("useSessionFiles")) consumers.push(file);
    }
    expect(consumers).toEqual([join(ROOT, "components/session/SessionFiles.tsx")]);
  });

  it("URL.createObjectURL appears ONLY under src/lib/files (infrastructure)", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(ROOT)) {
      if (file.includes(`${ROOT}/lib/files`)) continue; // the allowed adapter home
      if (file.includes(`${ROOT}/test/`)) continue;
      const src = readFileSync(file, "utf8");
      if (src.includes("createObjectURL")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

describe("Architecture — participant signaling stays inside the provider/hook", () => {
  it("no React page references a signaling transport API", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(join(ROOT, "pages"))) {
      const src = readFileSync(file, "utf8");
      if (TRANSPORT_APIS.some((api) => src.includes(api))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("the ReactionControls presentation component imports no hook, provider, or transport", () => {
    const src = readFileSync(join(ROOT, "components/session/ReactionControls.tsx"), "utf8");
    expect(TRANSPORT_APIS.some((api) => src.includes(api))).toBe(false);
    expect(src.includes("useParticipantSignals")).toBe(false);
    expect(src.includes("ParticipantSignalProvider")).toBe(false);
    expect(src.includes("stubProvider")).toBe(false);
  });

  it("useParticipantSignals is only consumed by the SessionSignals container", () => {
    const consumers: string[] = [];
    for (const file of filesUnder(join(ROOT, "components")).concat(filesUnder(join(ROOT, "pages")))) {
      const src = readFileSync(file, "utf8");
      if (src.includes("useParticipantSignals")) consumers.push(file);
    }
    expect(consumers).toEqual([join(ROOT, "components/session/SessionSignals.tsx")]);
  });
});

describe("Architecture — recording stays inside the provider/hook", () => {
  it("no React page imports the recording infrastructure", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(join(ROOT, "pages"))) {
      const src = readFileSync(file, "utf8");
      if (src.includes("@/lib/recording") || src.includes("useSessionRecording") || src.includes("RecordingProvider")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("the RecordingControls presentation component imports no hook, provider, or SDK", () => {
    const src = readFileSync(join(ROOT, "components/session/RecordingControls.tsx"), "utf8");
    expect(src.includes("useSessionRecording")).toBe(false);
    expect(src.includes("RecordingProvider")).toBe(false);
    expect(src.includes("stubProvider")).toBe(false);
  });

  it("useSessionRecording is only consumed by the SessionRecording container", () => {
    const consumers: string[] = [];
    for (const file of filesUnder(join(ROOT, "components")).concat(filesUnder(join(ROOT, "pages")))) {
      const src = readFileSync(file, "utf8");
      if (src.includes("useSessionRecording")) consumers.push(file);
    }
    expect(consumers).toEqual([join(ROOT, "components/session/SessionRecording.tsx")]);
  });
});

describe("Architecture — attendance/presence stays inside the provider/hook", () => {
  it("no React page imports the presence infrastructure or calculates attendance", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(join(ROOT, "pages"))) {
      const src = readFileSync(file, "utf8");
      if (src.includes("@/lib/presence") || src.includes("useSessionPresence") || src.includes("PresenceProvider")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("the PresenceList / AttendanceSummary presentation components import no hook or provider", () => {
    for (const name of ["PresenceList", "AttendanceSummary"]) {
      const src = readFileSync(join(ROOT, `components/session/${name}.tsx`), "utf8");
      expect(src.includes("useSessionPresence")).toBe(false);
      expect(src.includes("PresenceProvider")).toBe(false);
      expect(src.includes("stubProvider")).toBe(false);
    }
  });

  it("useSessionPresence is only consumed by the SessionPresence container", () => {
    const consumers: string[] = [];
    for (const file of filesUnder(join(ROOT, "components")).concat(filesUnder(join(ROOT, "pages")))) {
      const src = readFileSync(file, "utf8");
      if (src.includes("useSessionPresence")) consumers.push(file);
    }
    expect(consumers).toEqual([join(ROOT, "components/session/SessionPresence.tsx")]);
  });
});

describe("Architecture — live transcript (STT) stays inside the provider/hook", () => {
  it("no React page imports the transcript infrastructure or an STT SDK", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(join(ROOT, "pages"))) {
      const src = readFileSync(file, "utf8");
      if (src.includes("@/lib/transcript") || src.includes("useSessionTranscript") || src.includes("TranscriptProvider")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("the TranscriptPanel presentation component imports no hook, provider, or SDK", () => {
    const src = readFileSync(join(ROOT, "components/session/TranscriptPanel.tsx"), "utf8");
    expect(src.includes("useSessionTranscript")).toBe(false);
    expect(src.includes("TranscriptProvider")).toBe(false);
    expect(src.includes("stubProvider")).toBe(false);
  });

  it("useSessionTranscript is only consumed by the SessionTranscript container", () => {
    const consumers: string[] = [];
    for (const file of filesUnder(join(ROOT, "components")).concat(filesUnder(join(ROOT, "pages")))) {
      const src = readFileSync(file, "utf8");
      if (src.includes("useSessionTranscript")) consumers.push(file);
    }
    expect(consumers).toEqual([join(ROOT, "components/session/SessionTranscript.tsx")]);
  });
});

describe("Architecture — AI report generation stays server-side (Sprint 9)", () => {
  it("no React page imports an LLM SDK or generates a report", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(join(ROOT, "pages"))) {
      const src = readFileSync(file, "utf8").toLowerCase();
      if (["from \"openai\"", "from 'openai'", "@anthropic", "generatereport", "buildprompt"].some((t) => src.includes(t))) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the AI report page renders the DTO only — no prompt/provider/raw references in source", () => {
    const src = readFileSync(join(ROOT, "pages/student/AIReportPage.tsx"), "utf8").toLowerCase();
    for (const banned of ["prompt", "apikey", "providername", "systemmessage", "openai"]) {
      expect(src).not.toContain(banned);
    }
  });
});

describe("Architecture — production provider integration (Sprint 10)", () => {
  const PROD_ADAPTERS = ["wsTransport", "wsProvider", "httpProvider", "agoraProvider", "cloudProvider"];

  it("native WebSocket is constructed ONLY inside the wsClient primitive", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(ROOT)) {
      if (file.endsWith("lib/net/wsClient.ts")) continue; // the allowed home
      if (file.includes(`${ROOT}/test/`)) continue;
      const src = readFileSync(file, "utf8");
      if (src.includes("new WebSocket(")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("the Agora SDK specifier appears ONLY inside the video adapter (lazy, optional)", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(ROOT)) {
      if (file.endsWith("lib/video/agoraProvider.ts")) continue;
      if (file.includes(`${ROOT}/test/`)) continue;
      const src = readFileSync(file, "utf8");
      if (src.includes("agora-rtc-sdk-ng")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("production adapters are imported ONLY by the composition root (@/lib/providers)", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(join(ROOT, "pages")).concat(filesUnder(join(ROOT, "components")), filesUnder(join(ROOT, "hooks")))) {
      const src = readFileSync(file, "utf8");
      if (PROD_ADAPTERS.some((a) => src.includes(`/${a}"`) || src.includes(`/${a}'`))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("provider selection lives only in the composition root", () => {
    const consumers: string[] = [];
    for (const file of filesUnder(ROOT)) {
      if (file.includes(`${ROOT}/test/`)) continue;
      const src = readFileSync(file, "utf8");
      if (src.includes("resolveProviders")) consumers.push(file);
    }
    // Only the composition root + the app-root wiring reference selection.
    expect(consumers.sort()).toEqual(
      [join(ROOT, "lib/providers.ts"), join(ROOT, "app/LiveSessionProviders.tsx")].sort()
    );
  });
});
