import { useState } from "react";
import { Check, X, FileText, Eye, Building2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PaymentStatusBadge } from "@/components/payment";
import { useAppState } from "@/app/AppState";
import { paymentProofs, bankAccount } from "@/data/mockData";
import type { PaymentProof, PaymentStatus } from "@/types";
import { cn } from "@/lib/utils";

export function PaymentApprovalPage() {
  const { setPaymentStatus } = useAppState();
  const [proofs, setProofs] = useState<PaymentProof[]>(paymentProofs);
  const [selectedId, setSelectedId] = useState<string>(paymentProofs[0].id);

  const selected = proofs.find((p) => p.id === selectedId) ?? proofs[0];

  const decide = (id: string, status: PaymentStatus) => {
    setProofs((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    // Demo link: approving any proof unlocks booking for the current demo student.
    if (status === "approved") setPaymentStatus("approved");
  };

  const pendingCount = proofs.filter((p) => p.status === "pending").length;

  return (
    <DashboardLayout>
      <PageHeader
        title="Payment approval"
        subtitle="Every transfer is verified manually here — proofs are never auto-approved."
        action={
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            {pendingCount} pending
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Queue */}
        <Card className="overflow-hidden p-0 lg:col-span-2">
          <div className="border-b border-border px-5 py-3">
            <h3 className="text-sm font-bold text-foreground">Submitted proofs</h3>
          </div>
          <div className="divide-y divide-border">
            {proofs.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors",
                  selectedId === p.id ? "bg-indigo-50/60" : "hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-[11px] font-bold text-white">
                    {p.studentName.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{p.studentName}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.amount} {p.currency} · {p.submittedAt}
                    </div>
                  </div>
                </div>
                <PaymentStatusBadge status={p.status} />
              </button>
            ))}
          </div>
        </Card>

        {/* Detail */}
        <Card className="p-6 lg:col-span-3">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <h3 className="font-display text-lg font-bold text-foreground">{selected.studentName}</h3>
              <p className="text-sm text-muted-foreground">
                {selected.planName} plan · submitted {selected.submittedAt}
              </p>
            </div>
            <PaymentStatusBadge status={selected.status} />
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3 text-sm">
            {[
              ["Amount", `${selected.amount} ${selected.currency}`],
              ["Reference", selected.reference],
              ["Transfer date", selected.transferDate],
              ["Plan", selected.planName],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-border p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
                <div className="mt-0.5 font-semibold text-foreground">{v}</div>
              </div>
            ))}
          </div>

          <div className="mb-5 flex items-center justify-between rounded-xl border border-border bg-muted/40 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
                <FileText size={18} className="text-indigo-600" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{selected.receiptName}</div>
                <div className="text-xs text-muted-foreground">Uploaded receipt</div>
              </div>
            </div>
            <Button variant="ghost" size="sm">
              <Eye size={14} /> View
            </Button>
          </div>

          <div className="mb-6 flex items-start gap-2 rounded-xl bg-indigo-50/60 p-3 text-xs text-indigo-700">
            <Building2 size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              Expected account: {bankAccount.accountName} · {bankAccount.bankName}. Confirm the transfer reference
              matches before approving.
            </span>
          </div>

          {selected.status === "pending" ? (
            <div className="flex gap-3">
              <Button variant="danger" className="flex-1" onClick={() => decide(selected.id, "rejected")}>
                <X size={16} /> Reject
              </Button>
              <Button className="flex-1" onClick={() => decide(selected.id, "approved")}>
                <Check size={16} /> Approve & activate
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border p-4 text-center text-sm text-muted-foreground">
              This proof has been <span className="font-semibold capitalize text-foreground">{selected.status}</span>.
              <button
                onClick={() => decide(selected.id, "pending")}
                className="ml-2 font-semibold text-indigo-600 hover:underline"
              >
                Reopen
              </button>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
