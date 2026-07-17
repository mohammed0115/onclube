import { useNavigate } from "react-router";
import { Check, X, Mic, Sparkles, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState, EmptyState } from "@/components/states";
import { cn } from "@/lib/utils";
import { usePlacementReview } from "@/hooks";
import type { PlacementReview } from "@/api/types";
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
  C2: "Proficient",
};

/**
 * Placement Result — presentation + orchestration ONLY.
 * Renders the validated backend DTO verbatim: no score calculation, no CEFR
 * estimation, and no internal AI data (provider name / raw response / prompts).
 */
export function PlacementResultPage() {
  const navigate = useNavigate();
  const resultQuery = usePlacementResult();
  const reviewQuery = usePlacementReview();

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

      {reviewQuery.data && <ReviewSection review={reviewQuery.data} />}

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

/** Transparent review: the questions, the learner's own answers, the correct
 * answers (written), their spoken transcripts, and how it was evaluated. */
function ReviewSection({ review }: { review: PlacementReview }) {
  return (
    <Card className="mb-5 rounded-3xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display font-bold text-foreground">Review your answers</h2>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            review.aiUsed ? "bg-indigo-50 text-indigo-700" : "bg-muted text-muted-foreground"
          )}
          title="How your interview was evaluated"
        >
          <Sparkles size={12} /> Evaluated by {review.evaluatedBy}
        </span>
      </div>

      {/* Written */}
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <PenLine size={15} className="text-indigo-600" /> Written
        <span className="ml-auto text-xs font-medium text-muted-foreground">
          {review.writtenCorrect}/{review.writtenTotal} correct · score {review.scores.written}
        </span>
      </div>
      <div className="mb-5 space-y-2.5">
        {review.written.map((w) => (
          <div key={w.questionId} className="rounded-2xl border border-border p-3.5">
            <div className="mb-2 flex items-start gap-2">
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-white",
                  w.isCorrect ? "bg-emerald-500" : "bg-red-500"
                )}
                aria-hidden
              >
                {w.isCorrect ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
              </span>
              <p className="text-sm font-medium text-foreground">{w.prompt}</p>
            </div>
            <div className="ml-7 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className={cn(w.isCorrect ? "text-emerald-700" : "text-red-600")}>
                Your answer: <strong>{w.yourAnswer || "—"}</strong>
              </span>
              {!w.isCorrect && (
                <span className="text-emerald-700">
                  Correct answer: <strong>{w.correctAnswer}</strong>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Spoken */}
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Mic size={15} className="text-indigo-600" /> Spoken interview
        <span className="ml-auto text-xs font-medium text-muted-foreground">score {review.scores.spoken}/100</span>
      </div>
      {/* Spoken questions are OPEN — there is no single "correct" answer, so they
          aren't marked right/wrong. They're scored on how clearly you communicate. */}
      <p className="mb-2 rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        These are open questions — there's no single correct answer. Your spoken answers are scored on how
        clearly you communicate (fluency &amp; confidence), which contributes to your overall level.
      </p>
      <div className="space-y-2.5">
        {review.spoken.map((s) => {
          const answered = !!(s.yourAnswer && s.yourAnswer.trim());
          return (
            <div key={s.questionId} className="rounded-2xl border border-border p-3.5">
              <div className="mb-1 flex items-start gap-2">
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-white",
                    answered ? "bg-emerald-500" : "bg-muted-foreground"
                  )}
                  aria-hidden
                >
                  {answered ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
                </span>
                <p className="text-sm font-medium text-foreground">{s.prompt}</p>
              </div>
              <p className="ml-7 text-xs">
                <span className={answered ? "text-emerald-700" : "text-muted-foreground"}>
                  {answered ? "Answered" : "No answer"}
                </span>
                <span className="text-muted-foreground"> — you said: </span>
                <span className="text-foreground">{s.yourAnswer || "—"}</span>
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
