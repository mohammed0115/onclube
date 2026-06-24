import { useNavigate } from "react-router";
import { Award, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CircleScore } from "@/components/cards";
import { AIBadge } from "@/components/ai";
import { placementResult } from "@/data/mockData";

export function PlacementResultPage() {
  const navigate = useNavigate();
  const r = placementResult;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-xl">
        <div className="mb-6 rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-600 p-8 text-center text-white shadow-2xl shadow-indigo-300/30">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
            <Award size={28} className="text-yellow-300" />
          </div>
          <div className="mb-2 flex items-center justify-center gap-2">
            <AIBadge label="AI placement" className="bg-white/20 text-white" />
          </div>
          <h2 className="text-2xl font-extrabold">Your estimated level</h2>
          <div className="mt-3 text-5xl font-extrabold">{r.level}</div>
          <div className="text-xl font-semibold text-indigo-200">{r.levelLabel}</div>
          <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-indigo-200">{r.summary}</p>
        </div>

        <Card className="mb-5 rounded-3xl p-7">
          <h3 className="mb-6 text-center font-display font-bold text-foreground">Skill breakdown</h3>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {r.skills.map((s) => (
              <CircleScore key={s.label} {...s} />
            ))}
          </div>
        </Card>

        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => navigate("/onboarding/placement-test")} className="flex-1" size="lg">
            Retake test
          </Button>
          <Button onClick={() => navigate("/billing/pricing")} className="flex-1" size="lg">
            Choose a plan <ArrowRight size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}
