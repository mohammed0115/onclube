import { useState } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AIBadge } from "@/components/ai";
import { placementQuestions } from "@/data/mockData";
import { cn } from "@/lib/utils";

export function PlacementTestPage() {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const q = placementQuestions[index];
  const selected = answers[index];
  const isLast = index === placementQuestions.length - 1;

  const next = () => {
    if (selected === undefined) return;
    if (isLast) navigate("/onboarding/placement-result");
    else setIndex((i) => i + 1);
  };

  return (
    <OnboardingLayout step={2} total={3}>
      <div className="mx-auto max-w-xl pt-4">
        <div className="mb-6 flex items-center justify-between">
          <span className="text-sm font-semibold text-indigo-600">
            Question {index + 1} of {placementQuestions.length}
          </span>
          <div className="flex gap-1.5">
            {placementQuestions.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-2 rounded-full transition-all",
                  i < index ? "w-6 bg-indigo-600" : i === index ? "w-10 bg-indigo-400" : "w-6 bg-muted"
                )}
              />
            ))}
          </div>
        </div>

        <Card className="mb-5 rounded-3xl p-8">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100">
              <Sparkles size={14} className="text-purple-600" />
            </div>
            <AIBadge label="AI placement" />
          </div>
          <h3 className="mb-7 font-display text-xl font-bold text-foreground">{q.prompt}</h3>
          <div className="flex flex-col gap-3">
            {q.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => setAnswers((a) => ({ ...a, [index]: i }))}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-2 p-4 text-left text-sm font-medium transition-all",
                  selected === i
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-border bg-background text-foreground hover:border-indigo-200"
                )}
              >
                <div
                  className={cn(
                    "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2",
                    selected === i ? "border-indigo-600 bg-indigo-600" : "border-border"
                  )}
                >
                  {selected === i && <div className="h-2 w-2 rounded-full bg-white" />}
                </div>
                {opt}
              </button>
            ))}
          </div>
        </Card>

        <div className="flex gap-3">
          {index > 0 && (
            <Button variant="ghost" onClick={() => setIndex((i) => i - 1)} className="flex-1" size="lg">
              <ChevronLeft size={18} /> Back
            </Button>
          )}
          <Button onClick={next} disabled={selected === undefined} className="flex-1" size="lg">
            {isLast ? "See my result" : "Next"} <ChevronRight size={18} />
          </Button>
        </div>
      </div>
    </OnboardingLayout>
  );
}
