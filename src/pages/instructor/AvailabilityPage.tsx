import { useEffect, useState } from "react";
import { Check, Loader2, Info, Plane, Plus, Trash2, Ban, CalendarOff } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/states";
import {
  useRecurringAvailability,
  useSetRecurringAvailability,
  useAvailabilityExceptions,
  useAddAvailabilityException,
  useRemoveAvailabilityException,
} from "@/hooks";
import type { AvailabilityException, AvailabilityExceptionKind, AvailabilityWindow } from "@/api/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

const KIND_META: Record<AvailabilityExceptionKind, { label: string; icon: typeof Plane; tone: string }> = {
  vacation: { label: "Vacation", icon: Plane, tone: "bg-indigo-100 text-indigo-700" },
  holiday: { label: "Holiday", icon: CalendarOff, tone: "bg-amber-100 text-amber-700" },
  block: { label: "Block time", icon: Ban, tone: "bg-rose-100 text-rose-700" },
};

// Backend weekday: 0 = Monday … 6 = Sunday (matches the student availability grid).
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00 – 22:00
const p = (n: number) => String(n).padStart(2, "0");
const cellKey = (wd: number, h: number) => `${wd}-${h}`;

/** Expand server windows (weekday + start/end) into per-hour grid cells. */
function windowsToCells(windows: AvailabilityWindow[]): Set<string> {
  const s = new Set<string>();
  windows.forEach((w) => {
    const sh = Number(w.startTime.slice(0, 2));
    const eh = Number(w.endTime.slice(0, 2));
    for (let h = sh; h < eh; h++) if (HOURS.includes(h)) s.add(cellKey(w.weekday, h));
  });
  return s;
}

/** Merge selected hour cells back into contiguous weekly windows. */
function cellsToWindows(cells: Set<string>): AvailabilityWindow[] {
  const byDay: Record<number, number[]> = {};
  cells.forEach((k) => {
    const [wd, h] = k.split("-").map(Number);
    (byDay[wd] ??= []).push(h);
  });
  const out: AvailabilityWindow[] = [];
  Object.keys(byDay).map(Number).forEach((wd) => {
    const hrs = byDay[wd].sort((a, b) => a - b);
    let start = hrs[0];
    let prev = hrs[0];
    for (let i = 1; i < hrs.length; i++) {
      if (hrs[i] === prev + 1) { prev = hrs[i]; }
      else { out.push({ weekday: wd, startTime: `${p(start)}:00`, endTime: `${p(prev + 1)}:00` }); start = hrs[i]; prev = hrs[i]; }
    }
    out.push({ weekday: wd, startTime: `${p(start)}:00`, endTime: `${p(prev + 1)}:00` });
  });
  return out;
}

export function AvailabilityPage() {
  const { tx } = useI18n();
  const q = useRecurringAvailability();
  const save = useSetRecurringAvailability();
  const [cells, setCells] = useState<Set<string> | null>(null);
  const [saved, setSaved] = useState(false);

  // Seed the editable grid once from the server's windows.
  useEffect(() => {
    if (q.data && cells === null) setCells(windowsToCells(q.data));
  }, [q.data, cells]);

  const set = cells ?? new Set<string>();
  const toggle = (wd: number, h: number) => {
    setSaved(false);
    setCells((prev) => {
      const n = new Set(prev ?? []);
      const k = cellKey(wd, h);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  };
  const onSave = () => {
    setSaved(false);
    save.mutate(cellsToWindows(set), { onSuccess: () => setSaved(true) });
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Availability"
        subtitle="Set the weekly times you can teach. Students who choose these times are matched to you."
        action={
          <Button size="sm" onClick={onSave} disabled={save.isPending || cells === null}>
            {save.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {tx("Save changes")}
          </Button>
        }
      />

      {saved && !save.isPending && (
        <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">{tx("Availability published ✓")}</p>
      )}
      {save.isError && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-600">{tx("Could not save. Please try again.")}</p>
      )}

      {q.isLoading || cells === null ? (
        <Loading label="Loading your availability…" />
      ) : (
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info size={13} /> {tx("Tap the weekly times you can teach")}
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[36rem]">
              <div className="grid grid-cols-[3rem_repeat(7,1fr)] gap-1 pb-1">
                <div />
                {WEEKDAYS.map((d) => (
                  <div key={d} className="text-center text-[11px] font-semibold uppercase text-muted-foreground">{tx(d)}</div>
                ))}
              </div>
              <div className="max-h-[30rem] space-y-1 overflow-y-auto pr-1">
                {HOURS.map((h) => (
                  <div key={h} className="grid grid-cols-[3rem_repeat(7,1fr)] gap-1">
                    <div className="flex items-center justify-end pr-1 text-[11px] font-medium text-muted-foreground">{p(h)}:00</div>
                    {WEEKDAYS.map((_, wd) => {
                      const on = set.has(cellKey(wd, h));
                      return (
                        <button
                          key={wd}
                          onClick={() => toggle(wd, h)}
                          title={on ? tx("Tap to remove") : tx("Tap to add")}
                          className={cn(
                            "flex h-9 items-center justify-center rounded-lg border text-[10px] font-semibold transition-all",
                            on
                              ? "border-indigo-300 bg-indigo-500 text-white"
                              : "border-border bg-card text-muted-foreground hover:border-indigo-300 hover:bg-indigo-50"
                          )}
                        >
                          {on ? <Check size={13} /> : "+"}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {set.size > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">{set.size} {tx("weekly hour(s) available")}</p>
          )}
        </Card>
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
  const { tx } = useI18n();
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
        <Plane size={16} className="text-indigo-600" /> {tx("Time off")}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">{tx("Block vacations, holidays, or specific hours — students can't book during these.")}</p>

      {/* Add form */}
      <div className="mb-5 grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {tx("Type")}
          <select value={kind} onChange={(e) => setKind(e.target.value as AvailabilityExceptionKind)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground">
            <option value="vacation">{tx("Vacation")}</option>
            <option value="holiday">{tx("Holiday")}</option>
            <option value="block">{tx("Block time")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {tx("Note (optional)")}
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={tx("e.g. Eid holiday")} className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {tx("Starts")}
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {tx("Ends")}
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        <div className="sm:col-span-2">
          <Button size="sm" onClick={submit} disabled={!canAdd || add.isPending}>
            {add.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {tx("Add time off")}
          </Button>
          {add.isError && <span className="ml-3 text-xs text-red-600">{tx("Could not add. Check the dates.")}</span>}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <Loading label="Loading time off…" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tx("No time off scheduled.")}</p>
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
                  aria-label={tx("Remove time off")}
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
