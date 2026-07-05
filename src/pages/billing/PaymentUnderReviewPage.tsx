import { Link, useNavigate } from "react-router";
import {
  Clock,
  ShieldCheck,
  ArrowRight,
  Mail,
  CheckCircle2,
  RefreshCw,
  XCircle,
  Info,
} from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PaymentStatusBadge } from "@/components/payment";
import { Loading, ErrorState } from "@/components/states";
import { useSubscription, useLatestPaymentProof } from "@/hooks";

type View = "loading" | "error" | "approved" | "rejected" | "needs_info" | "pending";

export function PaymentUnderReviewPage() {
  const navigate = useNavigate();
  // Poll BOTH the subscription (activation is the source of truth) and the latest
  // proof (for the rejected / needs-info states + the admin's review note).
  const subQuery = useSubscription();
  const proofQuery = useLatestPaymentProof({ refetchInterval: 8000 });

  const active = subQuery.data?.status === "active";
  const proof = proofQuery.data;
  const proofStatus = proof?.status;

  let view: View;
  if (proofQuery.isLoading && subQuery.isLoading) view = "loading";
  else if (proofQuery.isError) view = "error";
  else if (active || proofStatus === "approved") view = "approved";
  else if (proofStatus === "rejected") view = "rejected";
  else if (proofStatus === "needs_info") view = "needs_info";
  else view = "pending";

  const badge =
    view === "approved"
      ? "approved"
      : view === "rejected"
      ? "rejected"
      : "pending";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4 md:px-8">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Logo />
          <PaymentStatusBadge status={badge} />
        </div>
      </header>

      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        {view === "loading" && <Loading label="Checking your payment status…" />}

        {view === "error" && (
          <ErrorState error={proofQuery.error} onRetry={() => proofQuery.refetch()} />
        )}

        {view === "approved" && (
          <>
            <Hero tone="emerald" icon={<CheckCircle2 size={34} className="text-emerald-600" />} />
            <h1 className="font-display text-3xl font-extrabold text-foreground">You’re approved!</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Your <span className="font-semibold text-foreground">{subQuery.data?.planName}</span> plan is active
              {subQuery.data ? ` with ${subQuery.data.sessionsRemaining} sessions ready` : ""}. You can start booking now.
            </p>
            <div className="mt-8">
              <Button asChild size="lg" className="w-full">
                <Link to="/student/book">
                  Continue to booking <ArrowRight size={18} />
                </Link>
              </Button>
            </div>
          </>
        )}

        {view === "rejected" && (
          <ReviewOutcome
            tone="red"
            icon={<XCircle size={34} className="text-red-600" />}
            title="Payment not approved"
            note={proof?.reviewNote}
            fallback="Your payment proof was rejected. Please review and submit a new transfer proof."
            onResubmit={() => navigate("/billing/pricing")}
          />
        )}

        {view === "needs_info" && (
          <ReviewOutcome
            tone="amber"
            icon={<Info size={34} className="text-amber-600" />}
            title="More information needed"
            note={proof?.reviewNote}
            fallback="We need a bit more information to verify your payment. Please review and re-submit."
            onResubmit={() => navigate("/billing/pricing")}
          />
        )}

        {view === "pending" && (
          <>
            <Hero tone="amber" icon={<Clock size={34} className="text-amber-600" />} />
            <h1 className="font-display text-3xl font-extrabold text-foreground">Payment under review</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Thanks! We received your transfer proof. An admin will verify it and activate your account. You
              can&apos;t book sessions until it&apos;s approved.
            </p>

            <Card className="mt-8 p-6 text-left">
              <InfoRow
                icon={<ShieldCheck size={16} className="text-indigo-600" />}
                title="What happens next"
                body="Reviews usually take a few hours during working days. Every payment is checked manually by a human admin — proofs are never auto-approved."
              />
              <div className="mt-4 border-t border-border pt-4">
                <InfoRow
                  icon={<Mail size={16} className="text-indigo-600" />}
                  title="We'll notify you"
                  body="You'll be notified the moment your account is activated, and your dashboard will unlock booking. This page checks automatically."
                />
              </div>
            </Card>

            <div className="mt-8">
              <Button
                onClick={() => proofQuery.refetch()}
                variant="ghost"
                size="lg"
                className="w-full"
                disabled={proofQuery.isFetching}
              >
                <RefreshCw size={16} className={proofQuery.isFetching ? "animate-spin" : ""} />
                {proofQuery.isFetching ? "Checking…" : "Check status now"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Hero({ tone, icon }: { tone: "emerald" | "amber" | "red"; icon: React.ReactNode }) {
  const bg = tone === "emerald" ? "bg-emerald-100" : tone === "red" ? "bg-red-100" : "bg-amber-100";
  return <div className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full ${bg}`}>{icon}</div>;
}

function ReviewOutcome({
  tone,
  icon,
  title,
  note,
  fallback,
  onResubmit,
}: {
  tone: "amber" | "red";
  icon: React.ReactNode;
  title: string;
  note?: string | null;
  fallback: string;
  onResubmit: () => void;
}) {
  return (
    <>
      <Hero tone={tone} icon={icon} />
      <h1 className="font-display text-3xl font-extrabold text-foreground">{title}</h1>
      <div
        role="alert"
        className={`mx-auto mt-4 max-w-md rounded-2xl border px-4 py-3 text-left text-sm ${
          tone === "red" ? "border-red-100 bg-red-50/60 text-red-800" : "border-amber-100 bg-amber-50/60 text-amber-800"
        }`}
      >
        {note || fallback}
      </div>
      <div className="mt-8">
        <Button onClick={onResubmit} size="lg" className="w-full">
          Re-submit payment proof <ArrowRight size={18} />
        </Button>
      </div>
    </>
  );
}

function InfoRow({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-100">{icon}</div>
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
