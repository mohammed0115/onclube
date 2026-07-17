import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import {
  LayoutDashboard,
  Calendar,
  FileBarChart,
  Settings,
  GraduationCap,
  CalendarClock,
  PenSquare,
  User,
  Users,
  Wallet,
  Bell,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { useAuth } from "@/auth/AuthProvider";
import { useNotifications, useMarkNotificationRead } from "@/hooks";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";
import type { UserProfile } from "@/api/types";

interface NavItem {
  icon: LucideIcon;
  label: string;
  /** Compact label for the mobile bottom bar (falls back to `label`). */
  short?: string;
  to: string;
}

const NAV: Record<Role, NavItem[]> = {
  student: [
    { icon: LayoutDashboard, label: "Dashboard", short: "Home", to: "/student" },
    { icon: Calendar, label: "Book Session", short: "Book", to: "/student/book" },
    { icon: GraduationCap, label: "Practice", to: "/student/practice" },
    { icon: Users, label: "Community", short: "Club", to: "/student/community" },
    { icon: FileBarChart, label: "Session Reports", short: "Reports", to: "/student/reports" },
    { icon: Settings, label: "Settings", to: "/student/settings" },
  ],
  instructor: [
    { icon: LayoutDashboard, label: "Dashboard", short: "Home", to: "/instructor" },
    { icon: CalendarClock, label: "Availability", short: "Slots", to: "/instructor/availability" },
    { icon: Calendar, label: "My Sessions", short: "Sessions", to: "/instructor/sessions" },
    { icon: PenSquare, label: "Topics & Questions", short: "Topics", to: "/instructor/topics" },
    { icon: User, label: "My Profile", short: "Profile", to: "/instructor/profile" },
  ],
  admin: [
    { icon: LayoutDashboard, label: "Dashboard", short: "Home", to: "/admin" },
    { icon: Wallet, label: "Payment Approval", short: "Payments", to: "/admin/payments" },
    { icon: Users, label: "Members", to: "/admin" },
    // Admins can also teach (same account acts as instructor).
    { icon: GraduationCap, label: "Teaching", short: "Teach", to: "/instructor" },
    { icon: CalendarClock, label: "Availability", short: "Slots", to: "/instructor/availability" },
    { icon: PenSquare, label: "Topics & Questions", short: "Topics", to: "/instructor/topics" },
  ],
};

function initialsOf(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "EC";
}

function activeProfile(role: Role, user: UserProfile | null) {
  const name = user?.fullName ?? "OneClub";
  const initials = initialsOf(name);
  if (role === "instructor")
    return { name, initials, sub: user?.headline ?? "Instructor", accent: "from-amber-400 to-orange-500" };
  if (role === "admin")
    return { name, initials, sub: "Operations", accent: "from-slate-600 to-slate-800" };
  return { name, initials, sub: user?.level ? `Level ${user.level}` : "Student", accent: "from-indigo-500 to-purple-600" };
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, role: authRole, logout } = useAuth();
  const { pathname } = useLocation();
  const role: Role = (authRole as Role) ?? "student";
  const items = NAV[role];
  const profile = activeProfile(role, user);

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
                    ? "border border-blue-100 bg-blue-50 text-blue-700"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <item.icon size={17} />
                {item.label}
              </Link>
            );
          })}
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
          <button
            onClick={logout}
            className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={17} /> Log out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end border-b border-border bg-card px-4 py-3.5 md:px-6">
          {/* Brand shows in the header only on mobile (sidebar is hidden there). */}
          <div className="mr-auto md:hidden">
            <Logo to={`/${role === "student" ? "student" : role}`} />
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-bold text-white", profile.accent)}>
              {profile.initials}
            </div>
            <button
              onClick={logout}
              title="Log out"
              aria-label="Log out"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-surface-2 p-5 pb-24 md:p-6 md:pb-6">{children}</main>
      </div>

      {/* Mobile bottom navigation — the sidebar is hidden below md. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-sidebar-border bg-card/95 backdrop-blur md:hidden">
        {items.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.label}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                active ? "text-blue-700" : "text-muted-foreground"
              )}
            >
              <item.icon size={19} />
              <span className="max-w-full truncate px-0.5">{item.short ?? item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Header bell with a dropdown that lists notifications and marks them read. */
function NotificationBell() {
  const { data: notifications } = useNotifications();
  const markRead = useMarkNotificationRead();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const list = notifications ?? [];
  const unread = list.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60 transition-colors hover:bg-muted"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
      >
        <Bell size={16} className="text-muted-foreground" />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-indigo-500" />}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            {unread > 0 && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">{unread} new</span>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {list.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">You're all caught up 🎉</p>
            ) : (
              list.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.read && markRead.mutate(n.id)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 border-b border-border px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/50",
                    !n.read && "bg-indigo-50/40"
                  )}
                >
                  <div className="flex w-full items-start gap-2">
                    {!n.read && <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-500" />}
                    <span className="text-sm font-medium text-foreground">{n.title}</span>
                  </div>
                  {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
