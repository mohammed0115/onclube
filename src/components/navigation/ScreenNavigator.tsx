import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Compass, X, CheckCircle, Clock } from "lucide-react";
import { useAppState } from "@/app/AppState";
import { cn } from "@/lib/utils";
import type { PaymentStatus, Role } from "@/types";

const GROUPS: { label: string; items: { label: string; to: string }[] }[] = [
  {
    label: "Public",
    items: [
      { label: "01 · Landing", to: "/" },
      { label: "02 · Register", to: "/register" },
      { label: "03 · Login", to: "/login" },
    ],
  },
  {
    label: "Onboarding",
    items: [
      { label: "04 · Goal Selection", to: "/onboarding/goal" },
      { label: "05 · AI Placement Test", to: "/onboarding/placement-test" },
      { label: "06 · Placement Result", to: "/onboarding/placement-result" },
    ],
  },
  {
    label: "Billing",
    items: [
      { label: "07 · Pricing Plans", to: "/billing/pricing" },
      { label: "08 · Bank Transfer", to: "/billing/bank-transfer" },
      { label: "09 · Payment Proof", to: "/billing/payment-proof" },
      { label: "10 · Under Review", to: "/billing/under-review" },
    ],
  },
  {
    label: "Student",
    items: [
      { label: "11 · Dashboard", to: "/student" },
      { label: "12 · Book Session", to: "/student/book" },
      { label: "13 · Questions Preview", to: "/student/questions/t1" },
      { label: "14 · Live Session Room", to: "/student/session/b1" },
      { label: "15 · AI Session Report", to: "/student/report/r1" },
    ],
  },
  {
    label: "Instructor",
    items: [
      { label: "16 · Dashboard", to: "/instructor" },
      { label: "17 · Availability", to: "/instructor/availability" },
      { label: "18 · Topic & Question Builder", to: "/instructor/topics" },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "19 · Dashboard", to: "/admin" },
      { label: "20 · Payment Approval", to: "/admin/payments" },
    ],
  },
];

export function ScreenNavigator() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { role, setRole, paymentStatus, setPaymentStatus } = useAppState();

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-[100] flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-300/40 transition-transform hover:scale-105"
        aria-label="Open screen navigator"
      >
        {open ? <X size={20} /> : <Compass size={20} />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-[100] flex max-h-[78vh] w-72 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="border-b border-border bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3">
            <div className="text-sm font-bold text-white">Prototype Navigator</div>
            <div className="text-[11px] text-indigo-200">Jump to any of the 20 MVP screens</div>
          </div>

          {/* Demo state toggles for the business rules */}
          <div className="space-y-2.5 border-b border-border px-4 py-3">
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">View as</div>
              <div className="flex gap-1.5">
                {(["student", "instructor", "admin"] as Role[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className={cn(
                      "flex-1 rounded-lg px-2 py-1 text-[11px] font-semibold capitalize transition-colors",
                      role === r ? "bg-indigo-600 text-white" : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Payment status (gates booking)
              </div>
              <div className="flex gap-1.5">
                {(
                  [
                    { v: "pending", icon: Clock, label: "Pending" },
                    { v: "approved", icon: CheckCircle, label: "Approved" },
                  ] as { v: PaymentStatus; icon: typeof Clock; label: string }[]
                ).map(({ v, icon: Icon, label }) => (
                  <button
                    key={v}
                    onClick={() => setPaymentStatus(v)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors",
                      paymentStatus === v
                        ? "bg-emerald-600 text-white"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon size={11} /> {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {GROUPS.map((group) => (
              <div key={group.label} className="mb-2">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {group.label}
                </div>
                {group.items.map((item) => {
                  const active = pathname === item.to;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "block rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors",
                        active ? "bg-indigo-50 text-indigo-700" : "text-foreground hover:bg-muted"
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
