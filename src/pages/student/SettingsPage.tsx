import { useState } from "react";
import { User, Target, CreditCard, Check, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/forms";
import { Loading } from "@/components/states";
import { useAuth } from "@/auth/AuthProvider";
import { useGoals, useSetGoal, useUpdateProfile, useSubscription, useBillingHistory } from "@/hooks";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const goalsQuery = useGoals();
  const setGoal = useSetGoal();
  const updateProfile = useUpdateProfile();
  const sub = useSubscription();
  const history = useBillingHistory();

  const [name, setName] = useState(user?.fullName ?? "");
  const [savedName, setSavedName] = useState(false);

  if (!user) return <DashboardLayout><Loading label="Loading your settings…" /></DashboardLayout>;

  const saveName = async () => {
    if (!name.trim() || name.trim() === user.fullName) return;
    await updateProfile.mutateAsync(name.trim());
    await refreshUser();
    setSavedName(true);
    setTimeout(() => setSavedName(false), 2000);
  };

  const chooseGoal = async (goalId: string) => {
    if (goalId === user.goalId) return;
    await setGoal.mutateAsync(goalId);
    await refreshUser();
  };

  return (
    <DashboardLayout>
      <PageHeader title="Settings" subtitle="Manage your profile, goal, and subscription." />

      <div className="mx-auto max-w-2xl space-y-6">
        {/* Profile */}
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <User size={16} className="text-indigo-600" /> Profile
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="name" value={name} onChange={(e) => setName(e.target.value)} />
            <Field label="Email" htmlFor="email" value={user.email} readOnly />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button size="sm" onClick={saveName} disabled={updateProfile.isPending || !name.trim() || name.trim() === user.fullName}>
              {updateProfile.isPending ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : "Save name"}
            </Button>
            {savedName && <span className="flex items-center gap-1 text-sm text-emerald-600"><Check size={15} /> Saved</span>}
            {user.level && <span className="ml-auto"><Badge tone="indigo">Level {user.level}</Badge></span>}
          </div>
        </Card>

        {/* Learning goal */}
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Target size={16} className="text-indigo-600" /> Learning goal
          </div>
          {goalsQuery.isLoading ? (
            <Loading label="Loading goals…" />
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(goalsQuery.data ?? []).map((g) => {
                const active = g.id === user.goalId;
                return (
                  <button
                    key={g.id}
                    onClick={() => chooseGoal(g.id)}
                    disabled={setGoal.isPending}
                    className={
                      "flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors " +
                      (active ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-border hover:border-indigo-300")
                    }
                  >
                    <span className="font-medium">{g.label}</span>
                    {active && <Check size={16} className="text-indigo-600" />}
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Subscription */}
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <CreditCard size={16} className="text-indigo-600" /> Subscription
          </div>
          {sub.isLoading ? (
            <Loading label="Loading subscription…" />
          ) : sub.data ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Status" value={<Badge tone={sub.data.status === "active" ? "emerald" : "amber"}>{sub.data.status}</Badge>} />
              <Stat label="Sessions remaining" value={<span className="font-semibold text-foreground">{sub.data.sessionsRemaining}</span>} />
              <Stat label="Renews / expires" value={<span className="font-semibold text-foreground">{fmtDate(sub.data.expiresAt)}</span>} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active subscription. <a href="/billing/pricing" className="font-semibold text-indigo-600 underline">Choose a plan</a>.</p>
          )}

          {/* Billing history (previously unused API, now surfaced) */}
          {history.data && history.data.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment history</p>
              <div className="space-y-1.5">
                {history.data.map((h) => (
                  <div key={h.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="text-foreground">{h.planName}</span>
                    <span className="text-muted-foreground">{h.amount} {h.currency} · {h.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1">{value}</div>
    </div>
  );
}
