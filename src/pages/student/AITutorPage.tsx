import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  Bot, Sparkles, Clock, Mic, MicOff, PhoneOff, Lock, ArrowRight, Loader2, Phone,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/states";
import { useAITutorStatus, usePlans } from "@/hooks";
import { bookingApi } from "@/api";
import { startRealtimeCall, type RealtimeCall, type RealtimeEvent } from "@/lib/video/realtimeCall";
import { SELECTED_PLAN_KEY } from "@/pages/billing/PricingPage";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

type Gender = "female" | "male";
type Phase = "idle" | "connecting" | "live" | "ended" | "error";

function fmtClock(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── subscription gate ───────────────────────────────────────────────────────────
function SubscribeGate() {
  const { tx } = useI18n();
  const navigate = useNavigate();
  const { data: plans } = usePlans();
  const tutorPlans = (plans ?? []).filter((p) => p.kind === "ai_tutor");

  const subscribe = (planId: string) => {
    sessionStorage.setItem(SELECTED_PLAN_KEY, planId);
    navigate("/billing/bank-transfer");
  };

  return (
    <Card className="mx-auto max-w-2xl overflow-hidden p-0">
      <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-8 text-center text-white">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
          <Bot size={30} />
        </div>
        <h2 className="font-display text-2xl font-extrabold">{tx("Meet your AI speaking partner")}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/85">
          {tx("Practise speaking any time with quick 5-minute AI conversations. It talks back — pick a voice you like and just chat.")}
        </p>
      </div>
      <div className="p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Lock size={15} className="text-amber-500" /> {tx("Subscribe to unlock the AI Tutor")}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {tutorPlans.map((p) => (
            <button
              key={p.id}
              onClick={() => subscribe(p.id)}
              className={cn(
                "flex flex-col rounded-2xl border-2 p-4 text-left transition-all hover:shadow-md",
                p.recommended ? "border-indigo-300 bg-indigo-50/50" : "border-border"
              )}
            >
              <div className="text-2xl">{p.emoji}</div>
              <div className="mt-1 text-sm font-bold text-foreground">{p.name}</div>
              <div className="mt-1">
                <span className="text-xl font-extrabold text-foreground">{p.price.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground"> {p.currency} {p.cadence}</span>
              </div>
              <span className="mt-3 inline-flex items-center justify-center gap-1 rounded-lg bg-gradient-to-b from-indigo-500 to-violet-600 py-2 text-xs font-semibold text-white">
                {tx("Subscribe")} <ArrowRight size={13} />
              </span>
            </button>
          ))}
        </div>
        {tutorPlans.length === 0 && (
          <p className="text-sm text-muted-foreground">{tx("AI Tutor plans are being set up. Check back soon.")}</p>
        )}
      </div>
    </Card>
  );
}

export function AITutorPage() {
  const { tx } = useI18n();
  const status = useAITutorStatus();

  const [phase, setPhase] = useState<Phase>("idle");
  const [gender, setGender] = useState<Gender>("female");
  const [remaining, setRemaining] = useState(0);
  const [muted, setMuted] = useState(false);
  const [tutorSpeaking, setTutorSpeaking] = useState(false);
  const [youSpeaking, setYouSpeaking] = useState(false);
  const [caption, setCaption] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const callRef = useRef<RealtimeCall | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const teardown = () => {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
    try { callRef.current?.end(); } catch { /* noop */ }
    callRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    setTutorSpeaking(false); setYouSpeaking(false);
  };

  // Clean up on unmount / navigation away.
  useEffect(() => () => teardown(), []);

  const handleEvent = (ev: RealtimeEvent) => {
    const t = ev.type || "";
    if (t === "response.created") setCaption("");
    if (t === "output_audio_buffer.started" || t === "response.output_audio.started") setTutorSpeaking(true);
    if (t === "output_audio_buffer.stopped" || t === "response.done" || t === "response.audio.done") setTutorSpeaking(false);
    if (t === "input_audio_buffer.speech_started") setYouSpeaking(true);
    if (t === "input_audio_buffer.speech_stopped") setYouSpeaking(false);
    // Live caption of what the tutor is saying.
    if (t.endsWith("audio_transcript.delta") && ev.delta) setCaption((c) => (c + ev.delta).slice(-240));
  };

  const startCall = async (g: Gender) => {
    setErrorMsg("");
    setCaption("");
    setPhase("connecting");
    try {
      const sess = await bookingApi.realtimeSession(g);
      const call = await startRealtimeCall(sess.clientSecret, bookingApi.realtimeSdp, {
        onEvent: handleEvent,
        onRemoteStream: (stream) => { if (audioRef.current) audioRef.current.srcObject = stream; },
        onDrop: () => { setErrorMsg(tx("The call dropped. Please try again.")); teardown(); setPhase("error"); },
      });
      callRef.current = call;
      call.setMuted(muted);

      setPhase("live");
      setRemaining(sess.maxSeconds);
      timerRef.current = window.setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) { endCall(); return 0; }
          return r - 1;
        });
      }, 1000);
    } catch (e) {
      const err = e as { name?: string };
      setErrorMsg(
        err?.name === "NotAllowedError"
          ? tx("Microphone access was blocked. Allow the mic and try again.")
          : tx("Couldn't start the call. Check your connection and try again."),
      );
      teardown();
      setPhase("error");
    }
  };

  const endCall = () => {
    teardown();
    setPhase("ended");
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    callRef.current?.setMuted(next);
  };

  if (status.isLoading) {
    return (
      <DashboardLayout>
        <Loading label="Loading the AI Tutor…" />
      </DashboardLayout>
    );
  }
  if (!status.data?.subscribed) {
    return (
      <DashboardLayout>
        <PageHeader title="AI Tutor" subtitle="A live voice call with your AI English partner." />
        <SubscribeGate />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader title="AI Tutor" subtitle="A live voice call — talk naturally, it listens and replies in real time." />
      {/* Hidden element that plays the tutor's live audio. */}
      <audio ref={audioRef} autoPlay className="hidden" />

      <Card className="mx-auto max-w-xl overflow-hidden p-0">
        <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15"><Bot size={18} /></div>
            <div>
              <div className="text-sm font-bold leading-tight">{tx("AI Speaking Partner")}</div>
              <div className="text-[11px] text-white/75">{tx("Live voice call")}</div>
            </div>
          </div>
          {phase === "live" && (
            <span className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold tabular-nums",
              remaining <= 30 ? "bg-red-500/90 animate-pulse" : "bg-white/15"
            )}>
              <Clock size={14} /> {fmtClock(remaining)}
            </span>
          )}
        </div>

        {/* Idle — choose a voice and start the call */}
        {(phase === "idle" || phase === "ended" || phase === "error") && (
          <div className="flex flex-col items-center gap-5 px-6 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100">
              <Sparkles size={28} className="text-indigo-600" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-foreground">
                {phase === "ended" ? tx("Call ended — great job! 🎉") : tx("Call your AI tutor")}
              </h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {tx("Talk naturally about anything. It understands you and replies instantly, like a real teacher on a call.")}
              </p>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted-foreground">{tx("Tutor voice")}</div>
              <div className="inline-flex rounded-xl border border-border p-1">
                {(["female", "male"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGender(g)}
                    className={cn(
                      "rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors",
                      gender === g ? "bg-indigo-600 text-white" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {tx(g === "female" ? "Female" : "Male")}
                  </button>
                ))}
              </div>
            </div>

            {errorMsg && <p role="alert" className="text-sm font-medium text-red-600">{errorMsg}</p>}

            <Button size="lg" onClick={() => startCall(gender)}>
              <Phone size={18} /> {phase === "ended" ? tx("Start another call") : tx("Start voice call")}
            </Button>
            <p className="text-[11px] text-muted-foreground">{tx("Allow your microphone when the browser asks. Headphones give the best experience.")}</p>
          </div>
        )}

        {/* Connecting */}
        {phase === "connecting" && (
          <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <Loader2 size={34} className="animate-spin text-indigo-600" />
            <p className="text-sm font-medium text-foreground">{tx("Connecting your call…")}</p>
          </div>
        )}

        {/* Live call */}
        {phase === "live" && (
          <div className="flex flex-col items-center gap-5 px-6 pt-10 pb-7">
            <div className="relative flex h-40 w-40 items-center justify-center">
              {(tutorSpeaking || youSpeaking) && (
                <span className={cn(
                  "absolute inset-0 rounded-full animate-ping",
                  youSpeaking ? "bg-rose-400/30" : "bg-indigo-400/30"
                )} />
              )}
              <div className={cn(
                "flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br shadow-lg transition-transform",
                youSpeaking ? "from-rose-500 to-pink-600 scale-105" : "from-indigo-500 to-violet-600",
                tutorSpeaking && "scale-105"
              )}>
                <Bot size={46} className="text-white" />
              </div>
            </div>

            <div className="min-h-[1.25rem] text-center">
              {youSpeaking ? (
                <span className="text-sm font-semibold text-rose-600">{tx("Listening to you…")}</span>
              ) : tutorSpeaking ? (
                <span className="text-sm font-semibold text-indigo-600">{tx("Tutor is speaking…")}</span>
              ) : (
                <span className="text-sm font-medium text-muted-foreground">{tx("Just talk — say hello to start")}</span>
              )}
            </div>

            {caption && (
              <p className="min-h-[2.5rem] max-w-md text-center text-base leading-relaxed text-foreground">{caption}</p>
            )}

            <div className="mt-2 flex items-center gap-5">
              <button
                onClick={toggleMute}
                aria-label={muted ? tx("Unmute") : tx("Mute")}
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full border transition-colors",
                  muted ? "border-rose-200 bg-rose-50 text-rose-600" : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {muted ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              <button
                onClick={endCall}
                aria-label={tx("End call")}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white shadow-xl transition-transform hover:scale-105 hover:bg-red-700"
              >
                <PhoneOff size={26} />
              </button>
              <div className="h-12 w-12" aria-hidden />
            </div>
          </div>
        )}
      </Card>
    </DashboardLayout>
  );
}
