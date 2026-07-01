import { useNavigate } from "react-router";
import { Award, ArrowRight, Sparkles, Target, ThumbsUp, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CircleScore } from "@/components/cards";
import { AIBadge } from "@/components/ai";
import { Loading, ErrorState, EmptyState } from "@/components/states";
import { usePlacementResult } from "@/hooks";
import { ApiError } from "@/api";
import type { PlacementAssessment } from "@/api/types";

const LEVEL_LABEL: Record<string, string> = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper-intermediate",
  C1: "Advanced",
  C2: "Proficient",
};

// Score dimensions to render as circles — pronunciation is intentionally absent.
function skillCircles(r: PlacementAssessment) {
  return [
    { label: "Grammar", value: r.grammarScore, color: "#3B82F6" },
    { label: "Vocabulary", value: r.vocabularyScore, color: "#06B6D4" },
    { label: "Fluency", value: r.fluencyScore, color: "#22C55E" },
    { label: "Confidence", value: r.confidenceScore, color: "#F59E0B" },
    { label: "Written", value: r.writtenScore, color: "#6366F1" },
    { label: "Spoken", value: r.spokenScore, color: "#F97316" },
  ];
}

export function PlacementResultPage() {
  const navigate = useNavigate();
  const resultQuery = usePlacementResult();

  if (resultQuery.isLoading)
    return (
      <Shell>
        <Loading label="Loading your result…" />
      </Shell>
    );

  if (resultQuery.isError) {
    const err = resultQuery.error;
    if (err instanceof ApiError && err.code === "placement_result_not_found") {
      return (
        <Shell>
          <EmptyState
            title="No placement result yet"
            description="Take the placement interview to see your estimated level."
            action={
              <Button onClick={() => navigate("/onboarding/placement-test")}>Take the placement</Button>
            }
          />
        </Shell>
      );
    }
    return (
      <Shell>
        <ErrorState error={err} onRetry={() => resultQuery.refetch()} />
      </Shell>
    );
  }

  const r = resultQuery.data!;

  return (
    <Shell>
      {/* Level hero */}
      <div className="mb-6 rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-600 p-8 text-center text-white shadow-2xl shadow-indigo-300/30">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
          <Award size={28} className="text-yellow-300" />
        </div>
        <div className="mb-2 flex items-center justify-center gap-2">
          <AIBadge label="AI placement" className="bg-white/20 text-white" />
        </div>
        <h2 className="text-2xl font-extrabold">Your estimated level</h2>
        <div className="mt-3 text-5xl font-extrabold">{r.cefrLevel}</div>
        <div className="text-xl font-semibold text-indigo-200">{LEVEL_LABEL[r.cefrLevel] ?? r.cefrLevel}</div>
        <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-indigo-200">
          Conversation score {r.overallConversationScore}/100 — recommended instructor difficulty:{" "}
          <span className="font-semibold capitalize">{r.recommendedInstructorDifficulty}</span>.
        </p>
      </div>

      {/* Skill breakdown */}
      <Card className="mb-5 rounded-3xl p-7">
        <h3 className="mb-6 text-center font-display font-bold text-foreground">Skill breakdown</h3>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
          {skillCircles(r).map((s) => (
            <CircleScore key={s.label} {...s} />
          ))}
        </div>
      </Card>

      {/* Strengths / weaknesses */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <ChipCard
          icon={<ThumbsUp size={16} className="text-emerald-600" />}
          title="Strengths"
          items={r.strengths}
          empty="Keep practising to build clear strengths."
          tone="emerald"
        />
        <ChipCard
          icon={<TriangleAlert size={16} className="text-amber-600" />}
          title="To improve"
          items={r.weaknesses}
          empty="No major gaps — nice work!"
          tone="amber"
        />
      </div>

      {/* Recommendations */}
      <Card className="mb-5 rounded-3xl p-7">
        <div className="mb-4 flex items-center gap-2">
          <Target size={16} className="text-indigo-600" />
          <h3 className="font-display font-bold text-foreground">Recommended focus</h3>
        </div>
        <ul className="mb-5 list-disc space-y-1 pl-5 text-sm text-foreground">
          {r.recommendedFocus.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <div className="mb-2 text-sm font-semibold text-foreground">Suggested conversation topics</div>
        <div className="flex flex-wrap gap-2">
          {r.recommendedConversationTopics.map((t) => (
            <span key={t} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
              {t.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </Card>

      <div className="mb-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles size={12} className="text-purple-500" />
        Assessed by <span className="font-medium text-foreground">{r.providerName}</span>
        {r.fallbackUsed && " · baseline evaluator"}
      </div>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={() => navigate("/onboarding/placement-test")} className="flex-1" size="lg">
          Retake test
        </Button>
        <Button onClick={() => navigate("/billing/pricing")} className="flex-1" size="lg">
          Choose a plan <ArrowRight size={18} />
        </Button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-xl">{children}</div>
    </div>
  );
}

function ChipCard({
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
        <h3 className="font-display font-bold text-foreground">{title}</h3>
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
