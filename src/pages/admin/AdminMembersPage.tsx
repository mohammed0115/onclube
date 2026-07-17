import { useState } from "react";
import { Users, Ban, CheckCircle, Loader2 } from "lucide-react";
import { Link } from "react-router";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/states";
import { useAdminUsers, useSetUserStatus, useChangeUserRole } from "@/hooks";
import type { AdminUser } from "@/api/types";
import { cn } from "@/lib/utils";

const ROLES = ["", "student", "instructor", "admin"] as const;

export function AdminMembersPage() {
  const [role, setRole] = useState("");
  const { data, isLoading } = useAdminUsers(role || undefined);
  const users = data ?? [];

  return (
    <DashboardLayout>
      <PageHeader
        title="Members"
        subtitle="Manage students, teachers and admins."
        action={<Link to="/admin/audit" className="text-sm font-semibold text-indigo-600 hover:underline">Audit log →</Link>}
      />

      <div className="mb-4 flex gap-2">
        {ROLES.map((r) => (
          <button
            key={r || "all"}
            onClick={() => setRole(r)}
            className={cn("rounded-xl border px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
              role === r ? "border-primary bg-blue-50 text-blue-700" : "border-border text-muted-foreground hover:bg-muted")}
          >
            {r || "All"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Loading label="Loading members…" />
      ) : users.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground"><Users size={26} className="mx-auto mb-2 text-muted-foreground" />No members yet.</Card>
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

function MemberRow({ u }: { u: AdminUser }) {
  const setStatus = useSetUserStatus();
  const changeRole = useChangeUserRole();
  const suspended = u.status === "suspended";

  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white">
          {u.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">{u.fullName}</div>
          <div className="text-xs text-muted-foreground">{u.email}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {suspended && <Badge tone="red">Suspended</Badge>}
        <select
          value={u.role}
          onChange={(e) => changeRole.mutate({ id: u.id, role: e.target.value })}
          disabled={changeRole.isPending}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-medium capitalize text-foreground"
        >
          <option value="student">student</option>
          <option value="instructor">instructor</option>
          <option value="admin">admin</option>
        </select>
        <Button
          variant="ghost" size="sm"
          onClick={() => setStatus.mutate({ id: u.id, status: suspended ? "active" : "suspended" })}
          disabled={setStatus.isPending}
          className={suspended ? "text-emerald-600 hover:bg-emerald-50" : "text-red-600 hover:bg-red-50"}
        >
          {setStatus.isPending ? <Loader2 size={14} className="animate-spin" /> : suspended ? <CheckCircle size={14} /> : <Ban size={14} />}
          {suspended ? "Activate" : "Suspend"}
        </Button>
      </div>
    </div>
  );
}
