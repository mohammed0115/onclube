import { Users, Clock, CalendarDays, Check } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loading, EmptyState } from "@/components/states";
import { useCommunitySessions, useJoinGroupSession } from "@/hooks";
import type { GroupSession } from "@/api/types";
import { cn } from "@/lib/utils";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Community hub: browse and join upcoming group conversation sessions. */
export function CommunityPage() {
  const { data, isLoading } = useCommunitySessions();
  const sessions = data ?? [];

  return (
    <DashboardLayout>
      <PageHeader title="Community" subtitle="Join a live group class and practise with other learners." />

      <div className="mx-auto max-w-4xl">
        {isLoading ? (
          <Loading label="Loading group sessions…" />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={<Users size={26} className="text-muted-foreground" />}
            title="No group sessions scheduled yet"
            description="Check back soon — new community classes are added every week."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {sessions.map((gs) => (
              <SessionCard key={gs.id} gs={gs} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function SessionCard({ gs }: { gs: GroupSession }) {
  const join = useJoinGroupSession();
  const full = gs.seatsLeft <= 0 && !gs.joined;
  const pct = Math.min(100, Math.round((gs.seatsTaken / gs.capacity) * 100));

  return (
    <Card className={cn("flex flex-col p-5", gs.joined && "ring-1 ring-emerald-300")}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="font-display text-base font-bold leading-snug text-foreground">{gs.title}</h3>
        <Badge tone="purple" className="flex-shrink-0">{gs.level}</Badge>
      </div>
      <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">{gs.description}</p>

      <div className="mb-3 space-y-1.5 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <CalendarDays size={14} /> {formatWhen(gs.startAt)}
        </div>
        <div className="flex items-center gap-2">
          <Clock size={14} /> {gs.durationMinutes} min · with {gs.instructorName}
        </div>
      </div>

      {/* Seats */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Users size={13} /> {gs.seatsTaken}/{gs.capacity} joined
          </span>
          {gs.seatsLeft > 0 ? (
            <span className="font-medium text-emerald-600">{gs.seatsLeft} seats left</span>
          ) : (
            <span className="font-medium text-red-500">Full</span>
          )}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        {gs.attendees.length > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {gs.attendees.slice(0, 3).join(", ")}
            {gs.attendees.length > 3 ? ` +${gs.attendees.length - 3} more` : ""}
          </p>
        )}
      </div>

      <div className="mt-auto">
        {gs.joined ? (
          <Button
            variant="soft"
            className="w-full"
            disabled={join.isPending}
            onClick={() => join.mutate({ id: gs.id, join: false })}
          >
            <Check size={15} /> Joined — tap to leave
          </Button>
        ) : (
          <Button
            className="w-full"
            disabled={full || join.isPending}
            onClick={() => join.mutate({ id: gs.id, join: true })}
          >
            {full ? "Session full" : "Join session"}
          </Button>
        )}
      </div>
    </Card>
  );
}
