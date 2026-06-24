import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import {
  LayoutDashboard,
  Calendar,
  FileBarChart,
  Settings,
  CalendarClock,
  PenSquare,
  Users,
  Wallet,
  Bell,
  Search,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { useAppState } from "@/app/AppState";
import { currentStudent, instructors } from "@/data/mockData";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

interface NavItem {
  icon: LucideIcon;
  label: string;
  to: string;
}

const NAV: Record<Role, NavItem[]> = {
  student: [
    { icon: LayoutDashboard, label: "Dashboard", to: "/student" },
    { icon: Calendar, label: "Book Session", to: "/student/book" },
    { icon: FileBarChart, label: "Session Reports", to: "/student/report/r1" },
  ],
  instructor: [
    { icon: LayoutDashboard, label: "Dashboard", to: "/instructor" },
    { icon: CalendarClock, label: "Availability", to: "/instructor/availability" },
    { icon: PenSquare, label: "Topics & Questions", to: "/instructor/topics" },
  ],
  admin: [
    { icon: LayoutDashboard, label: "Dashboard", to: "/admin" },
    { icon: Wallet, label: "Payment Approval", to: "/admin/payments" },
    { icon: Users, label: "Members", to: "/admin" },
  ],
};

function activeProfile(role: Role) {
  if (role === "student") return { name: currentStudent.name, initials: currentStudent.initials, sub: `${currentStudent.level} · ${currentStudent.planName}`, accent: "from-indigo-500 to-purple-600" };
  if (role === "instructor") return { name: instructors[0].name, initials: instructors[0].initials, sub: instructors[0].headline, accent: instructors[0].accent };
  return { name: "Admin Console", initials: "AD", sub: "Operations", accent: "from-slate-600 to-slate-800" };
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { role } = useAppState();
  const { pathname } = useLocation();
  const items = NAV[role];
  const profile = activeProfile(role);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 flex-shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="border-b border-sidebar-border p-5">
          <Logo to={`/${role === "student" ? "student" : role}`} />
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {items.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.label}
                to={item.to}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                  active
                    ? "border border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <item.icon size={17} />
                {item.label}
              </Link>
            );
          })}
          <div className="px-3 pt-3 text-muted-foreground/70">
            <div className="flex items-center gap-3 rounded-xl px-0 py-2.5 text-sm font-medium">
              <Settings size={17} /> Settings
            </div>
          </div>
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <div className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white", profile.accent)}>
              {profile.initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{profile.name}</div>
              <div className="truncate text-xs text-muted-foreground">{profile.sub}</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3.5 md:px-6">
          <div className="flex w-full max-w-xs items-center gap-3 rounded-xl bg-muted/60 px-4 py-2">
            <Search size={15} className="flex-shrink-0 text-muted-foreground" />
            <input
              placeholder="Search topics, sessions…"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex items-center gap-3">
            <button className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60 transition-colors hover:bg-muted">
              <Bell size={16} className="text-muted-foreground" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-indigo-500" />
            </button>
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-bold text-white", profile.accent)}>
              {profile.initials}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-5 pb-24 md:p-6">{children}</main>
      </div>
    </div>
  );
}
