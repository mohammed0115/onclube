import { useNavigate } from "react-router";
import { Clock, ShieldCheck, ArrowRight, Mail } from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PaymentStatusBadge } from "@/components/payment";
import { useAppState } from "@/app/AppState";
import { plans } from "@/data/mockData";

export function PaymentUnderReviewPage() {
  const navigate = useNavigate();
  const { setPaymentStatus } = useAppState();
  const plan = plans.find((p) => p.recommended) ?? plans[0];

  // Demo-only: mimic the admin approving the proof so the rest of the flow is reachable.
  const simulateApproval = () => {
    setPaymentStatus("approved");
    navigate("/student");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4 md:px-8">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Logo />
          <PaymentStatusBadge status="pending" />
        </div>
      </header>

      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
          <Clock size={34} className="text-amber-600" />
        </div>
        <h1 className="font-display text-3xl font-extrabold text-foreground">Payment under review</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Thanks! We received your transfer proof for the{" "}
          <span className="font-semibold text-foreground">{plan.name}</span> plan. An admin will verify it and
          activate your account. You can&apos;t book sessions until it&apos;s approved.
        </p>

        <Card className="mt-8 p-6 text-left">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-100">
              <ShieldCheck size={16} className="text-indigo-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">What happens next</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Reviews usually take a few hours during working days. Every payment is checked manually by a human
                admin — proofs are never auto-approved.
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
                You&apos;ll get an email the moment your account is activated, and your dashboard will unlock booking.
              </p>
            </div>
          </div>
        </Card>

        <div className="mt-8 space-y-3">
          <Button onClick={simulateApproval} size="lg" className="w-full">
            Simulate admin approval (demo) <ArrowRight size={18} />
          </Button>
          <p className="text-xs text-muted-foreground">
            In the real product you&apos;d wait for the email. This button is here so you can explore the student
            experience.
          </p>
        </div>
      </div>
    </div>
  );
}
