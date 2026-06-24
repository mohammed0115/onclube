import { useState } from "react";
import { Check } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { availability, availableDays } from "@/data/mockData";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// June 2026 starts on a Monday; pad the first row accordingly.
const MONTH_OFFSET = 1;
const DAYS_IN_MONTH = 30;

export function AvailabilityPage() {
  const firstAvailable = availability[0].day;
  const [selectedDay, setSelectedDay] = useState<number>(firstAvailable);

  const dayData = availability.find((d) => d.day === selectedDay);
  const [slots, setSlots] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((dayData?.slots ?? []).map((s) => [s.time, s.available]))
  );

  const selectDay = (day: number) => {
    setSelectedDay(day);
    const data = availability.find((d) => d.day === day);
    const base = data?.slots ?? availability[0].slots.map((s) => ({ ...s, available: false }));
    setSlots(Object.fromEntries(base.map((s) => [s.time, s.available])));
  };

  const toggle = (time: string) => setSlots((prev) => ({ ...prev, [time]: !prev[time] }));
  const openCount = Object.values(slots).filter(Boolean).length;
  const allTimes = availability[0].slots.map((s) => s.time);

  return (
    <DashboardLayout>
      <PageHeader
        title="Availability"
        subtitle="Open the times when students can book live sessions with you."
        action={<Button size="sm">Save changes</Button>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display font-bold text-foreground">June 2026</h3>
            <span className="text-xs text-muted-foreground">Green = has open slots</span>
          </div>
          <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: MONTH_OFFSET }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {Array.from({ length: DAYS_IN_MONTH }).map((_, i) => {
              const day = i + 1;
              const hasSlots = availableDays.has(day);
              const selected = day === selectedDay;
              return (
                <button
                  key={day}
                  onClick={() => selectDay(day)}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-xl text-sm font-medium transition-all",
                    selected
                      ? "bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-md"
                      : hasSlots
                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display font-bold text-foreground">Slots for Jun {selectedDay}</h3>
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              {openCount} open
            </span>
          </div>
          <div className="space-y-1.5">
            {allTimes.map((time) => {
              const on = !!slots[time];
              return (
                <div
                  key={time}
                  className={cn(
                    "flex items-center justify-between rounded-xl border px-4 py-2.5 transition-colors",
                    on ? "border-indigo-100 bg-indigo-50/50" : "border-border"
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {on && <Check size={14} className="text-indigo-600" />}
                    {time}
                  </div>
                  <Switch checked={on} onCheckedChange={() => toggle(time)} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
