import { Link } from "react-router";
import {
  ArrowRight,
  Star,
  Mic,
  Video,
  Brain,
  ClipboardList,
  CalendarCheck,
  FileBarChart,
  Users,
  CheckCircle,
} from "lucide-react";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Button } from "@/components/ui/button";
import { instructors } from "@/data/mockData";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: Brain, title: "Take the AI placement test", desc: "A short test estimates your level so sessions start at the right difficulty.", accent: "from-indigo-500 to-indigo-600" },
  { icon: CalendarCheck, title: "Book a live session", desc: "Pick a topic and a time with a real instructor. No bots, no recordings to watch.", accent: "from-purple-500 to-purple-600" },
  { icon: ClipboardList, title: "Prepare with the questions", desc: "See the discussion questions before you join, so you walk in ready to speak.", accent: "from-cyan-500 to-cyan-600" },
  { icon: FileBarChart, title: "Get your AI session report", desc: "After the session, AI analyses the conversation and suggests what to work on.", accent: "from-emerald-500 to-emerald-600" },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#08081A] font-display">
      <MarketingNav />

      <section className="relative overflow-hidden pt-20">
        <div className="pointer-events-none absolute left-1/3 top-32 h-[500px] w-[500px] rounded-full bg-indigo-600/15 blur-3xl" />
        <div className="pointer-events-none absolute right-1/4 top-48 h-[400px] w-[400px] rounded-full bg-purple-600/15 blur-3xl" />

        <div className="mx-auto grid min-h-[calc(100vh-80px)] max-w-7xl grid-cols-1 items-center gap-12 px-6 py-16 md:px-8 lg:grid-cols-2">
          <div className="relative z-10">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/15 px-4 py-2 text-sm text-indigo-300">
              <Mic size={13} /> Live conversation practice, not another course
            </div>
            <h1 className="mb-6 text-5xl font-extrabold leading-[1.1] text-white lg:text-6xl">
              Practice English<br />
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                by actually speaking
              </span>
            </h1>
            <p className="mb-8 max-w-md text-lg leading-relaxed text-gray-400">
              English Club pairs you with real instructors for focused conversation sessions. You get the questions
              ahead of time, and AI gives you a clear report afterward.
            </p>

            <div className="mb-7 flex items-center gap-4">
              <div className="flex -space-x-2.5">
                {instructors.map((i) => (
                  <div
                    key={i.id}
                    className={cn("flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#08081A] bg-gradient-to-br text-xs font-bold text-white", i.accent)}
                  >
                    {i.initials}
                  </div>
                ))}
              </div>
              <div className="text-sm text-gray-400">
                <span className="font-semibold text-white">Real instructors</span> · vetted and rated
              </div>
            </div>

            <div className="mb-9 flex items-center gap-2">
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} size={15} className="fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <span className="text-sm text-gray-400">4.9/5 from members who speak more</span>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Button asChild size="lg">
                <Link to="/register">
                  Start with a placement test <ArrowRight size={17} />
                </Link>
              </Button>
              <Button asChild size="lg" variant="glass">
                <Link to="/billing/pricing">
                  <Video size={17} /> See plans
                </Link>
              </Button>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><CheckCircle size={13} className="text-emerald-500" /> Free placement test</span>
              <span className="flex items-center gap-1.5"><CheckCircle size={13} className="text-emerald-500" /> Pay by bank transfer</span>
              <span className="flex items-center gap-1.5"><CheckCircle size={13} className="text-emerald-500" /> Questions sent in advance</span>
            </div>
          </div>

          {/* Hero visual: live session preview */}
          <div className="relative z-10 hidden flex-col gap-4 lg:flex">
            <div className="rounded-3xl border border-white/15 bg-white/8 p-4 backdrop-blur-xl">
              <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#111135] to-[#1d0a45]" style={{ aspectRatio: "16/9" }}>
                <div className="relative flex h-full">
                  <div className="flex flex-1 flex-col items-center justify-center border-r border-white/10 p-4">
                    <div className="mb-2 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-2xl font-bold text-white">SM</div>
                    <div className="text-sm font-semibold text-white">Sarah Mitchell</div>
                    <div className="mt-0.5 text-xs text-indigo-300">Instructor · 🇺🇸</div>
                    <div className="mt-3 flex items-center gap-1 text-xs text-emerald-400">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Speaking…
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col items-center justify-center p-4">
                    <div className="mb-2 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-2xl font-bold text-white">MK</div>
                    <div className="text-sm font-semibold text-white">Mohammed</div>
                    <div className="mt-0.5 text-xs text-indigo-300">B1 · 🇸🇦</div>
                    <div className="mt-3 flex items-center gap-1 text-xs text-gray-500">
                      <Mic size={11} /> Listening
                    </div>
                  </div>
                  <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-1 text-[10px] font-bold text-white">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
                  </div>
                  <div className="absolute right-3 top-3 rounded-full bg-black/40 px-2.5 py-1 font-mono text-xs text-white">24:35</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/15 bg-white/8 p-4 backdrop-blur-xl">
                <div className="mb-2 text-xs font-semibold text-indigo-300">Before the session</div>
                <div className="text-sm leading-relaxed text-gray-300">5 discussion questions, sent in advance so you can prepare.</div>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/8 p-4 backdrop-blur-xl">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
                  <Brain size={12} /> After the session
                </div>
                <div className="text-sm leading-relaxed text-gray-300">An AI report with your scores and what to practise next.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-white/8 px-6 py-20 md:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-indigo-400">How it works</span>
            <h2 className="mt-3 text-4xl font-extrabold text-white">Four steps, then you're speaking</h2>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
                <div className={cn("mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg", s.accent)}>
                  <s.icon size={22} className="text-white" />
                </div>
                <div className="mb-2 text-xs font-bold text-white/40">0{i + 1}</div>
                <h3 className="mb-2 font-bold text-white">{s.title}</h3>
                <p className="text-sm leading-relaxed text-gray-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Instructors */}
      <section id="instructors" className="border-t border-white/8 px-6 py-20 md:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-indigo-400">Your instructors</span>
            <h2 className="mt-3 text-4xl font-extrabold text-white">Real people lead every session</h2>
            <p className="mx-auto mt-3 max-w-md text-gray-400">
              AI prepares and analyses — but the conversation is always with a human instructor.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {instructors.map((i) => (
              <div key={i.id} className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-xl">
                <div className={cn("mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br text-xl font-bold text-white", i.accent)}>
                  {i.initials}
                </div>
                <div className="font-semibold text-white">{i.name}</div>
                <div className="mb-2 text-xs text-indigo-300">{i.flag} {i.country}</div>
                <div className="text-sm text-gray-400">{i.headline}</div>
                <div className="mt-3 flex items-center justify-center gap-1 text-xs text-amber-400">
                  <Star size={12} className="fill-amber-400" /> {i.rating} · {i.sessionsHosted} sessions
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/8 px-6 py-10 text-center md:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Users size={14} /> English Club — conversation practice with real instructors
          </div>
          <p className="text-xs text-gray-600">A prototype. No real payments are processed.</p>
        </div>
      </footer>
    </div>
  );
}
