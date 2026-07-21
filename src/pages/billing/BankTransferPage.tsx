import { useNavigate } from "react-router";
import { ArrowRight, Info } from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BankDetailsCard } from "@/components/payment";
import { QueryBoundary } from "@/components/states";
import { useBankAccount, usePlans } from "@/hooks";
import { SELECTED_PLAN_KEY } from "@/pages/billing/PricingPage";
import { useI18n } from "@/i18n";

const STEPS = [
  "Open your banking app and start a transfer to the account above.",
  "Use your full name as the transfer reference so we can match it.",
  "Keep the receipt or screenshot — you'll upload it on the next step.",
];

export function BankTransferPage() {
  const { tx } = useI18n();
  const navigate = useNavigate();
  const instructions = useBankAccount();
  // The real plan the student selected on the pricing page (no mock data).
  const plansQuery = usePlans();
  const selectedId = sessionStorage.getItem(SELECTED_PLAN_KEY);
  const allPlans = plansQuery.data ?? [];
  const plan = allPlans.find((p) => p.id === selectedId) ?? allPlans.find((p) => p.recommended) ?? allPlans[0];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4 md:px-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Logo />
          <span className="text-sm text-muted-foreground">{tx("Step 1 of 2 · Bank transfer")}</span>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-extrabold text-foreground">{tx("Pay by bank transfer")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tx("We don't take cards. Transfer the amount, then submit your proof — an admin confirms it shortly after.")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <QueryBoundary query={instructions} loadingLabel="Loading payment details…">
              {(cfg) => (
                <>
                  <BankDetailsCard account={cfg} />

                  <Card className="p-6">
                    <h3 className="mb-4 font-display font-bold text-foreground">{tx("How to pay")}</h3>
                    {cfg.instructions && (
                      <p className="mb-4 text-sm text-muted-foreground">{cfg.instructions}</p>
                    )}
                    <ol className="space-y-3">
                      {STEPS.map((s, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-foreground">
                          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                            {i + 1}
                          </span>
                          {tx(s)}
                        </li>
                      ))}
                    </ol>
                  </Card>
                </>
              )}
            </QueryBoundary>
          </div>

          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="mb-5 font-display font-bold text-foreground">{tx("Order summary")}</h3>
              {plan ? (
                <>
                  <div className="flex items-start gap-4 border-b border-border pb-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-xl">
                      {plan.emoji}
                    </div>
                    <div>
                      <div className="font-bold text-foreground">{plan.name} {tx("plan")}</div>
                      <div className="text-sm text-muted-foreground">
                        {plan.kind === "ai_tutor"
                          ? tx("AI speaking practice")
                          : `${plan.sessionsPerMonth} ${tx("live sessions / month")}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-5">
                    <span className="font-bold text-foreground">{tx("Amount to transfer")}</span>
                    <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-2xl font-extrabold text-transparent">
                      {plan.price} {plan.currency}
                    </span>
                  </div>
                </>
              ) : (
                <div className="h-16 animate-pulse rounded-xl bg-muted" aria-hidden />
              )}
            </Card>

            <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-800">
              <Info size={16} className="mt-0.5 flex-shrink-0 text-indigo-600" />
              {tx("You can't book sessions until an admin approves your payment. This usually takes a few hours.")}
            </div>

            <Button onClick={() => navigate("/billing/payment-proof")} className="w-full" size="lg">
              {tx("I've transferred — upload proof")} <ArrowRight size={18} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
