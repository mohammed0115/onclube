import { useEffect, useState } from "react";
import { Check, X, MessageSquare, FileText, ExternalLink } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PaymentStatusBadge } from "@/components/payment";
import {
  useAdminProofs,
  useAdminProofDetail,
  useApprovePayment,
  useRejectPayment,
  useRequestPaymentInfo,
} from "@/hooks";
import { Loading, ErrorState, EmptyState } from "@/components/states";
import type { PaymentStatus } from "@/types";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

function badgeStatus(status: string): PaymentStatus {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  return "pending";
}

function when(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function PaymentApprovalPage() {
  const { tx } = useI18n();
  const query = useAdminProofs();
  const approve = useApprovePayment();
  const reject = useRejectPayment();
  const requestInfo = useRequestPaymentInfo();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const detail = useAdminProofDetail(selectedId);
  const proofs = query.data ?? [];

  useEffect(() => {
    if (proofs.length === 0) setSelectedId(null);
    else if (!selectedId || !proofs.some((p) => p.id === selectedId)) setSelectedId(proofs[0].id);
  }, [proofs, selectedId]);

  // Clear the note + errors when switching proofs.
  useEffect(() => {
    setNote("");
    setActionError(null);
  }, [selectedId]);

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
  const busy = approve.isPending || reject.isPending || requestInfo.isPending;

  async function run(id: string, action: "approve" | "reject" | "request_info") {
    setActionError(null);
    try {
      if (action === "approve") await approve.mutateAsync(id);
      else if (action === "reject") await reject.mutateAsync({ proofId: id, note: note.trim() || undefined });
      else await requestInfo.mutateAsync({ proofId: id, note: note.trim() });
    } catch {
      setActionError(tx("Could not complete that action. Please try again."));
    }
  }

  const d = detail.data;

  return (
    <DashboardLayout>
      <PageHeader
        title="Payment approval"
        subtitle="Every transfer is verified manually here — proofs are never auto-approved."
        action={
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            {proofs.length} {tx("pending")}
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
              <h3 className="text-sm font-bold text-foreground">{tx("Submitted proofs")}</h3>
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
                    {selected.planName} {tx("plan")} · {tx("submitted")} {when(selected.submittedAt)}
                  </p>
                </div>
                <PaymentStatusBadge status={badgeStatus(selected.status)} />
              </div>

              {detail.isLoading && <Loading label="Loading proof details…" />}
              {detail.isError && <ErrorState error={detail.error} onRetry={() => detail.refetch()} />}

              {d && (
                <>
                  <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
                    {[
                      [tx("Amount"), `${d.amount} ${d.currency}`],
                      [tx("Transaction ref"), d.transactionNumber],
                      [tx("Transfer date"), when(d.transferDatetime)],
                      [tx("Sender"), d.senderName ?? "—"],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-xl border border-border p-3">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
                        <div className="mt-0.5 break-words font-semibold text-foreground">{v}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mb-5">
                    {d.receiptUrl ? (
                      <a
                        href={d.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50/60"
                      >
                        <FileText size={16} /> {tx("View receipt")} ({d.receiptName}) <ExternalLink size={13} />
                      </a>
                    ) : (
                      <p className="text-sm text-muted-foreground">{tx("No receipt attached.")}</p>
                    )}
                  </div>

                  <label htmlFor="review-note" className="mb-1.5 block text-xs font-semibold text-foreground">
                    {tx("Note to the student (required to request more information)")}
                  </label>
                  <Textarea
                    id="review-note"
                    rows={2}
                    placeholder={tx("e.g. The receipt is blurry — please re-upload a clearer photo.")}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </>
              )}

              {actionError && (
                <p role="alert" className="mt-3 text-sm font-medium text-red-600">
                  {actionError}
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  variant="ghost"
                  className="flex-1"
                  disabled={busy || !note.trim()}
                  onClick={() => run(selected.id, "request_info")}
                >
                  <MessageSquare size={16} /> {requestInfo.isPending ? tx("Sending…") : tx("Request info")}
                </Button>
                <Button variant="danger" className="flex-1" disabled={busy} onClick={() => run(selected.id, "reject")}>
                  <X size={16} /> {tx("Reject")}
                </Button>
                <Button className="flex-1" disabled={busy} onClick={() => run(selected.id, "approve")}>
                  <Check size={16} /> {approve.isPending ? tx("Approving…") : tx("Approve & activate")}
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
