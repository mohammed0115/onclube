import { useState } from "react";
import { Wallet, Star, Plus } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms";
import { Loading } from "@/components/states";
import { useAdminPlans, useCreatePlan, useUpdatePlan } from "@/hooks";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

const BLANK = { code: "", name: "", price: "", currency: "SDG", sessions_per_month: "", description: "" };

export function AdminPlansPage() {
  const { tx } = useI18n();
  const { data, isLoading } = useAdminPlans();
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const [form, setForm] = useState({ ...BLANK });
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plans = data ?? [];
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setError(null);
    if (!form.code.trim() || !form.name.trim() || !form.price || !form.sessions_per_month) {
      setError(tx("Code, name, price and sessions are required."));
      return;
    }
    try {
      await create.mutateAsync({
        code: form.code.trim(),
        name: form.name.trim(),
        price: form.price,
        currency: form.currency.trim() || "SDG",
        sessions_per_month: Number(form.sessions_per_month),
        description: form.description.trim() || undefined,
      });
      setForm({ ...BLANK });
      setShowForm(false);
    } catch {
      setError(tx("Could not create the plan. The code may already exist."));
    }
  }

  const toggle = (id: string, patch: { active?: boolean; recommended?: boolean }) =>
    update.mutate({ id, patch });

  const editPrice = (id: string, current: number) => {
    const v = window.prompt(tx("New price:"), String(current));
    if (v && !isNaN(Number(v))) update.mutate({ id, patch: { price: v } });
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Plans"
        subtitle="Create and manage subscription plans. Plans are disabled, never deleted."
        action={
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus size={15} /> {tx("New plan")}
          </Button>
        }
      />

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</div>
      )}

      {showForm && (
        <Card className="mb-6 p-6">
          <h3 className="mb-4 font-display font-bold text-foreground">{tx("New plan")}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tx("Code")} htmlFor="code" value={form.code} onChange={set("code")} placeholder="growth" />
            <Field label={tx("Name")} htmlFor="name" value={form.name} onChange={set("name")} placeholder="Growth" />
            <Field label={tx("Price")} htmlFor="price" value={form.price} onChange={set("price")} placeholder="28000" />
            <Field label={tx("Currency")} htmlFor="cur" value={form.currency} onChange={set("currency")} />
            <Field label={tx("Sessions per month")} htmlFor="spm" value={form.sessions_per_month} onChange={set("sessions_per_month")} placeholder="8" />
            <Field label={tx("Description")} htmlFor="desc" value={form.description} onChange={set("description")} />
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={submit} disabled={create.isPending}>{create.isPending ? tx("Saving…") : tx("Create plan")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>{tx("Cancel")}</Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <Loading label="Loading plans…" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id} className={cn("p-5", !p.active && "opacity-60")}>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{p.emoji ?? "📦"}</span>
                  <span className="font-display font-bold text-foreground">{p.name}</span>
                </div>
                <div className="flex gap-1">
                  {p.recommended && <Badge tone="indigo">{tx("Recommended")}</Badge>}
                  <Badge tone={p.active ? "emerald" : "muted"}>{p.active ? tx("Active") : tx("Disabled")}</Badge>
                </div>
              </div>
              <div className="mb-1 text-2xl font-extrabold text-foreground">
                {p.price} <span className="text-sm font-medium text-muted-foreground">{p.currency} {p.cadence}</span>
              </div>
              <div className="mb-3 text-xs text-muted-foreground">{p.sessionsPerMonth} {tx("sessions / month")} · {p.code}</div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => editPrice(p.id, p.price)}>{tx("Edit price")}</Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(p.id, { active: !p.active })}>
                  {p.active ? tx("Disable") : tx("Enable")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(p.id, { recommended: !p.recommended })}>
                  <Star size={13} className={p.recommended ? "fill-amber-400 text-amber-400" : ""} /> {p.recommended ? tx("Unfeature") : tx("Feature")}
                </Button>
              </div>
            </Card>
          ))}
          {plans.length === 0 && (
            <Card className="col-span-full flex flex-col items-center gap-2 py-12 text-center">
              <Wallet size={26} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{tx("No plans yet — create your first.")}</p>
            </Card>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
