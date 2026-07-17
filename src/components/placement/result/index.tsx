// Placement Result — presentation-only components.
//
// These render VALIDATED backend DTO values verbatim. They never calculate a
// score, estimate CEFR, call an API, or navigate — the page owns data + actions.
// They also never render provider name, raw AI data, or internal mechanics.
import { Award, ArrowRight, Target, ThumbsUp, TriangleAlert, Gauge } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AIBadge } from "@/components/ai";

const LEVEL_LABEL: Record<string, string> = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper-intermediate",
  C1: "Advanced",
  C2: "Proficient",
};

const DIFFICULTY_COPY: Record<string, string> = {
  supportive: "A patient, encouraging instructor to build your confidence.",
  balanced: "A balanced instructor who mixes support with a healthy challenge.",
  challenging: "A challenging instructor to push your fluency further.",
};

export function ResultHeader() {
  return (
    <div className="mb-5 text-center">
      <div className="mb-2 flex justify-center">
        <AIBadge label="AI placement" />
      </div>
      <h1 className="font-display text-2xl font-extrabold text-foreground">Your placement result</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Here is your personalized English assessment.
      </p>
    </div>
  );
}

export function CEFRCard({ level }: { level: string }) {
  return (
    <div className="mb-5 rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-600 p-8 text-center text-white shadow-xl shadow-indigo-300/30">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
        <Award size={28} className="text-yellow-300" />
      </div>
      <p className="text-sm font-medium text-indigo-200">Your current English level</p>
      <div className="mt-1 text-5xl font-extrabold">{level}</div>
      <div className="text-lg font-semibold text-indigo-100">{LEVEL_LABEL[level] ?? level}</div>
    </div>
  );
}

export function SummaryCard({
  level,
  levelLabel,
  conversationScore,
  difficulty,
}: {
  level: string;
  levelLabel: string;
  conversationScore: number;
  difficulty: string;
}) {
  return (
    <Card className="mb-5 rounded-3xl p-6">
      <h2 className="mb-2 font-display font-bold text-foreground">Overall summary</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        You are at level <span className="font-semibold text-foreground">{level}</span> ({levelLabel}).
        Your overall conversation readiness is{" "}
        <span className="font-semibold text-foreground">{conversationScore}/100</span>. Based on this,
        we recommend a <span className="font-semibold capitalize text-foreground">{difficulty}</span>{" "}
        learning pace.
      </p>
    </Card>
  );
}

export function SkillScoreCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-bold text-foreground">{value}</span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} score`}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function ListCard({
  icon,
  title,
  items,
  empty,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  empty: string;
  tone: "emerald" | "amber";
}) {
  const chip = tone === "emerald" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700";
  return (
    <Card className="rounded-3xl p-6">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="font-display font-bold text-foreground">{title}</h2>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <span key={it} className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${chip}`}>
              {it.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

export function StrengthCard({ items }: { items: string[] }) {
  return (
    <ListCard
      icon={<ThumbsUp size={16} className="text-emerald-600" />}
      title="Your strongest skills"
      items={items}
      empty="Keep practising to build clear strengths."
      tone="emerald"
    />
  );
}

export function WeaknessCard({ items }: { items: string[] }) {
  return (
    <ListCard
      icon={<TriangleAlert size={16} className="text-amber-600" />}
      title="Areas needing improvement"
      items={items}
      empty="No major gaps — nice work!"
      tone="amber"
    />
  );
}

export function RecommendationCard({ focus, topics }: { focus: string[]; topics: string[] }) {
  const hasFocus = focus.length > 0;
  const hasTopics = topics.length > 0;
  return (
    <Card className="mb-5 rounded-3xl p-6">
      <div className="mb-3 flex items-center gap-2">
        <Target size={16} className="text-indigo-600" />
        <h2 className="font-display font-bold text-foreground">Recommended learning focus</h2>
      </div>
      {!hasFocus && !hasTopics ? (
        <p className="text-sm text-muted-foreground">
          We&apos;ll tailor recommendations as you practise more.
        </p>
      ) : (
        <>
          {hasFocus && (
            <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-foreground">
              {focus.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          {hasTopics && (
            <>
              <div className="mb-2 text-sm font-semibold text-foreground">Suggested conversation topics</div>
              <div className="flex flex-wrap gap-2">
                {topics.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium capitalize text-indigo-700"
                  >
                    {t.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Card>
  );
}

export function DifficultyCard({ difficulty }: { difficulty: string }) {
  return (
    <Card className="mb-5 rounded-3xl p-6">
      <div className="mb-2 flex items-center gap-2">
        <Gauge size={16} className="text-indigo-600" />
        <h2 className="font-display font-bold text-foreground">Recommended instructor</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold capitalize text-foreground">{difficulty}</span> —{" "}
        {DIFFICULTY_COPY[difficulty] ?? "Matched to your current level."}
      </p>
    </Card>
  );
}

export function ResultFooter({
  onContinue,
  onRetake,
}: {
  onContinue: () => void;
  onRetake: () => void;
}) {
  return (
    <div className="flex gap-3">
      <Button variant="ghost" onClick={onRetake} className="flex-1" size="lg">
        Retake test
      </Button>
      <Button onClick={onContinue} className="flex-1" size="lg">
        Continue to plans <ArrowRight size={18} />
      </Button>
    </div>
  );
}

/** Skeleton that mirrors the result layout — no layout shift, accessible status. */
export function ResultSkeleton() {
  return (
    <div role="status" aria-label="Loading your result" className="animate-pulse">
      <div className="mb-5 h-8 w-40 rounded bg-muted" />
      <div className="mb-5 h-44 rounded-3xl bg-muted" />
      <div className="mb-5 h-24 rounded-3xl bg-muted" />
      <div className="mb-5 h-40 rounded-3xl bg-muted" />
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <div className="h-28 rounded-3xl bg-muted" />
        <div className="h-28 rounded-3xl bg-muted" />
      </div>
      <div className="h-12 rounded-2xl bg-muted" />
      <span className="sr-only">Loading your result…</span>
    </div>
  );
}
