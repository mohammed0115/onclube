import { useState } from "react";
import { Users, Ban, CheckCircle, Loader2, UserPlus, X } from "lucide-react";
import { Link } from "react-router";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/states";
import { useAdminUsers, useSetUserStatus, useChangeUserRole, useInviteUser, useTopUpSubscription, useExtendSubscription, useRefundNote, useResetSpoken } from "@/hooks";
import { useI18n } from "@/i18n";
import type { AdminUser } from "@/api/types";
import { cn } from "@/lib/utils";

const ROLES = ["", "student", "instructor", "admin"] as const;

export function AdminMembersPage() {
  const { tx } = useI18n();
  const [role, setRole] = useState("");
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useAdminUsers(role || undefined);
  const users = data ?? [];

  return (
    <DashboardLayout>
      <PageHeader
        title="Members"
        subtitle="Manage students, teachers and admins."
        action={
          <div className="flex items-center gap-3">
            <Link to="/admin/audit" className="text-sm font-semibold text-indigo-600 hover:underline">{tx("Audit log →")}</Link>
            <Button size="sm" onClick={() => setAdding((v) => !v)}>
              <UserPlus size={15} /> {tx("Add member")}
            </Button>
          </div>
        }
      />

      {adding && <InviteForm onClose={() => setAdding(false)} />}

      <div className="mb-4 flex gap-2">
        {ROLES.map((r) => (
          <button
            key={r || "all"}
            onClick={() => setRole(r)}
            className={cn("rounded-xl border px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
              role === r ? "border-primary bg-blue-50 text-blue-700" : "border-border text-muted-foreground hover:bg-muted")}
          >
            {r ? tx(r) : tx("All")}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Loading label="Loading members…" />
      ) : users.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground"><Users size={26} className="mx-auto mb-2 text-muted-foreground" />{tx("No members yet.")}</Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y divide-border">
            {users.map((u) => <MemberRow key={u.id} u={u} />)}
          </div>
        </Card>
      )}
    </DashboardLayout>
  );
}

function InviteForm({ onClose }: { onClose: () => void }) {
  const { tx } = useI18n();
  const invite = useInviteUser();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"instructor" | "admin" | "student">("instructor");
  const [link, setLink] = useState<string | null>(null);

  const canSubmit = fullName.trim().length > 1 && /\S+@\S+\.\S+/.test(email) && !invite.isPending;

  const submit = () => {
    if (!canSubmit) return;
    setLink(null);
    invite.mutate(
      { fullName: fullName.trim(), email: email.trim(), role },
      {
        onSuccess: (res: { inviteLink?: string }) => {
          setLink(res.inviteLink ?? null);
          setFullName(""); setEmail("");
        },
      },
    );
  };

  return (
    <Card className="mb-4 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <UserPlus size={16} className="text-indigo-600" /> {tx("Invite a new member")}
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" aria-label={tx("Close")}>
          <X size={16} />
        </button>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        {tx("We create the account and email a link to set a password. The account stays inactive until they set it.")}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={tx("Full name")}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={tx("Email address")}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "instructor" | "admin" | "student")}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm capitalize text-foreground"
        >
          <option value="instructor">{tx("instructor")}</option>
          <option value="student">{tx("student")}</option>
          <option value="admin">{tx("admin")}</option>
        </select>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" onClick={submit} disabled={!canSubmit}>
          {invite.isPending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} {tx("Send invite")}
        </Button>
        {invite.isError && <span className="text-xs text-red-600">{tx("Could not invite. The email may already be registered.")}</span>}
      </div>
      {link && (
        <div className="mt-3 rounded-xl bg-emerald-50 p-3">
          <div className="text-xs font-semibold text-emerald-700">{tx("Invite sent ✓ Share this set-password link if the email doesn't arrive:")}</div>
          <div className="mt-1 flex items-center gap-2">
            <input readOnly value={link} className="flex-1 rounded-lg border border-emerald-200 bg-white px-2 py-1 text-xs text-slate-700" onFocus={(e) => e.target.select()} />
            <Button size="sm" variant="soft" onClick={() => navigator.clipboard?.writeText(link)}>{tx("Copy")}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function MemberRow({ u }: { u: AdminUser }) {
  const { tx } = useI18n();
  const setStatus = useSetUserStatus();
  const changeRole = useChangeUserRole();
  const topUp = useTopUpSubscription();
  const extend = useExtendSubscription();
  const refund = useRefundNote();
  const resetSpoken = useResetSpoken();
  const suspended = u.status === "suspended";
  const isStudent = u.role === "student";

  const onResetSpoken = () => {
    if (!u.studentId) return;
    const reason = window.prompt(tx("Reason for resetting the spoken test:"), "");
    if (!reason) return;
    resetSpoken.mutate({ studentId: u.studentId, reason });
  };

  const onTopUp = () => {
    if (!u.subscriptionId) return;
    const n = window.prompt(tx("How many sessions to add?"), "4");
    if (n === null) return;
    const sessions = Math.floor(Number(n));
    if (!Number.isFinite(sessions) || sessions < 1) return;
    topUp.mutate({ subscriptionId: u.subscriptionId, sessions });
  };
  const onExtend = () => {
    if (!u.subscriptionId) return;
    const d = window.prompt(tx("New expiry date (YYYY-MM-DD):"), "");
    if (!d) return;
    const iso = new Date(`${d}T23:59:00`).toISOString();
    if (isNaN(Date.parse(iso))) return;
    extend.mutate({ subscriptionId: u.subscriptionId, newExpiresAt: iso });
  };
  const onRefundNote = () => {
    if (!u.subscriptionId) return;
    const a = window.prompt(tx("Refund amount:"), "");
    if (a === null) return;
    const amount = Number(a);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const currency = window.prompt(tx("Currency:"), "SDG");
    if (!currency) return;
    const reason = window.prompt(tx("Reason for the refund note:"), "");
    if (!reason) return;
    refund.mutate({ subscriptionId: u.subscriptionId, amount, currency, reason });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white">
          {u.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">{u.fullName}</div>
          <div className="text-xs text-muted-foreground">{u.email}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isStudent && u.subscriptionId && (
          <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              {u.sessionsRemaining ?? 0} {tx("sessions")}
            </span>
            <button
              onClick={onTopUp}
              disabled={topUp.isPending}
              className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              {topUp.isPending ? "…" : tx("Top up")}
            </button>
            <button
              onClick={onExtend}
              disabled={extend.isPending}
              className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50"
            >
              {extend.isPending ? "…" : tx("Extend")}
            </button>
            <button
              onClick={onRefundNote}
              disabled={refund.isPending}
              className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50"
            >
              {refund.isPending ? "…" : tx("Refund note")}
            </button>
          </div>
        )}
        {isStudent && u.studentId && (
          <button
            onClick={onResetSpoken}
            disabled={resetSpoken.isPending}
            className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
          >
            {resetSpoken.isPending ? "…" : tx("Reset test")}
          </button>
        )}
        {suspended && <Badge tone="red">{tx("Suspended")}</Badge>}
        <select
          value={u.role}
          onChange={(e) => changeRole.mutate({ id: u.id, role: e.target.value })}
          disabled={changeRole.isPending}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-medium capitalize text-foreground"
        >
          <option value="student">{tx("student")}</option>
          <option value="instructor">{tx("instructor")}</option>
          <option value="admin">{tx("admin")}</option>
        </select>
        <Button
          variant="ghost" size="sm"
          onClick={() => setStatus.mutate({ id: u.id, status: suspended ? "active" : "suspended" })}
          disabled={setStatus.isPending}
          className={suspended ? "text-emerald-600 hover:bg-emerald-50" : "text-red-600 hover:bg-red-50"}
        >
          {setStatus.isPending ? <Loader2 size={14} className="animate-spin" /> : suspended ? <CheckCircle size={14} /> : <Ban size={14} />}
          {suspended ? tx("Activate") : tx("Suspend")}
        </Button>
      </div>
    </div>
  );
}
