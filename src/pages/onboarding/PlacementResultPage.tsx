import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState, EmptyState } from "@/components/states";
import {
  CEFRCard,
  DifficultyCard,
  RecommendationCard,
  ResultFooter,
  ResultHeader,
  ResultSkeleton,
  SkillScoreCard,
  StrengthCard,
  SummaryCard,
  WeaknessCard,
} from "@/components/placement/result";
import { usePlacementResult } from "@/hooks";
import { ApiError } from "@/api";

const LEVEL_LABEL: Record<string, string> = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper-intermediate",
  C1: "Advanced",
};

/**
 * Placement Result — presentation + orchestration ONLY.
 * Renders the validated backend DTO verbatim: no score calculation, no CEFR
 * estimation, and no internal AI data (provider name / raw response / prompts).
 */
export function PlacementResultPage() {
  const navigate = useNavigate();
  const resultQuery = usePlacementResult();

  if (resultQuery.isLoading)
    return (
      <Shell>
        <ResultSkeleton />
      </Shell>
    );

  if (resultQuery.isError) {
    const err = resultQuery.error;
    // Missing assessment → empty state (standard domain error contract).
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
    // Network / unauthorized / expired / server error → retryable error state.
    return (
      <Shell>
        <ErrorState error={err} onRetry={() => resultQuery.refetch()} />
      </Shell>
    );
  }

  const r = resultQuery.data!;
  const skills = [
    { label: "Grammar", value: r.grammarScore, color: "#3B82F6" },
    { label: "Vocabulary", value: r.vocabularyScore, color: "#06B6D4" },
    { label: "Fluency", value: r.fluencyScore, color: "#22C55E" },
    { label: "Confidence", value: r.confidenceScore, color: "#F59E0B" },
    { label: "Written", value: r.writtenScore, color: "#6366F1" },
    { label: "Spoken", value: r.spokenScore, color: "#F97316" },
  ];

  return (
    <Shell>
      <ResultHeader />
      <CEFRCard level={r.cefrLevel} />
      <SummaryCard
        level={r.cefrLevel}
        levelLabel={LEVEL_LABEL[r.cefrLevel] ?? r.cefrLevel}
        conversationScore={r.overallConversationScore}
        difficulty={r.recommendedInstructorDifficulty}
      />

      <Card className="mb-5 rounded-3xl p-6">
        <h2 className="mb-5 font-display font-bold text-foreground">Skill breakdown</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {skills.map((s) => (
            <SkillScoreCard key={s.label} {...s} />
          ))}
        </div>
      </Card>

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <StrengthCard items={r.strengths} />
        <WeaknessCard items={r.weaknesses} />
      </div>

      <RecommendationCard focus={r.recommendedFocus} topics={r.recommendedConversationTopics} />
      <DifficultyCard difficulty={r.recommendedInstructorDifficulty} />

      <ResultFooter
        onContinue={() => navigate("/billing/pricing")}
        onRetake={() => navigate("/onboarding/placement-test")}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-12">
      <div className="w-full max-w-xl">{children}</div>
    </div>
  );
}
