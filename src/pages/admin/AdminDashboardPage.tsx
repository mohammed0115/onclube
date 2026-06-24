import { Link } from "react-router";
import { ArrowRight, Wallet, Clock } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/cards";
import { PaymentStatusBadge } from "@/components/payment";
import { paymentProofs, instructors } from "@/data/mockData";

export function AdminDashboardPage() {
  const pending = paymentProofs.filter((p) => p.status === "pending");

  const activity = [
    { who: "Mariam Adel", what: "payment approved", when: "Yesterday", tone: "emerald" },
    { who: "Yousef Bilal", what: "payment rejected — unclear receipt", when: "2 days ago", tone: "red" },
    { who: "Sarah Mitchell", what: "published a new topic", when: "2 days ago", tone: "indigo" },
  ];

  return (
    <DashboardLayout>
      <PageHeader
        title="Admin overview"
        subtitle="Approvals, members, and platform activity."
        action={
          <Button asChild size="sm">
            <Link to="/admin/payments">
              Review payments <ArrowRight size={15} />
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon="Clock" value={`${pending.length}`} label="Pending payments" hint="Needs review" tone="bg-amber-100 text-amber-600" />
        <StatCard icon="Users" value="186" label="Active members" tone="bg-indigo-100 text-indigo-600" />
        <StatCard icon="GraduationCap" value={`${instructors.length}`} label="Instructors" tone="bg-purple-100 text-purple-600" />
        <StatCard icon="Wallet" value="18,420" label="SAR this month" tone="bg-emerald-100 text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet size={18} className="text-indigo-600" />
              <h3 className="font-display font-bold text-foreground">Payments awaiting approval</h3>
            </div>
            <Link to="/admin/payments" className="text-xs font-semibold text-indigo-600 hover:underline">
              Open queue
            </Link>
          </div>
          <div className="space-y-3">
            {pending.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white">
                    {p.studentName.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{p.studentName}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.planName} · {p.amount} {p.currency} · {p.submittedAt}
                    </div>
                  </div>
                </div>
                <PaymentStatusBadge status={p.status} />
              </div>
            ))}
            {pending.length === 0 && <p className="text-sm text-muted-foreground">Queue is clear 🎉</p>}
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Clock size={18} className="text-indigo-600" />
            <h3 className="font-display font-bold text-foreground">Recent activity</h3>
          </div>
          <div className="space-y-4">
            {activity.map((a, i) => (
              <div key={i} className="flex items-start gap-3">
                <span
                  className={
                    "mt-1.5 h-2 w-2 flex-shrink-0 rounded-full " +
                    (a.tone === "emerald" ? "bg-emerald-500" : a.tone === "red" ? "bg-red-500" : "bg-indigo-500")
                  }
                />
                <div>
                  <div className="text-sm text-foreground">
                    <span className="font-semibold">{a.who}</span> — {a.what}
                  </div>
                  <div className="text-xs text-muted-foreground">{a.when}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
