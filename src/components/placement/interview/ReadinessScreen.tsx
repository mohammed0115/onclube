import { useEffect, useRef, useState } from "react";
import { Mic, Volume2, Wifi, ShieldCheck, Waypoints, Check, AlertTriangle, X, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getSpeechProvider } from "@/lib/speech";
import { getTutorVoiceProvider } from "@/lib/voice";
import { cn } from "@/lib/utils";
import type { Action, Phase } from "./machine";

type Level = "ready" | "warning" | "blocked" | "checking";

interface CheckRow {
  key: string;
  label: string;
  icon: React.ReactNode;
  level: Level;
  detail: string;
}

/** Pre-interview readiness screen. Checks mic support/permission, speaker (TTS),
 * speech recognition, and network — then requires an explicit Start Interview.
 * A hard block (offline) prevents Start; voice gaps are warnings (manual fallback). */
export function ReadinessScreen({ phase, isResume, dispatch }: { phase: Phase; isResume: boolean; dispatch: React.Dispatch<Action> }) {
  const [rows, setRows] = useState<CheckRow[]>(() => initialRows());
  const [voiceOk, setVoiceOk] = useState(true);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const ttsOk = safe(() => getTutorVoiceProvider().isSupported());
      const sttOk = safe(() => getSpeechProvider().isSupported());
      const network: Level = navigator.onLine ? "ready" : "blocked";

      let micLevel: Level = "warning";
      let micDetail = "We couldn't confirm a microphone — you can type your answers instead.";
      try {
        const devices = await navigator.mediaDevices?.enumerateDevices?.();
        if (devices?.some((d) => d.kind === "audioinput")) {
          micLevel = "ready";
          micDetail = "Microphone detected.";
        }
      } catch {
        /* keep warning */
      }

      let permLevel: Level = "warning";
      let permDetail = "You'll be asked for microphone access when recording starts.";
      try {
        // Permissions API is best-effort; not all browsers support 'microphone'.
        const status = await navigator.permissions?.query?.({ name: "microphone" as PermissionName });
        if (status?.state === "granted") { permLevel = "ready"; permDetail = "Microphone permission granted."; }
        else if (status?.state === "denied") { permLevel = "warning"; permDetail = "Microphone is blocked — allow it, or type your answers."; }
      } catch {
        /* keep warning */
      }

      const next: CheckRow[] = [
        { key: "mic", label: "Microphone", icon: <Mic size={16} />, level: micLevel, detail: micDetail },
        { key: "perm", label: "Microphone permission", icon: <ShieldCheck size={16} />, level: permLevel, detail: permDetail },
        { key: "tts", label: "Speaker / voice playback", icon: <Volume2 size={16} />, level: ttsOk ? "ready" : "warning", detail: ttsOk ? "Your device can play the tutor's voice." : "Voice playback isn't available — questions are shown as text." },
        { key: "stt", label: "Speech recognition", icon: <Waypoints size={16} />, level: sttOk ? "ready" : "warning", detail: sttOk ? "Voice answers are supported." : "Voice input isn't supported here — you can type your answers." },
        { key: "net", label: "Network", icon: <Wifi size={16} />, level: network, detail: network === "ready" ? "You're online." : "You appear to be offline — connect to start." },
      ];
      setRows(next);
      setVoiceOk(ttsOk && sttOk);
      const blocked = next.some((r) => r.level === "blocked");
      dispatch({ type: "READINESS_RESULT", blocked });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checking = phase === "readiness";
  const blocked = phase === "blocked_readiness";

  return (
    <Card className="mx-auto max-w-lg rounded-3xl p-6">
      <h3 className="font-display text-lg font-bold text-foreground">Before we start</h3>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        {isResume
          ? "Welcome back — let's check your setup, then continue your interview."
          : "Let's quickly check your setup for the speaking interview."}
      </p>

      <ul className="mb-5 space-y-2" aria-live="polite">
        {rows.map((r) => (
          <li key={r.key} className="flex items-start gap-3 rounded-2xl border border-border p-3">
            <span className="mt-0.5 text-muted-foreground">{r.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                {r.label}
                <StatusPill level={r.level} />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{r.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      {!voiceOk && !checking && (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Voice mode isn't fully available on this device, so you can type your answers. We won't claim voice quality we can't provide.
        </p>
      )}
      {blocked && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          You appear to be offline. Reconnect to start the interview.
        </p>
      )}

      <Button
        size="lg"
        className="w-full"
        disabled={checking || blocked}
        onClick={() => dispatch({ type: "START" })}
      >
        {checking ? (
          <><Loader2 size={18} className="animate-spin" /> Checking your setup…</>
        ) : (
          <>Start interview <ArrowRight size={18} /></>
        )}
      </Button>
    </Card>
  );
}

function StatusPill({ level }: { level: Level }) {
  const map: Record<Level, { label: string; cls: string; icon: React.ReactNode }> = {
    ready: { label: "Ready", cls: "bg-emerald-100 text-emerald-700", icon: <Check size={11} strokeWidth={3} /> },
    warning: { label: "Warning", cls: "bg-amber-100 text-amber-700", icon: <AlertTriangle size={11} /> },
    blocked: { label: "Blocked", cls: "bg-red-100 text-red-700", icon: <X size={11} strokeWidth={3} /> },
    checking: { label: "Checking", cls: "bg-muted text-muted-foreground", icon: <Loader2 size={11} className="animate-spin" /> },
  };
  const s = map[level];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", s.cls)}>
      {s.icon} {s.label}
    </span>
  );
}

function initialRows(): CheckRow[] {
  return [
    { key: "mic", label: "Microphone", icon: <Mic size={16} />, level: "checking", detail: "Checking…" },
    { key: "perm", label: "Microphone permission", icon: <ShieldCheck size={16} />, level: "checking", detail: "Checking…" },
    { key: "tts", label: "Speaker / voice playback", icon: <Volume2 size={16} />, level: "checking", detail: "Checking…" },
    { key: "stt", label: "Speech recognition", icon: <Waypoints size={16} />, level: "checking", detail: "Checking…" },
    { key: "net", label: "Network", icon: <Wifi size={16} />, level: "checking", detail: "Checking…" },
  ];
}

function safe(fn: () => boolean): boolean {
  try {
    return fn();
  } catch {
    return false;
  }
}
