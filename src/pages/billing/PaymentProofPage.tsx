import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, UploadCloud, FileCheck2 } from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms";
import { usePlans, useSubmitPaymentProof } from "@/hooks";
import { Loading, ErrorState } from "@/components/states";
import { ApiError } from "@/api";
import { SELECTED_PLAN_KEY } from "@/pages/billing/PricingPage";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

export function PaymentProofPage() {
  const { tx } = useI18n();
  const navigate = useNavigate();
  const { data: plans, isLoading, isError, error, refetch } = usePlans();
  const submitProof = useSubmitPaymentProof();

  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState("");
  const [transferDate, setTransferDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Loading label="Loading your plan…" />
      </div>
    );
  }
  if (isError || !plans) {
    return (
      <div className="min-h-screen bg-background p-8">
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  const selectedId = sessionStorage.getItem(SELECTED_PLAN_KEY);
  const plan = plans.find((p) => p.id === selectedId) ?? plans.find((p) => p.recommended) ?? plans[0];

  async function submit() {
    setFormError(null);
    if (!plan) return;
    if (!reference.trim()) return setFormError("Please enter the transfer reference.");
    if (!transferDate) return setFormError("Please enter the transfer date.");
    if (!file) return setFormError("Please attach the receipt.");
    try {
      // The proof enters the admin queue as pending_review — never auto-approved.
      await submitProof.mutateAsync({
        planId: plan.id,
        transactionNumber: reference.trim(),
        transferDatetime: new Date(transferDate).toISOString(),
        amount: plan.price,
        receipt: file,
      });
      navigate("/billing/under-review");
    } catch (err) {
      if (err instanceof ApiError && err.code === "duplicate_transaction_number") {
        setFormError("This transfer reference has already been submitted.");
      } else if (err instanceof ApiError && err.status === 422) {
        setFormError("Please check the details and try again.");
      } else {
        setFormError("Could not submit your proof. Please try again.");
      }
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4 md:px-8">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Logo />
          <span className="text-sm text-muted-foreground">{tx("Step 2 of 2 · Submit proof")}</span>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-extrabold text-foreground">{tx("Submit your payment proof")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tx("Upload the receipt and confirm the details. An admin will review and approve it.")}
          </p>
        </div>

        <Card className="p-7">
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label={tx("Plan")} htmlFor="plan" value={`${plan.name} — ${plan.price} ${plan.currency}`} readOnly />
              <Field
                label={tx("Transfer reference")}
                htmlFor="ref"
                placeholder={tx("e.g. TRX-48201")}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                label={tx("Transfer date")}
                htmlFor="date"
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
              />
              <Field label={tx("Amount transferred")} htmlFor="amount" value={`${plan.price} ${plan.currency}`} readOnly />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {tx("Receipt")}
              </label>
              <label
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
                  file ? "border-emerald-300 bg-emerald-50" : "border-border bg-muted/30 hover:border-indigo-300"
                )}
              >
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <>
                    <FileCheck2 size={28} className="text-emerald-600" />
                    <span className="text-sm font-semibold text-emerald-700">{file.name}</span>
                    <span className="text-xs text-emerald-600">{tx("Tap to replace")}</span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={28} className="text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">{tx("Upload receipt or screenshot")}</span>
                    <span className="text-xs text-muted-foreground">{tx("JPG, PNG or PDF")}</span>
                  </>
                )}
              </label>
            </div>
          </div>

          {formError && (
            <p role="alert" className="mt-4 text-sm font-medium text-red-600">
              {tx(formError)}
            </p>
          )}

          <Button onClick={submit} disabled={submitProof.isPending} className="mt-7 w-full" size="lg">
            {submitProof.isPending ? tx("Submitting…") : (
              <>
                {tx("Submit for review")} <ArrowRight size={18} />
              </>
            )}
          </Button>
        </Card>
      </div>
    </div>
  );
}
