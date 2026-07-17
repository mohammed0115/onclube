import { Check, Dot, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InterviewAnswer, InterviewStep } from "@/api/types";

/** Read-only five-question timeline. State derives from server-confirmed answers.
 * Future questions are neither clickable nor skippable (plain <li>, no controls).
 * Status is conveyed by icon + text (not color alone) for accessibility. */
export function Timeline({
  steps,
  completed,
  currentIndex,
}: {
  steps: InterviewStep[];
  completed: InterviewAnswer[];
  currentIndex: number;
}) {
  const answered = new Set(completed.map((a) => a.questionId));
  return (
    <ol className="mb-4 space-y-1.5" aria-label="Interview progress">
      {steps.map((s, i) => {
        const done = answered.has(s.questionId);
        const current = !done && i === currentIndex;
        const status = done ? "done" : current ? "current" : "upcoming";
        return (
          <li
            key={s.questionId}
            aria-current={current ? "step" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm",
              done && "border-emerald-200 bg-emerald-50/50 text-emerald-800",
              current && "border-indigo-300 bg-indigo-50 font-semibold text-indigo-800",
              status === "upcoming" && "border-border bg-muted/20 text-muted-foreground"
            )}
          >
            <span aria-hidden className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
              {done ? <Check size={15} strokeWidth={3} className="text-emerald-600" />
                : current ? <Dot size={26} className="-m-2 text-indigo-600" />
                : <Lock size={13} className="text-muted-foreground/60" />}
            </span>
            <span className="flex-1">Question {i + 1}</span>
            <span className="text-[11px] font-medium uppercase tracking-wide">
              {done ? "Done" : current ? "Current" : "Locked"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
