import { useState } from "react";
import { useNavigate } from "react-router";
import * as Icons from "lucide-react";
import { ChevronRight } from "lucide-react";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { OptionCard, CheckMark } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { useGoals, useSetGoal } from "@/hooks";
import { Loading, ErrorState, EmptyState } from "@/components/states";
import { cn } from "@/lib/utils";

function GoalIcon({ name }: { name: string }) {
  const Cmp = (Icons[(name || "Circle") as keyof typeof Icons] ?? Icons.Circle) as Icons.LucideIcon;
  return <Cmp size={22} className="text-white" />;
}

export function GoalSelectionPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string>("");
  const { data: goals, isLoading, isError, error, refetch } = useGoals();
  const setGoal = useSetGoal();

  async function handleContinue() {
    if (!selected) return;
    try {
      await setGoal.mutateAsync(selected);
      navigate("/onboarding/placement-test");
    } catch {
      // Surfaced inline below; keep the user on the page.
    }
  }

  return (
    <OnboardingLayout step={1} total={3}>
      <div className="mx-auto max-w-2xl pt-4">
        <div className="mb-10 text-center">
          <h2 className="font-display text-3xl font-extrabold text-foreground">What do you want to practise?</h2>
          <p className="mt-3 text-muted-foreground">
            Your goal shapes which topics and questions instructors prepare for you.
          </p>
        </div>

        {isLoading && <Loading label="Loading goals…" />}
        {isError && <ErrorState error={error} onRetry={() => refetch()} />}
        {goals && goals.length === 0 && (
          <EmptyState title="No goals available yet" description="Please check back shortly." />
        )}

        {goals && goals.length > 0 && (
          <>
            <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
              {goals.map((g) => (
                <OptionCard
                  key={g.id}
                  selected={selected === g.id}
                  onClick={() => setSelected(g.id)}
                  className="flex flex-col items-center gap-3 text-center"
                >
                  <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br", g.accent ?? "from-indigo-500 to-indigo-600")}>
                    <GoalIcon name={g.icon ?? "Circle"} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{g.label}</div>
                    <div className="text-xs text-muted-foreground">{g.description}</div>
                  </div>
                  <CheckMark on={selected === g.id} />
                </OptionCard>
              ))}
            </div>

            {setGoal.isError && (
              <p role="alert" className="mb-4 text-center text-sm font-medium text-red-600">
                Could not save your goal. Please try again.
              </p>
            )}

            <Button
              onClick={handleContinue}
              disabled={!selected || setGoal.isPending}
              className="w-full"
              size="lg"
            >
              {setGoal.isPending ? "Saving…" : (
                <>
                  Continue to placement test <ChevronRight size={18} />
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </OnboardingLayout>
  );
}
