import { Link } from "react-router";
import { useState } from "react";
import {
  ArrowRight,
  Star,
  Brain,
  ClipboardList,
  CalendarCheck,
  FileBarChart,
  MessagesSquare,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  Clock,
  Globe,
  CheckCircle,
  Mic,
  Plus,
  Minus,
  Quote,
} from "lucide-react";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Button } from "@/components/ui/button";
import {
  Section,
  SectionHeading,
  Eyebrow,
  BlobShape,
  ConversationScene,
  GrowthMark,
} from "@/components/marketing";
import { instructors } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

const WHY = [
  {
    icon: MessagesSquare,
    title: "Real conversations, not lessons",
    desc: "You practise by actually speaking with a human instructor — the fastest way to get comfortable.",
    tint: "bg-blue-50 text-blue-600",
  },
  {
    icon: HeartHandshake,
    title: "A calm, judgement-free space",
    desc: "Friendly instructors who meet you at your level. Mistakes are welcome — that's how speaking grows.",
    tint: "bg-orange-50 text-orange-600",
  },
  {
    icon: Sparkles,
    title: "AI that helps, never replaces",
    desc: "AI prepares your questions and reviews your session, so every minute with your instructor counts.",
    tint: "bg-indigo-50 text-indigo-600",
  },
  {
    icon: ShieldCheck,
    title: "Built on trust",
    desc: "Vetted instructors, clear pricing, and a placement test so sessions always start at the right level.",
    tint: "bg-emerald-50 text-emerald-600",
  },
];

const STEPS = [
  { icon: Brain, title: "Take the placement test", desc: "A short AI test estimates your level so sessions start at the right difficulty." },
  { icon: CalendarCheck, title: "Book a live session", desc: "Pick a topic and a time with a real instructor. No bots, no recordings to watch." },
  { icon: ClipboardList, title: "Prepare with the questions", desc: "See the discussion questions before you join, so you walk in ready to speak." },
  { icon: FileBarChart, title: "Get your AI report", desc: "After the session, AI analyses the conversation and suggests what to work on next." },
];

const JOURNEY = [
  { label: "You arrive nervous", desc: "Maybe you can read and write, but speaking out loud feels hard.", icon: Mic },
  { label: "You start talking", desc: "A friendly instructor guides a real conversation on a topic you chose.", icon: MessagesSquare },
  { label: "Confidence builds", desc: "Week by week, the words come faster and the pauses get shorter.", icon: HeartHandshake },
  { label: "You speak naturally", desc: "Interviews, travel, meetings — you handle them in English, calmly.", icon: Globe },
];

const AI_POINTS = [
  "Generates discussion questions before each session so you can prepare",
  "Listens during the session to build an accurate report afterwards",
  "Scores grammar, vocabulary, fluency and confidence over time",
  "Suggests exactly what to practise next — no guessing",
];

const RESULTS = [
  { quote: "I finally found someone to practise English with. After a month, I stopped translating in my head.", name: "Mohammed", country: "🇸🇦 Saudi Arabia", accent: "from-blue-500 to-blue-600" },
  { quote: "The questions before each session changed everything. I walk in prepared instead of panicking.", name: "Lucía", country: "🇲🇽 Mexico", accent: "from-orange-400 to-orange-500" },
  { quote: "My AI report showed my fluency going up every week. Seeing the progress kept me going.", name: "Thanh", country: "🇻🇳 Vietnam", accent: "from-indigo-500 to-purple-600" },
];

const FAQ = [
  { q: "Do I talk to a real person or an AI?", a: "Always a real, vetted instructor. AI only prepares your questions beforehand and writes your report afterwards — the conversation is fully human." },
  { q: "What if my English is very basic?", a: "That's exactly who OneClub is for. The placement test sets your starting level, and instructors adjust to keep every session comfortable." },
  { q: "How do I pay?", a: "By local bank transfer. You upload your payment proof and we activate your account once an admin confirms it — no card required." },
  { q: "What happens in a session?", a: "You join a live video call, talk through prepared questions with your instructor, and receive an AI report with scores and next steps afterwards." },
];

export function LandingPage() {
  const { tx } = useI18n();
  return (
    <div className="min-h-screen bg-white font-sans text-foreground">
      <MarketingNav />

      {/* ── 1. Hero ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/70 via-white to-white pt-28">
        <div className="bg-dot-pattern pointer-events-none absolute inset-0 opacity-60" />
        <BlobShape className="pointer-events-none absolute -right-32 -top-24 h-[460px] w-[460px] opacity-30" />
        <BlobShape className="pointer-events-none absolute -left-40 top-40 h-[380px] w-[380px] opacity-20" from="#F59E0B" to="#3B82F6" />

        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-16 md:px-8 lg:grid-cols-2">
          <div className="relative z-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 shadow-sm">
              <Mic size={14} /> {tx("Live conversation practice with real instructors")}
            </div>
            <h1 className="font-display text-4xl font-extrabold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {tx("Practice English.")}
              <br />
              {tx("Build confidence.")}
              <br />
              <span className="text-primary">{tx("Speak naturally.")}</span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
              {tx("OneClub pairs you with friendly instructors for focused conversation sessions. You get the questions ahead of time, and AI gives you a clear report afterward.")}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" variant="accent">
                <Link to="/register">
                  {tx("Start free placement test")} <ArrowRight size={18} />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link to="/billing/pricing">{tx("See plans")}</Link>
              </Button>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2.5">
                  {instructors.map((i) => (
                    <div
                      key={i.id}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br text-xs font-bold text-white",
                        i.accent
                      )}
                    >
                      {i.initials}
                    </div>
                  ))}
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{tx("Real instructors")}</span> {tx("· vetted & rated")}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} size={15} className="fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">4.9/5</span>
              </div>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><CheckCircle size={13} className="text-success" /> {tx("Free placement test")}</span>
              <span className="flex items-center gap-1.5"><CheckCircle size={13} className="text-success" /> {tx("Pay by bank transfer")}</span>
              <span className="flex items-center gap-1.5"><CheckCircle size={13} className="text-success" /> {tx("Questions in advance")}</span>
            </div>
          </div>

          {/* Hero illustration */}
          <div className="relative z-10">
            <div className="relative rounded-[2rem] border border-blue-100 bg-white/70 p-6 shadow-xl shadow-blue-100/60 backdrop-blur-sm">
              <ConversationScene />
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-blue-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-blue-700">{tx("Before the session")}</div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{tx("5 discussion questions, sent in advance.")}</p>
                </div>
                <div className="rounded-2xl bg-indigo-50 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-indigo-700">
                    <Sparkles size={12} /> {tx("After")}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{tx("An AI report with scores and next steps.")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Why OneClub ────────────────────────────────────── */}
      <Section id="why">
        <SectionHeading
          eyebrow={tx("Why OneClub")}
          title={tx("A warmer way to learn to speak")}
          subtitle={tx("OneClub isn't another course to finish. It's a place to talk — and to feel a little braver every time.")}
        />
        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {WHY.map((w) => (
            <div
              key={w.title}
              className="rounded-3xl border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-100/60"
            >
              <div className={cn("mb-4 flex h-12 w-12 items-center justify-center rounded-2xl", w.tint)}>
                <w.icon size={22} />
              </div>
              <h3 className="font-display text-lg font-bold text-foreground">{tx(w.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tx(w.desc)}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 3. How It Works ───────────────────────────────────── */}
      <Section id="how" className="bg-surface-2">
        <SectionHeading eyebrow={tx("How it works")} title={tx("Four steps, then you're speaking")} />
        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="relative rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-600/25">
                <s.icon size={22} />
              </div>
              <div className="mb-2 font-display text-sm font-bold text-blue-300">0{i + 1}</div>
              <h3 className="font-display font-bold text-foreground">{tx(s.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tx(s.desc)}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 4. Practice Journey ───────────────────────────────── */}
      <Section id="journey">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div>
            <Eyebrow>{tx("Your practice journey")}</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              {tx("From nervous to natural")}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              {tx("Confidence isn't a switch — it's a path. Here's how it usually unfolds for OneClub members.")}
            </p>
            <div className="mt-8 space-y-1">
              {JOURNEY.map((j, i) => (
                <div key={j.label} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                      <j.icon size={18} />
                    </div>
                    {i < JOURNEY.length - 1 && <div className="my-1 w-0.5 flex-1 bg-blue-100" />}
                  </div>
                  <div className="pb-6">
                    <div className="font-display font-bold text-foreground">{tx(j.label)}</div>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{tx(j.desc)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative flex justify-center">
            <div className="relative w-full max-w-sm rounded-[2rem] border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-10 shadow-lg shadow-blue-100/50">
              <GrowthMark className="mx-auto h-48 w-48" />
              <div className="mt-4 text-center">
                <div className="font-display text-2xl font-extrabold text-foreground">{tx("Confidence, week by week")}</div>
                <p className="mt-2 text-sm text-muted-foreground">{tx("Measured by your AI reports over time.")}</p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── 5. AI Helps You ───────────────────────────────────── */}
      <Section id="ai" className="bg-surface-2">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <div className="rounded-[2rem] border border-indigo-100 bg-white p-8 shadow-lg shadow-indigo-100/50">
              <div className="flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-indigo-700" style={{ width: "fit-content" }}>
                <Sparkles size={12} /> {tx("AI-assisted")}
              </div>
              <h3 className="mt-4 font-display text-xl font-bold text-foreground">{tx("Your session report")}</h3>
              <div className="mt-5 space-y-4">
                {[
                  { label: "Fluency", value: 82, color: "bg-blue-500" },
                  { label: "Vocabulary", value: 76, color: "bg-indigo-500" },
                  { label: "Confidence", value: 68, color: "bg-orange-500" },
                ].map((m) => (
                  <div key={m.label}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium text-foreground">{tx(m.label)}</span>
                      <span className="text-muted-foreground">{m.value}%</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className={cn("h-full rounded-full", m.color)} style={{ width: `${m.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <Eyebrow>{tx("AI helps you")}</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              {tx("Smart support around a human conversation")}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              {tx("AI does the prep and the analysis. Your instructor does the talking. You get the best of both.")}
            </p>
            <ul className="mt-6 space-y-3">
              {AI_POINTS.map((p) => (
                <li key={p} className="flex items-start gap-3 text-sm text-slate-700">
                  <CheckCircle size={18} className="mt-0.5 flex-shrink-0 text-indigo-500" />
                  {tx(p)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* ── 6. Meet Your Instructor ───────────────────────────── */}
      <Section id="instructors">
        <SectionHeading
          eyebrow={tx("Meet your instructor")}
          title={tx("Real people lead every session")}
          subtitle={tx("AI prepares and analyses — but the conversation is always with a friendly, vetted human.")}
        />
        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {instructors.map((i) => (
            <div
              key={i.id}
              className="rounded-3xl border border-border bg-card p-7 text-center shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-100/60"
            >
              <div className={cn("mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br text-2xl font-bold text-white shadow-md", i.accent)}>
                {i.initials}
              </div>
              <div className="mt-4 font-display text-lg font-bold text-foreground">{i.name}</div>
              <div className="text-sm text-muted-foreground">{i.flag} {i.country}</div>
              <p className="mt-2 text-sm text-slate-600">{i.headline}</p>
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                <Star size={12} className="fill-amber-500 text-amber-500" /> {i.rating} · {i.sessionsHosted} {tx("sessions")}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 7. Student Results ────────────────────────────────── */}
      <Section id="results" className="bg-surface-2">
        <SectionHeading eyebrow={tx("Student results")} title={tx("“I finally found someone to practise with”")} />
        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {RESULTS.map((r) => (
            <div key={r.name} className="flex flex-col rounded-3xl border border-border bg-card p-7 shadow-sm">
              <Quote size={28} className="text-blue-200" />
              <p className="mt-3 flex-1 text-base leading-relaxed text-slate-700">{tx(r.quote)}</p>
              <div className="mt-6 flex items-center gap-3">
                <div className={cn("flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white", r.accent)}>
                  {r.name[0]}
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-foreground">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{tx(r.country)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 8. Pricing teaser ─────────────────────────────────── */}
      <Section id="pricing">
        <div className="overflow-hidden rounded-[2.5rem] border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-10 md:p-14">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
            <div>
              <Eyebrow>{tx("Simple pricing")}</Eyebrow>
              <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                {tx("Pay for sessions, nothing else")}
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                {tx("Every plan includes prep questions and an AI report. Pay by local bank transfer — your account activates once an admin confirms.")}
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link to="/billing/pricing">
                    {tx("See all plans")} <ArrowRight size={18} />
                  </Link>
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Clock, label: "Flexible booking", desc: "Sessions when it suits you" },
                { icon: ClipboardList, label: "Prep included", desc: "Questions in advance" },
                { icon: Sparkles, label: "AI report", desc: "After every session" },
                { icon: ShieldCheck, label: "No card needed", desc: "Local bank transfer" },
              ].map((f) => (
                <div key={f.label} className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                  <f.icon size={20} className="text-primary" />
                  <div className="mt-3 font-display text-sm font-bold text-foreground">{tx(f.label)}</div>
                  <div className="text-xs text-muted-foreground">{tx(f.desc)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── 9. FAQ ────────────────────────────────────────────── */}
      <Section id="faq">
        <SectionHeading eyebrow={tx("FAQ")} title={tx("Questions, answered")} />
        <div className="mx-auto mt-12 max-w-3xl space-y-3">
          {FAQ.map((f) => (
            <FAQItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </Section>

      {/* ── 10. CTA ───────────────────────────────────────────── */}
      <Section id="cta">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-blue-600 to-indigo-600 px-8 py-16 text-center shadow-xl shadow-blue-200/50 md:px-16">
          <BlobShape className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 opacity-20" from="#ffffff" to="#ffffff" />
          <div className="relative z-10 mx-auto max-w-2xl">
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              {tx("Your next conversation is one click away")}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-blue-100">
              {tx("Take the free placement test and book your first session with a real instructor today.")}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" variant="accent">
                <Link to="/register">
                  {tx("Start free placement test")} <ArrowRight size={18} />
                </Link>
              </Button>
              <Button asChild size="lg" variant="glass">
                <Link to="/login">{tx("I already have an account")}</Link>
              </Button>
            </div>
          </div>
        </div>
      </Section>

      {/* ── 11. Footer ────────────────────────────────────────── */}
      <footer className="border-t border-border bg-surface-2 px-6 py-12 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-2 font-display text-lg font-bold text-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
              <MessagesSquare size={16} className="text-white" />
            </span>
            One<span className="text-primary">Club</span>
          </div>
          <p className="max-w-md text-sm text-muted-foreground">
            {tx("Conversation practice with real instructors — practice English, build confidence, speak naturally.")}
          </p>
          <p className="text-xs text-slate-400">{tx("A prototype. No real payments are processed.")}</p>
        </div>
      </footer>
    </div>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const { tx } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <span className="font-display font-semibold text-foreground">{tx(q)}</span>
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          {open ? <Minus size={15} /> : <Plus size={15} />}
        </span>
      </button>
      {open && <p className="px-6 pb-5 text-sm leading-relaxed text-muted-foreground">{tx(a)}</p>}
    </div>
  );
}
