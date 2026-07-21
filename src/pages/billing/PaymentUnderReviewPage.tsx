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
import { useI18n } from "@/i18n";

type View = "loading" | "error" | "approved" | "rejected" | "needs_info" | "pending";

export function PaymentUnderReviewPage() {
  const { tx } = useI18n();
  const navigate = useNavigate();
  // Poll BOTH the subscription (activation is the source of truth) and the latest
  // proof (for the rejected / needs-info states + the admin's review note).
  const subQuery = useSubscription();
  const proofQuery = useLatestPaymentProof({ refetchInterval: 8000 });

  const active = subQuery.data?.status === "active";
  const proof = proofQuery.data;
  const proofStatus = proof?.status;
  // AI-tutor payments activate a SEPARATE AI subscription (not session credits), so
  // the approved/pending copy and the onward link must adapt to the plan kind.
  const isAI = proof?.planKind === "ai_tutor";
  // Approval is the LATEST proof being approved. The generic (sessions) subscription
  // only counts for a sessions payment — otherwise a student who already has an active
  // sessions plan would see a still-pending AI payment as "approved".
  const approved = proofStatus === "approved" || (!isAI && active);

  let view: View;
  if (proofQuery.isLoading && subQuery.isLoading) view = "loading";
  else if (proofQuery.isError) view = "error";
  else if (approved) view = "approved";
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
            <h1 className="font-display text-3xl font-extrabold text-foreground">{tx("You’re approved!")}</h1>
            {isAI ? (
              <>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                  {tx("Your")} <span className="font-semibold text-foreground">{proof?.planName}</span> {tx("plan is active")}. {tx("Start a 5-minute AI speaking practice any time.")}
                </p>
                <div className="mt-8">
                  <Button asChild size="lg" className="w-full">
                    <Link to="/student/ai-tutor">
                      {tx("Start practising")} <ArrowRight size={18} />
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                  {tx("Your")} <span className="font-semibold text-foreground">{subQuery.data?.planName ?? proof?.planName}</span> {tx("plan is active")}
                  {subQuery.data ? ` with ${subQuery.data.sessionsRemaining} sessions ready` : ""}. {tx("You can start booking now.")}
                </p>
                <div className="mt-8">
                  <Button asChild size="lg" className="w-full">
                    <Link to="/student/schedule">
                      {tx("Set your availability")} <ArrowRight size={18} />
                    </Link>
                  </Button>
                </div>
              </>
            )}
          </>
        )}

        {view === "rejected" && (
          <ReviewOutcome
            tone="red"
            icon={<XCircle size={34} className="text-red-600" />}
            title="Payment not approved"
            note={proof?.reviewNote}
            fallback="Your payment proof was rejected. Please review and submit a new transfer proof."
            onResubmit={() => navigate(isAI ? "/student/ai-tutor" : "/billing/pricing")}
          />
        )}

        {view === "needs_info" && (
          <ReviewOutcome
            tone="amber"
            icon={<Info size={34} className="text-amber-600" />}
            title="More information needed"
            note={proof?.reviewNote}
            fallback="We need a bit more information to verify your payment. Please review and re-submit."
            onResubmit={() => navigate(isAI ? "/student/ai-tutor" : "/billing/pricing")}
          />
        )}

        {view === "pending" && (
          <>
            <Hero tone="amber" icon={<Clock size={34} className="text-amber-600" />} />
            <h1 className="font-display text-3xl font-extrabold text-foreground">{tx("Payment under review")}</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              {isAI
                ? tx("Thanks! We received your transfer proof. An admin will verify it and activate your AI Tutor. This page checks automatically.")
                : tx("Thanks! We received your transfer proof. An admin will verify it and activate your account. You can't book sessions until it's approved.")}
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
                {proofQuery.isFetching ? tx("Checking…") : tx("Check status now")}
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
  const { tx } = useI18n();
  return (
    <>
      <Hero tone={tone} icon={icon} />
      <h1 className="font-display text-3xl font-extrabold text-foreground">{tx(title)}</h1>
      <div
        role="alert"
        className={`mx-auto mt-4 max-w-md rounded-2xl border px-4 py-3 text-left text-sm ${
          tone === "red" ? "border-red-100 bg-red-50/60 text-red-800" : "border-amber-100 bg-amber-50/60 text-amber-800"
        }`}
      >
        {note || tx(fallback)}
      </div>
      <div className="mt-8">
        <Button onClick={onResubmit} size="lg" className="w-full">
          {tx("Re-submit payment proof")} <ArrowRight size={18} />
        </Button>
      </div>
    </>
  );
}

function InfoRow({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  const { tx } = useI18n();
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-100">{icon}</div>
      <div>
        <div className="text-sm font-semibold text-foreground">{tx(title)}</div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tx(body)}</p>
      </div>
    </div>
  );
}
