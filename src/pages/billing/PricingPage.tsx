import { useState } from "react";
import { useNavigate } from "react-router";
import { CheckCircle, ArrowRight } from "lucide-react";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Button } from "@/components/ui/button";
import { plans } from "@/data/mockData";
import { cn } from "@/lib/utils";

export function PricingPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string>("regular");

  return (
    <div className="min-h-screen bg-[#08081A] font-display">
      <MarketingNav />
      <section className="px-6 pb-24 pt-32 md:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-indigo-400">Pricing</span>
            <h2 className="mt-3 text-4xl font-extrabold text-white">Pay for sessions, nothing else</h2>
            <p className="mx-auto mt-3 max-w-md text-gray-400">
              Every plan includes prep questions and an AI report. Pay by local bank transfer — we activate your
              account once an admin confirms.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {plans.map((plan) => {
              const active = selected === plan.id;
              return (
                <button
                  key={plan.id}
                  onClick={() => setSelected(plan.id)}
                  className={cn(
                    "relative flex flex-col rounded-3xl border-2 p-7 text-left transition-all",
                    plan.recommended ? "scale-[1.02]" : "",
                    active
                      ? "border-indigo-400 bg-white/10 backdrop-blur-xl"
                      : "border-white/10 bg-white/5 backdrop-blur-xl hover:border-white/25"
                  )}
                >
                  {plan.recommended && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-1.5 text-xs font-bold text-white">
                      ✦ Most popular
                    </div>
                  )}
                  <div className="mb-3 text-3xl">{plan.emoji}</div>
                  <div className="text-lg font-bold text-white">{plan.name}</div>
                  <div className="mb-4 text-xs text-gray-400">{plan.description}</div>
                  <div className="mb-5">
                    <span className="text-4xl font-extrabold text-white">{plan.price}</span>
                    <span className="text-sm text-gray-400"> {plan.currency} {plan.cadence}</span>
                  </div>
                  <ul className="mb-7 flex-1 space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-gray-300">
                        <CheckCircle size={15} className={cn("mt-0.5 flex-shrink-0", plan.recommended ? "text-indigo-400" : "text-emerald-400")} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all",
                      active ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white" : "border border-white/20 text-white"
                    )}
                  >
                    {active ? "Selected" : "Select plan"}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-10 flex justify-center">
            <Button onClick={() => navigate("/billing/bank-transfer")} size="lg">
              Continue to payment <ArrowRight size={18} />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
