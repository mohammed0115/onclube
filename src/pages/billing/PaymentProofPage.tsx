import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, UploadCloud, FileCheck2 } from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms";
import { useAppState } from "@/app/AppState";
import { plans } from "@/data/mockData";
import { cn } from "@/lib/utils";

export function PaymentProofPage() {
  const navigate = useNavigate();
  const { setPaymentStatus } = useAppState();
  const [fileName, setFileName] = useState("");
  const plan = plans.find((p) => p.recommended) ?? plans[0];

  const submit = () => {
    // Business rule: proof goes to the admin queue as "pending" — never auto-approved.
    setPaymentStatus("pending");
    navigate("/billing/under-review");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4 md:px-8">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Logo />
          <span className="text-sm text-muted-foreground">Step 2 of 2 · Submit proof</span>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-extrabold text-foreground">Submit your payment proof</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload the receipt and confirm the details. An admin will review and approve it.
          </p>
        </div>

        <Card className="p-7">
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Plan" htmlFor="plan" defaultValue={`${plan.name} — ${plan.price} ${plan.currency}`} readOnly />
              <Field label="Transfer reference" htmlFor="ref" placeholder="e.g. TRX-48201" />
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Transfer date" htmlFor="date" type="date" />
              <Field label="Amount transferred" htmlFor="amount" defaultValue={`${plan.price} ${plan.currency}`} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Receipt
              </label>
              <label
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
                  fileName ? "border-emerald-300 bg-emerald-50" : "border-border bg-muted/30 hover:border-indigo-300"
                )}
              >
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "receipt.jpg")}
                />
                {fileName ? (
                  <>
                    <FileCheck2 size={28} className="text-emerald-600" />
                    <span className="text-sm font-semibold text-emerald-700">{fileName}</span>
                    <span className="text-xs text-emerald-600">Tap to replace</span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={28} className="text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">Upload receipt or screenshot</span>
                    <span className="text-xs text-muted-foreground">JPG, PNG or PDF</span>
                  </>
                )}
              </label>
            </div>
          </div>

          <Button onClick={submit} className="mt-7 w-full" size="lg">
            Submit for review <ArrowRight size={18} />
          </Button>
        </Card>
      </div>
    </div>
  );
}
