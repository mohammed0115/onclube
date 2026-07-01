import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, ShieldCheck, ArrowRight, Mail, CheckCircle2, RefreshCw } from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PaymentStatusBadge } from "@/components/payment";
import { billingApi } from "@/api";
import { qk } from "@/query/queryClient";

export function PaymentUnderReviewPage() {
  // Poll the real subscription. It activates only when an admin approves the proof.
  const { data: subscription, isFetching, refetch } = useQuery({
    queryKey: qk.subscription,
    queryFn: billingApi.currentSubscription,
    refetchInterval: 8000,
  });

  const approved = subscription?.status === "active";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4 md:px-8">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Logo />
          <PaymentStatusBadge status={approved ? "approved" : "pending"} />
        </div>
      </header>

      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div
          className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full ${
            approved ? "bg-emerald-100" : "bg-amber-100"
          }`}
        >
          {approved ? (
            <CheckCircle2 size={34} className="text-emerald-600" />
          ) : (
            <Clock size={34} className="text-amber-600" />
          )}
        </div>

        {approved ? (
          <>
            <h1 className="font-display text-3xl font-extrabold text-foreground">You’re approved!</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Your <span className="font-semibold text-foreground">{subscription?.planName}</span> plan is active with{" "}
              {subscription?.sessionsRemaining} sessions ready. You can start booking now.
            </p>
            <div className="mt-8">
              <Button asChild size="lg" className="w-full">
                <Link to="/student">
                  Go to your dashboard <ArrowRight size={18} />
                </Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="font-display text-3xl font-extrabold text-foreground">Payment under review</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Thanks! We received your transfer proof. An admin will verify it and activate your account. You
              can&apos;t book sessions until it&apos;s approved.
            </p>

            <Card className="mt-8 p-6 text-left">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-100">
                  <ShieldCheck size={16} className="text-indigo-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">What happens next</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Reviews usually take a few hours during working days. Every payment is checked manually by a
                    human admin — proofs are never auto-approved.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-start gap-3 border-t border-border pt-4">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-100">
                  <Mail size={16} className="text-indigo-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">We&apos;ll notify you</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    You&apos;ll get an email the moment your account is activated, and your dashboard will unlock
                    booking. This page checks automatically.
                  </p>
                </div>
              </div>
            </Card>

            <div className="mt-8">
              <Button onClick={() => refetch()} variant="ghost" size="lg" className="w-full" disabled={isFetching}>
                <RefreshCw size={16} className={isFetching ? "animate-spin" : ""} />
                {isFetching ? "Checking…" : "Check status now"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
