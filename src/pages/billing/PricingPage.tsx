import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { CheckCircle, ArrowRight } from "lucide-react";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Button } from "@/components/ui/button";
import { usePlans } from "@/hooks";
import { Loading, ErrorState } from "@/components/states";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

/** Remembers the chosen plan for the payment-proof step (no redesign needed). */
export const SELECTED_PLAN_KEY = "ec_selected_plan";

export function PricingPage() {
  const { tx } = useI18n();
  const navigate = useNavigate();
  const { data: plans, isLoading, isError, error, refetch } = usePlans();
  const [selected, setSelected] = useState<string>("");

  // Default to the recommended plan once data arrives.
  useEffect(() => {
    if (plans && !selected) {
      const rec = plans.find((p) => p.recommended) ?? plans[0];
      if (rec) setSelected(rec.id);
    }
  }, [plans, selected]);

  function handleContinue() {
    if (selected) sessionStorage.setItem(SELECTED_PLAN_KEY, selected);
    navigate("/billing/bank-transfer");
  }

  return (
    <div className="min-h-screen bg-surface-2 font-display">
      <MarketingNav />
      <section className="px-6 pb-24 pt-32 md:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <span className="text-sm font-bold uppercase tracking-widest text-primary">{tx("Pricing")}</span>
            <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-foreground">{tx("Pay for sessions, nothing else")}</h2>
            <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
              {tx("Every plan includes prep questions and an AI report. Pay by local bank transfer — we activate your account once an admin confirms.")}
            </p>
          </div>

          {isLoading && <Loading label="Loading plans…" />}
          {isError && <ErrorState error={error} onRetry={() => refetch()} />}

          {plans && (
            <>
              <div className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {plans.map((plan) => {
                  const active = selected === plan.id;
                  const perSession = plan.sessionsPerMonth > 0 ? Math.round(plan.price / plan.sessionsPerMonth) : plan.price;
                  return (
                    <button
                      key={plan.id}
                      onClick={() => setSelected(plan.id)}
                      className={cn(
                        "relative flex flex-col rounded-3xl border-2 bg-card p-6 text-left transition-all",
                        plan.recommended ? "shadow-lg shadow-blue-100" : "shadow-sm",
                        active
                          ? "border-primary ring-4 ring-blue-100"
                          : "border-border hover:border-blue-200 hover:shadow-md"
                      )}
                    >
                      {plan.recommended && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-orange-500 px-5 py-1.5 text-xs font-bold text-white shadow-sm shadow-orange-500/30">
                          {tx("✦ Most popular")}
                        </div>
                      )}
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-3xl">{plan.emoji}</div>
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-primary">
                          {plan.sessionsPerMonth} {plan.sessionsPerMonth === 1 ? tx("session") : tx("sessions")}
                        </span>
                      </div>
                      <div className="text-lg font-bold text-foreground">{plan.name}</div>
                      <div className="mb-4 text-xs text-muted-foreground">{plan.description}</div>
                      <div className="mb-1">
                        <span className="text-3xl font-extrabold text-foreground">{plan.price.toLocaleString()}</span>
                        <span className="text-sm text-muted-foreground"> {plan.currency} {plan.cadence}</span>
                      </div>
                      <div className="mb-5 text-xs text-muted-foreground">
                        {perSession.toLocaleString()} {plan.currency} {tx("/ session")}
                      </div>
                      <ul className="mb-6 flex-1 space-y-2.5">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600">
                            <CheckCircle size={15} className={cn("mt-0.5 flex-shrink-0", plan.recommended ? "text-primary" : "text-success")} />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <div
                        className={cn(
                          "flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all",
                          active ? "bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-600/25" : "border border-border bg-card text-foreground"
                        )}
                      >
                        {active ? tx("Selected") : tx("Select plan")}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-10 flex justify-center">
                <Button onClick={handleContinue} disabled={!selected} size="lg">
                  {tx("Continue to payment")} <ArrowRight size={18} />
                </Button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
