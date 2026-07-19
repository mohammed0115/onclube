import { Link } from "react-router";
import * as Icons from "lucide-react";
import { ChevronRight, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { Booking, Instructor, SkillScore, Topic } from "@/types";

type IconName = keyof typeof Icons;
function Icon({ name, size = 22, className }: { name: string; size?: number; className?: string }) {
  const Cmp = (Icons[name as IconName] ?? Icons.Circle) as Icons.LucideIcon;
  return <Cmp size={size} className={className} />;
}

export function StatCard({
  icon,
  value,
  label,
  hint,
  tone = "text-indigo-600 bg-indigo-100",
}: {
  icon: string;
  value: string;
  label: string;
  hint?: string;
  tone?: string;
}) {
  const { tx } = useI18n();
  return (
    <Card className="p-5">
      <div className={cn("mb-3 flex h-10 w-10 items-center justify-center rounded-xl", tone)}>
        <Icon name={icon} size={18} />
      </div>
      <div className="mb-0.5 text-2xl font-extrabold text-foreground">{tx(value)}</div>
      <div className="text-xs text-muted-foreground">{tx(label)}</div>
      {hint && <div className="mt-1 text-xs font-medium text-indigo-600">{tx(hint)}</div>}
    </Card>
  );
}

export function CircleScore({ value, label, color }: SkillScore) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: 88, height: 88 }}>
        <svg width="88" height="88" className="-rotate-90" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r={r} fill="none" stroke="#DBEAFE" strokeWidth="7" />
          <circle
            cx="44"
            cy="44"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-base font-bold text-foreground">{value}%</span>
        </div>
      </div>
      <span className="text-center text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

export function SkillScoreBar({ label, value, color }: SkillScore) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-bold text-foreground">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export function TopicCard({ topic, to }: { topic: Topic; to: string }) {
  return (
    <Link
      to={to}
      className="group block rounded-2xl border border-border bg-card p-6 text-left shadow-sm transition-all hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-100/50"
    >
      <div
        className={cn(
          "mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg transition-transform group-hover:scale-105",
          topic.accent
        )}
      >
        <Icon name={topic.icon} size={24} className="text-white" />
      </div>
      <div className="mb-1 flex items-center gap-2">
        <h3 className="font-display font-bold text-foreground">{topic.title}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{topic.level}</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{topic.description}</p>
      <div className="flex items-center gap-1 text-xs font-semibold text-indigo-600 transition-all group-hover:gap-2">
        Preview questions <ChevronRight size={13} />
      </div>
    </Link>
  );
}

export function InstructorChip({ instructor }: { instructor: Instructor }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn("flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white", instructor.accent)}>
        {instructor.initials}
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-foreground">{instructor.name}</div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Star size={11} className="fill-amber-400 text-amber-400" /> {instructor.rating} · {instructor.sessionsHosted} sessions
        </div>
      </div>
    </div>
  );
}

export function BookingRow({ booking, reportTo }: { booking: Booking; reportTo?: string }) {
  const toneByStatus = {
    upcoming: "bg-indigo-100 text-indigo-700",
    completed: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-red-100 text-red-700",
  } as const;
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-foreground">{booking.topicTitle}</div>
        <div className="text-xs text-muted-foreground">
          {booking.date} · {booking.time} · {booking.instructorName}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize", toneByStatus[booking.status])}>
          {booking.status}
        </span>
        {booking.status === "completed" && reportTo && (
          <Link to={reportTo} className="text-xs font-semibold text-indigo-600 hover:underline">
            View report
          </Link>
        )}
      </div>
    </div>
  );
}
