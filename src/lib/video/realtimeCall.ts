// Infrastructure adapter: the live AI-tutor voice call over WebRTC.
//
// This is the ONLY place the browser media/transport primitives for the AI tutor
// live — getUserMedia + RTCPeerConnection + a data channel — per the architecture
// rules (see src/test/architecture.test.ts). Pages/hooks drive it through the
// returned controller and the handler callbacks; they never touch WebRTC directly.
//
// The audio path is browser ↔ OpenAI Realtime. We only relay the one-shot SDP
// offer/answer through our backend (sdpRelay) so the ephemeral token stays safe
// and CORS/CSP can't break the handshake.

export interface RealtimeEvent {
  type?: string;
  delta?: string;
  transcript?: string;
  [k: string]: unknown;
}

export interface RealtimeCallHandlers {
  /** Realtime events from OpenAI's data channel (transcripts, VAD, response state). */
  onEvent?: (ev: RealtimeEvent) => void;
  /** The tutor's remote audio stream — attach it to an <audio> element to hear it. */
  onRemoteStream?: (stream: MediaStream) => void;
  /** The connection dropped after it was established. */
  onDrop?: () => void;
}

export interface RealtimeCall {
  setMuted(muted: boolean): void;
  end(): void;
}

/** SDP relay: POST the browser's offer to our backend, get OpenAI's answer SDP. */
export type SdpRelay = (offerSdp: string, clientSecret: string) => Promise<string>;

function waitForIce(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const done = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", done);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", done);
    setTimeout(resolve, 1500); // don't wait forever for trickle to finish
  });
}

/**
 * Establish the live voice call. Resolves once media is connected; rejects if the
 * mic is blocked or the handshake fails (the caller shows the error).
 */
export async function startRealtimeCall(
  clientSecret: string,
  sdpRelay: SdpRelay,
  handlers: RealtimeCallHandlers,
): Promise<RealtimeCall> {
  const mic = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  const pc = new RTCPeerConnection();
  pc.ontrack = (e) => { if (e.streams[0]) handlers.onRemoteStream?.(e.streams[0]); };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
      handlers.onDrop?.();
    }
  };

  const dc = pc.createDataChannel("oai-events");

  // ── Make the tutor greet FIRST instead of waiting for the student ──────────────
  // Server VAD stays silent until the student speaks, so we explicitly ask the model
  // for its opening response. Two robustness details learned the hard way:
  //   1. Fire on `session.created`/`session.updated` (session is configured
  //      server-side) — sending on `dc.onopen` alone is often too early and the
  //      opening is dropped, leaving the student staring at a silent screen.
  //   2. A watchdog re-sends the opening a few times if no tutor audio arrives.
  const OPENING_WATCHDOG_MS = 2500;
  const OPENING_MAX_RETRIES = 4;
  let openingSent = false;
  let tutorHasSpoken = false;
  let openingWatchdog: ReturnType<typeof setTimeout> | null = null;

  const clearOpeningWatchdog = () => {
    if (openingWatchdog) { clearTimeout(openingWatchdog); openingWatchdog = null; }
  };
  const sendOpening = (retries: number) => {
    if (dc.readyState !== "open") return;
    // GA Realtime rejects `response.modalities`; the session is already audio-configured,
    // and the opening line lives in the system prompt, so an empty response is enough.
    try { dc.send(JSON.stringify({ type: "response.create", response: {} })); } catch { return; }
    clearOpeningWatchdog();
    openingWatchdog = setTimeout(() => {
      openingWatchdog = null;
      if (tutorHasSpoken || dc.readyState !== "open" || retries >= OPENING_MAX_RETRIES) return;
      sendOpening(retries + 1);
    }, OPENING_WATCHDOG_MS);
  };
  const maybeSendOpening = () => {
    if (openingSent || dc.readyState !== "open") return;
    openingSent = true;
    sendOpening(0);
  };

  dc.onmessage = (e) => {
    let ev: RealtimeEvent | null = null;
    try { ev = JSON.parse(e.data) as RealtimeEvent; } catch { return; /* ignore non-JSON */ }
    const t = ev?.type || "";
    // Session is configured → safe to request the opening greeting.
    if (t === "session.created" || t === "session.updated") maybeSendOpening();
    // Any sign the tutor is actually producing audio cancels the watchdog.
    if (t === "output_audio_buffer.started" || t.endsWith("audio.delta") || t.endsWith("audio_transcript.delta")) {
      tutorHasSpoken = true;
      clearOpeningWatchdog();
    }
    handlers.onEvent?.(ev);
  };
  // Fallback: if we somehow miss session.created, still kick off once the channel opens.
  dc.onopen = () => { maybeSendOpening(); };

  mic.getTracks().forEach((track) => pc.addTrack(track, mic));

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIce(pc);

  const answerSdp = await sdpRelay(pc.localDescription?.sdp || offer.sdp || "", clientSecret);
  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

  return {
    setMuted(muted: boolean) {
      mic.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    },
    end() {
      clearOpeningWatchdog();
      try { dc.close(); } catch { /* noop */ }
      try { pc.close(); } catch { /* noop */ }
      mic.getTracks().forEach((t) => t.stop());
    },
  };
}
