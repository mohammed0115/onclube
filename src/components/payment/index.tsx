import { Copy, Building2, Clock, CheckCircle, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PaymentStatus } from "@/types";
import type { PaymentProvider } from "@/api/types";

export function BankDetailsCard({ account }: { account: PaymentProvider }) {
  // IBAN is optional — only show it when configured. All values come from the API.
  const rows: [string, string][] = [
    ["Provider", account.providerName],
    ["Transfer method", account.transferMethod],
    ["Bank", account.bankName],
    ["Account name", account.accountName],
    ["Account number", account.accountNumber],
    ...(account.iban ? ([["IBAN", account.iban]] as [string, string][]) : []),
    ["Currency", account.currency],
  ];
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100">
          <Building2 size={16} className="text-indigo-600" />
        </div>
        <h3 className="font-display font-bold text-foreground">Transfer to this account</h3>
      </div>
      <div className="divide-y divide-border">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">{k}</span>
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {v}
              <Copy size={13} className="cursor-pointer text-muted-foreground transition-colors hover:text-indigo-600" />
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

const STATUS_META: Record<PaymentStatus, { label: string; tone: string; icon: typeof Clock }> = {
  none: { label: "Not started", tone: "bg-muted text-muted-foreground", icon: Clock },
  pending: { label: "Under review", tone: "bg-amber-100 text-amber-700", icon: Clock },
  approved: { label: "Approved", tone: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  rejected: { label: "Rejected", tone: "bg-red-100 text-red-700", icon: XCircle },
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", meta.tone)}>
      <Icon size={13} /> {meta.label}
    </span>
  );
}
