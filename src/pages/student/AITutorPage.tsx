import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  Bot,
  Send,
  Sparkles,
  Clock,
  Volume2,
  VolumeX,
  Play,
  Square,
  Lock,
  ArrowRight,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/states";
import {
  useAITutorStatus,
  useStartAITutor,
  useSendAITutorMessage,
  useEndAITutor,
  usePlans,
} from "@/hooks";
import { SELECTED_PLAN_KEY } from "@/pages/billing/PricingPage";
import type { AITutorSession } from "@/api/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

const TOPICS = ["Daily life", "Travel", "Job interview", "Free talk", "Hobbies", "Food"];

// ── Text-to-speech (Web Speech API) ─────────────────────────────────────────────
function useTTS() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!supported) return;
    const load = () =>
      setVoices(window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en")));
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [supported]);

  const speak = (text: string, opts: { voiceURI?: string; pitch: number; rate: number }) => {
    if (!supported || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = voices.find((x) => x.voiceURI === opts.voiceURI);
    if (v) u.voice = v;
    u.pitch = opts.pitch;
    u.rate = opts.rate;
    u.lang = v?.lang ?? "en-US";
    window.speechSynthesis.speak(u);
  };
  const stop = () => supported && window.speechSynthesis.cancel();
  return { supported, voices, speak, stop };
}

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
  const start = useStartAITutor();
  const sendMsg = useSendAITutorMessage();
  const endSession = useEndAITutor();
  const tts = useTTS();

  const [session, setSession] = useState<AITutorSession | null>(null);
  const [topic, setTopic] = useState("");
  const [draft, setDraft] = useState("");
  const [remaining, setRemaining] = useState(0);

  // voice controls
  const [muted, setMuted] = useState(false);
  const [voiceURI, setVoiceURI] = useState<string>("");
  const [pitch, setPitch] = useState(1);
  const [rate, setRate] = useState(1);
  const [showControls, setShowControls] = useState(false);
  const lastSpokenRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Adopt an in-progress session returned by /status.
  useEffect(() => {
    if (status.data?.activeSession && !session) setSession(status.data.activeSession);
  }, [status.data, session]);

  // Default the voice once voices load.
  useEffect(() => {
    if (!voiceURI && tts.voices.length) {
      const preferred = tts.voices.find((v) => /female|Samantha|Google US/i.test(v.name)) ?? tts.voices[0];
      setVoiceURI(preferred.voiceURI);
    }
  }, [tts.voices, voiceURI]);

  // Countdown timer derived from the session's expiry.
  useEffect(() => {
    if (!session || session.status !== "active") {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.round((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) setSession((s) => (s ? { ...s, status: "ended" } : s));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session]);

  // Speak the latest tutor message when it changes.
  useEffect(() => {
    const msgs = session?.messages ?? [];
    const last = [...msgs].reverse().find((m) => m.role === "tutor");
    if (!last || muted) return;
    const key = `${session?.sessionId}:${msgs.length}:${last.text}`;
    if (key !== lastSpokenRef.current) {
      lastSpokenRef.current = key;
      tts.speak(last.text, { voiceURI, pitch, rate });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.messages, muted, voiceURI, pitch, rate]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [session?.messages]);

  const onStart = () => {
    tts.stop();
    start.mutate(topic, { onSuccess: (s) => { setSession(s); lastSpokenRef.current = ""; } });
  };

  const onSend = () => {
    const text = draft.trim();
    if (!text || !session || session.status !== "active" || sendMsg.isPending) return;
    // optimistic append of the student's line
    setSession((s) => (s ? { ...s, messages: [...s.messages, { role: "student", text, at: "" }] } : s));
    setDraft("");
    sendMsg.mutate(
      { sessionId: session.sessionId, text },
      {
        onSuccess: (s) => setSession(s),
        onError: () => status.refetch(),
      }
    );
  };

  const onEnd = () => {
    tts.stop();
    if (session) endSession.mutate(session.sessionId, { onSuccess: (s) => setSession(s) });
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
        <PageHeader title="AI Tutor" subtitle="Quick 5-minute AI speaking practice, on demand." />
        <SubscribeGate />
      </DashboardLayout>
    );
  }

  const active = session?.status === "active";
  const messages = session?.messages ?? [];
  const lowTime = remaining > 0 && remaining <= 30;

  return (
    <DashboardLayout>
      <PageHeader
        title="AI Tutor"
        subtitle="Quick 5-minute AI speaking practice. It talks back — pick a voice and chat."
        action={
          <button
            onClick={() => setShowControls((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            <SlidersHorizontal size={15} /> {tx("Voice")}
          </button>
        }
      />

      {/* Voice controls */}
      {showControls && (
        <Card className="mb-4 p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
              {tx("Voice")}
              <select
                value={voiceURI}
                onChange={(e) => setVoiceURI(e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {tts.voices.length === 0 && <option>{tx("Default")}</option>}
                {tts.voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
              {tx("Pitch")} · {pitch.toFixed(1)}
              <input type="range" min={0} max={2} step={0.1} value={pitch} onChange={(e) => setPitch(Number(e.target.value))} className="accent-indigo-600" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
              {tx("Speed")} · {rate.toFixed(1)}
              <input type="range" min={0.5} max={1.5} step={0.1} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="accent-indigo-600" />
            </label>
          </div>
          <button
            onClick={() => tts.speak("Hi! This is how I sound. Let's practise together.", { voiceURI, pitch, rate })}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            <Volume2 size={13} /> {tx("Preview voice")}
          </button>
          {!tts.supported && (
            <p className="mt-2 text-xs text-amber-600">{tx("Your browser doesn't support speech — the tutor will still reply in text.")}</p>
          )}
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        {/* Chat header with timer */}
        <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
              <Bot size={18} />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight">{tx("AI Speaking Partner")}</div>
              <div className="text-[11px] text-white/75">{session?.topic || tx("Free conversation")}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setMuted((m) => !m); tts.stop(); }}
              aria-label={muted ? tx("Unmute") : tx("Mute")}
              className="rounded-lg bg-white/15 p-2 hover:bg-white/25"
            >
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            {session && (
              <span className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold tabular-nums",
                lowTime ? "bg-red-500/90 animate-pulse" : "bg-white/15"
              )}>
                <Clock size={14} /> {fmtClock(remaining)}
              </span>
            )}
          </div>
        </div>

        {/* Messages / start screen */}
        {!session ? (
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-14 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100">
              <Sparkles size={28} className="text-indigo-600" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-foreground">{tx("Start a 5-minute practice")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{tx("Pick a topic or just start talking.")}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {TOPICS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTopic(t === topic ? "" : t)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                    topic === t ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-border text-foreground hover:bg-muted"
                  )}
                >
                  {tx(t)}
                </button>
              ))}
            </div>
            <Button size="lg" onClick={onStart} disabled={start.isPending}>
              {start.isPending ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} {tx("Start practice")}
            </Button>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="max-h-[26rem] min-h-[18rem] space-y-3 overflow-y-auto bg-surface-2/40 px-4 py-5">
              {messages.map((m, i) => (
                <div key={i} className={cn("flex", m.role === "student" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                      m.role === "student"
                        ? "rounded-br-md bg-gradient-to-b from-indigo-500 to-indigo-600 text-white"
                        : "rounded-bl-md border border-border bg-card text-foreground"
                    )}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {sendMsg.isPending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 text-muted-foreground">
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400" />
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Input / ended footer */}
            {active ? (
              <div className="flex items-center gap-2 border-t border-border p-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onSend()}
                  placeholder={tx("Type your reply…")}
                  className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-indigo-300"
                />
                <Button onClick={onSend} disabled={!draft.trim() || sendMsg.isPending} aria-label={tx("Send")}>
                  <Send size={16} />
                </Button>
                <button
                  onClick={onEnd}
                  className="rounded-xl border border-border p-2.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                  aria-label={tx("End session")}
                >
                  <Square size={16} />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 border-t border-border p-5 text-center">
                <p className="text-sm font-medium text-foreground">{tx("Practice finished — great job! 🎉")}</p>
                <Button onClick={() => { tts.stop(); setSession(null); setDraft(""); }}>
                  <Play size={16} /> {tx("Start another")}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </DashboardLayout>
  );
}
