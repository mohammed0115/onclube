import { useEffect, useState } from "react";
import { Check, X, Info } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PaymentStatusBadge } from "@/components/payment";
import { useAdminProofs, useApprovePayment, useRejectPayment } from "@/hooks";
import { Loading, ErrorState, EmptyState } from "@/components/states";
import type { PaymentStatus } from "@/types";
import { cn } from "@/lib/utils";

function badgeStatus(status: string): PaymentStatus {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  return "pending";
}

function when(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function PaymentApprovalPage() {
  const query = useAdminProofs();
  const approve = useApprovePayment();
  const reject = useRejectPayment();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const proofs = query.data ?? [];

  // Keep a valid selection as the queue changes (approved/rejected items leave it).
  useEffect(() => {
    if (proofs.length === 0) {
      setSelectedId(null);
    } else if (!selectedId || !proofs.some((p) => p.id === selectedId)) {
      setSelectedId(proofs[0].id);
    }
  }, [proofs, selectedId]);

  if (query.isLoading) {
    return (
      <DashboardLayout>
        <Loading label="Loading the approval queue…" />
      </DashboardLayout>
    );
  }
  if (query.isError) {
    return (
      <DashboardLayout>
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </DashboardLayout>
    );
  }

  const selected = proofs.find((p) => p.id === selectedId) ?? null;
  const busy = approve.isPending || reject.isPending;

  async function decide(id: string, action: "approve" | "reject") {
    setActionError(null);
    try {
      if (action === "approve") await approve.mutateAsync(id);
      else await reject.mutateAsync({ proofId: id });
    } catch {
      setActionError("Could not complete that action. Please try again.");
    }
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Payment approval"
        subtitle="Every transfer is verified manually here — proofs are never auto-approved."
        action={
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            {proofs.length} pending
          </span>
        }
      />

      {proofs.length === 0 ? (
        <EmptyState title="Queue is clear 🎉" description="There are no payment proofs awaiting review." />
      ) : (
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
                        {p.amount} {p.currency} · {when(p.submittedAt)}
                      </div>
                    </div>
                  </div>
                  <PaymentStatusBadge status={badgeStatus(p.status)} />
                </button>
              ))}
            </div>
          </Card>

          {/* Detail */}
          {selected && (
            <Card className="p-6 lg:col-span-3">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">{selected.studentName}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selected.planName} plan · submitted {when(selected.submittedAt)}
                  </p>
                </div>
                <PaymentStatusBadge status={badgeStatus(selected.status)} />
              </div>

              <div className="mb-5 grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Amount", `${selected.amount} ${selected.currency}`],
                  ["Plan", selected.planName],
                  ["Status", "Pending review"],
                  ["Submitted", when(selected.submittedAt)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
                    <div className="mt-0.5 font-semibold text-foreground">{v}</div>
                  </div>
                ))}
              </div>

              <div className="mb-6 flex items-start gap-2 rounded-xl bg-indigo-50/60 p-3 text-xs text-indigo-700">
                <Info size={14} className="mt-0.5 flex-shrink-0" />
                <span>
                  Receipt image, transaction reference and transfer date require the admin proof-detail endpoint,
                  which isn’t available yet. Confirm the transfer in your bank records before approving.
                </span>
              </div>

              {actionError && (
                <p role="alert" className="mb-3 text-sm font-medium text-red-600">
                  {actionError}
                </p>
              )}

              <div className="flex gap-3">
                <Button variant="danger" className="flex-1" disabled={busy} onClick={() => decide(selected.id, "reject")}>
                  <X size={16} /> Reject
                </Button>
                <Button className="flex-1" disabled={busy} onClick={() => decide(selected.id, "approve")}>
                  <Check size={16} /> {approve.isPending ? "Approving…" : "Approve & activate"}
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
