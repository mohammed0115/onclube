import { useState } from "react";
import { useNavigate } from "react-router";
import * as Icons from "lucide-react";
import { ChevronRight } from "lucide-react";
import { OnboardingLayout } from "@/components/layout/OnboardingLayout";
import { OptionCard, CheckMark } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { goals } from "@/data/mockData";
import { cn } from "@/lib/utils";

function GoalIcon({ name }: { name: string }) {
  const Cmp = (Icons[name as keyof typeof Icons] ?? Icons.Circle) as Icons.LucideIcon;
  return <Cmp size={22} className="text-white" />;
}

export function GoalSelectionPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string>("");

  return (
    <OnboardingLayout step={1} total={3}>
      <div className="mx-auto max-w-2xl pt-4">
        <div className="mb-10 text-center">
          <h2 className="font-display text-3xl font-extrabold text-foreground">What do you want to practise?</h2>
          <p className="mt-3 text-muted-foreground">
            Your goal shapes which topics and questions instructors prepare for you.
          </p>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
          {goals.map((g) => (
            <OptionCard
              key={g.id}
              selected={selected === g.id}
              onClick={() => setSelected(g.id)}
              className="flex flex-col items-center gap-3 text-center"
            >
              <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br", g.accent)}>
                <GoalIcon name={g.icon} />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{g.label}</div>
                <div className="text-xs text-muted-foreground">{g.description}</div>
              </div>
              <CheckMark on={selected === g.id} />
            </OptionCard>
          ))}
        </div>

        <Button
          onClick={() => selected && navigate("/onboarding/placement-test")}
          disabled={!selected}
          className="w-full"
          size="lg"
        >
          Continue to placement test <ChevronRight size={18} />
        </Button>
      </div>
    </OnboardingLayout>
  );
}
