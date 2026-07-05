import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loading, ErrorState } from "@/components/states";
import { useWeeklyCalendar } from "@/hooks";
import { cn } from "@/lib/utils";
import type { CalendarSlot } from "@/api/types";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const STATUS_LABEL: Record<string, string> = {
  booked: "Booked",
  blocked: "Unavailable",
  completed: "Completed",
};

export function BookingCalendarPage() {
  const { topicId = "" } = useParams();
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState<string | undefined>(undefined);
  const calendar = useWeeklyCalendar(topicId, weekStart);

  const shiftWeek = (deltaDays: number) => {
    const base = calendar.data?.weekStart ? new Date(`${calendar.data.weekStart}T00:00:00Z`) : new Date();
    base.setUTCDate(base.getUTCDate() + deltaDays);
    setWeekStart(base.toISOString().slice(0, 10));
  };

  const chooseSlot = (slot: CalendarSlot) => {
    navigate(`/student/book/${topicId}/confirm/${slot.id}?at=${encodeURIComponent(slot.startAt)}`);
  };

  return (
    <DashboardLayout>
      {calendar.isLoading ? (
        <Loading label="Loading the calendar…" />
      ) : calendar.isError ? (
        <ErrorState error={calendar.error} onRetry={() => calendar.refetch()} />
      ) : (
        <div className="mx-auto max-w-4xl">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
                <CalendarDays size={22} className="text-indigo-600" /> Choose a time
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                With {calendar.data!.instructorName} · week of {fmtDate(calendar.data!.weekStart)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" aria-label="Previous week" onClick={() => shiftWeek(-7)}>
                <ChevronLeft size={16} />
              </Button>
              <Button variant="ghost" size="sm" aria-label="Next week" onClick={() => shiftWeek(7)}>
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>

          {calendar.data!.days.every((d) => d.slots.length === 0) && (
            <Card className="mb-4 rounded-2xl p-6 text-center text-sm text-muted-foreground">
              No slots this week. Try the next week.
            </Card>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
            {calendar.data!.days.map((day) => (
              <Card key={day.date} className="rounded-2xl p-3">
                <div className="mb-2 border-b border-border pb-2 text-center">
                  <div className="text-xs font-bold uppercase tracking-wide text-foreground">{day.weekday.slice(0, 3)}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(day.date)}</div>
                </div>
                <div className="space-y-2">
                  {day.slots.length === 0 && <div className="py-2 text-center text-xs text-muted-foreground">—</div>}
                  {day.slots.map((slot) =>
                    slot.status === "available" ? (
                      <button
                        key={slot.id}
                        onClick={() => chooseSlot(slot)}
                        aria-label={`Book ${day.weekday} ${fmtTime(slot.startAt)}`}
                        className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-2 py-2 text-xs font-semibold text-indigo-700 transition-colors hover:border-indigo-400 hover:bg-indigo-100"
                      >
                        {fmtTime(slot.startAt)}
                      </button>
                    ) : (
                      <div
                        key={slot.id}
                        aria-disabled
                        className={cn(
                          "w-full rounded-xl border px-2 py-2 text-center text-xs font-medium",
                          "cursor-not-allowed border-border bg-muted/50 text-muted-foreground line-through"
                        )}
                        title={STATUS_LABEL[slot.status] ?? slot.status}
                      >
                        {fmtTime(slot.startAt)}
                      </div>
                    )
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
