import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Lock, Plane, Plus, Trash2, Ban, CalendarOff } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loading } from "@/components/states";
import {
  useInstructorAvailability,
  useSetAvailability,
  useAvailabilityExceptions,
  useAddAvailabilityException,
  useRemoveAvailabilityException,
} from "@/hooks";
import type { AvailabilityException, AvailabilityExceptionKind } from "@/api/types";
import { cn } from "@/lib/utils";

const KIND_META: Record<AvailabilityExceptionKind, { label: string; icon: typeof Plane; tone: string }> = {
  vacation: { label: "Vacation", icon: Plane, tone: "bg-indigo-100 text-indigo-700" },
  holiday: { label: "Holiday", icon: CalendarOff, tone: "bg-amber-100 text-amber-700" },
  block: { label: "Block time", icon: Ban, tone: "bg-rose-100 text-rose-700" },
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 08:00 – 21:00

const p = (n: number) => String(n).padStart(2, "0");
const slotKey = (y: number, mo1: number, d: number, h: number) => `${y}-${p(mo1)}-${p(d)}T${p(h)}`;
const dayKey = (y: number, mo1: number, d: number) => `${y}-${p(mo1)}-${p(d)}`;
/** Local wall-clock key ("YYYY-MM-DDTHH") for an ISO instant, so existing and new
 * slots compare in the instructor's own timezone. */
const keyFromIso = (iso: string) => {
  const dt = new Date(iso);
  return slotKey(dt.getFullYear(), dt.getMonth() + 1, dt.getDate(), dt.getHours());
};
/** Back to a UTC ISO string the API stores. */
const isoFromKey = (k: string) => {
  const [date, hh] = k.split("T");
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(y, mo - 1, d, Number(hh), 0, 0).toISOString();
};

export function AvailabilityPage() {
  const { data: slots, isLoading } = useInstructorAvailability();
  const save = useSetAvailability();

  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(() => dayKey(today.getFullYear(), today.getMonth() + 1, today.getDate()));
  const [open, setOpen] = useState<Set<string> | null>(null);
  const [savedAt, setSavedAt] = useState(false);

  // Booked slots are locked (the instructor can't free a booked time here).
  const booked = useMemo(() => {
    const s = new Set<string>();
    (slots ?? []).forEach((sl) => sl.status !== "open" && s.add(keyFromIso(sl.startAt)));
    return s;
  }, [slots]);

  // Seed the editable open-set once, from the server's open slots.
  useEffect(() => {
    if (slots && open === null) {
      setOpen(new Set(slots.filter((sl) => sl.status === "open").map((sl) => keyFromIso(sl.startAt))));
    }
  }, [slots, open]);

  const openSet = open ?? new Set<string>();
  const daysWithOpen = useMemo(() => {
    const s = new Set<string>();
    openSet.forEach((k) => s.add(k.slice(0, 10)));
    return s;
  }, [openSet]);

  const year = cursor.getFullYear();
  const month0 = cursor.getMonth(); // 0-based
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const firstWeekday = new Date(year, month0, 1).getDay();
  const monthLabel = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  const nowMs = today.getTime();

  const toggle = (k: string) => {
    setSavedAt(false);
    setOpen((prev) => {
      const next = new Set(prev ?? []);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const changeMonth = (delta: number) => {
    const c = new Date(year, month0 + delta, 1);
    setCursor(c);
    setSelected(dayKey(c.getFullYear(), c.getMonth() + 1, 1));
  };

  const onSave = () => {
    setSavedAt(false);
    save.mutate(
      [...openSet].map((k) => ({ startAt: isoFromKey(k), durationMinutes: 45 })),
      { onSuccess: () => setSavedAt(true) }
    );
  };

  const [sy, sm, sd] = selected.split("-").map(Number);
  const selectedLabel = new Date(sy, sm - 1, sd).toLocaleString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const openCountForDay = HOURS.filter((h) => openSet.has(slotKey(sy, sm, sd, h))).length;

  return (
    <DashboardLayout>
      <PageHeader
        title="Availability"
        subtitle="Open the times when students can book live sessions with you."
        action={
          <Button size="sm" onClick={onSave} disabled={save.isPending || open === null}>
            {save.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save changes
          </Button>
        }
      />

      {savedAt && !save.isPending && (
        <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">Availability published ✓</p>
      )}
      {save.isError && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-600">Could not save. Please try again.</p>
      )}

      {isLoading || open === null ? (
        <Loading label="Loading your calendar…" />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Month calendar */}
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button onClick={() => changeMonth(-1)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Previous month">
                  <ChevronLeft size={16} />
                </button>
                <h3 className="min-w-[9rem] text-center font-display font-bold text-foreground">{monthLabel}</h3>
                <button onClick={() => changeMonth(1)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Next month">
                  <ChevronRight size={16} />
                </button>
              </div>
              <span className="text-xs text-muted-foreground">Green = open slots</span>
            </div>
            <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase text-muted-foreground">
              {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: firstWeekday }).map((_, i) => <div key={`pad-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dk = dayKey(year, month0 + 1, day);
                const isSelected = dk === selected;
                const hasOpen = daysWithOpen.has(dk);
                const isPast = new Date(year, month0, day + 1).getTime() < nowMs; // whole day passed
                return (
                  <button
                    key={day}
                    onClick={() => setSelected(dk)}
                    disabled={isPast}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-xl text-sm font-medium transition-all",
                      isPast && "cursor-not-allowed text-muted-foreground/40",
                      isSelected
                        ? "bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-md"
                        : hasOpen
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : !isPast && "text-foreground hover:bg-muted"
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Time slots for the selected day */}
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display font-bold text-foreground">{selectedLabel}</h3>
              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">{openCountForDay} open</span>
            </div>
            <div className="max-h-[28rem] space-y-1.5 overflow-y-auto">
              {HOURS.map((h) => {
                const k = slotKey(sy, sm, sd, h);
                const on = openSet.has(k);
                const isBooked = booked.has(k);
                const isPast = new Date(sy, sm - 1, sd, h).getTime() < nowMs;
                const time = `${p(h)}:00`;
                return (
                  <div
                    key={h}
                    className={cn(
                      "flex items-center justify-between rounded-xl border px-4 py-2.5 transition-colors",
                      isBooked ? "border-amber-200 bg-amber-50/50" : on ? "border-indigo-100 bg-indigo-50/50" : "border-border",
                      isPast && !isBooked && "opacity-50"
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {isBooked ? <Lock size={13} className="text-amber-600" /> : on && <Check size={14} className="text-indigo-600" />}
                      {time}
                      {isBooked && <span className="ml-1 text-xs font-semibold text-amber-700">Booked</span>}
                    </div>
                    {isBooked ? (
                      <span className="text-xs text-muted-foreground">locked</span>
                    ) : (
                      <Switch checked={on} disabled={isPast} onCheckedChange={() => toggle(k)} />
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      <div className="mt-6">
        <TimeOffCard />
      </div>
    </DashboardLayout>
  );
}

/** Vacation / Holiday / Block-time — ranges during which no one can book. */
function TimeOffCard() {
  const { data, isLoading } = useAvailabilityExceptions();
  const add = useAddAvailabilityException();
  const remove = useRemoveAvailabilityException();
  const [kind, setKind] = useState<AvailabilityExceptionKind>("vacation");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");

  const items = data ?? [];
  const canAdd = start && end && new Date(end) > new Date(start);

  const submit = () => {
    if (!canAdd) return;
    add.mutate(
      { kind, startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), note },
      { onSuccess: () => { setStart(""); setEnd(""); setNote(""); } }
    );
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Card className="p-6">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Plane size={16} className="text-indigo-600" /> Time off
      </div>
      <p className="mb-4 text-xs text-muted-foreground">Block vacations, holidays, or specific hours — students can't book during these.</p>

      {/* Add form */}
      <div className="mb-5 grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value as AvailabilityExceptionKind)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground">
            <option value="vacation">Vacation</option>
            <option value="holiday">Holiday</option>
            <option value="block">Block time</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Eid holiday" className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Starts
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Ends
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        <div className="sm:col-span-2">
          <Button size="sm" onClick={submit} disabled={!canAdd || add.isPending}>
            {add.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add time off
          </Button>
          {add.isError && <span className="ml-3 text-xs text-red-600">Could not add. Check the dates.</span>}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <Loading label="Loading time off…" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No time off scheduled.</p>
      ) : (
        <div className="space-y-2">
          {items.map((x: AvailabilityException) => {
            const meta = KIND_META[x.kind];
            const Icon = meta.icon;
            return (
              <div key={x.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", meta.tone)}>
                    <Icon size={12} /> {meta.label}
                  </span>
                  <div className="text-sm text-foreground">
                    {fmt(x.startAt)} → {fmt(x.endAt)}
                    {x.note && <span className="ml-2 text-xs text-muted-foreground">· {x.note}</span>}
                  </div>
                </div>
                <button
                  onClick={() => remove.mutate(x.id)}
                  disabled={remove.isPending}
                  aria-label="Remove time off"
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
