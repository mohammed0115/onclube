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
  dc.onmessage = (e) => {
    try { handlers.onEvent?.(JSON.parse(e.data) as RealtimeEvent); } catch { /* ignore non-JSON */ }
  };

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
      try { dc.close(); } catch { /* noop */ }
      try { pc.close(); } catch { /* noop */ }
      mic.getTracks().forEach((t) => t.stop());
    },
  };
}
