import type { ReactNode } from "react";
import { Sparkles, Brain, CheckCircle, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Small pill that marks any content as AI-assisted (never AI-only authority). */
export function AIBadge({ label = "AI-assisted", className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-700",
        className
      )}
    >
      <Sparkles size={10} /> {label}
    </span>
  );
}

/** Gradient panel used to surface an AI summary/insight. */
export function AIInsightCard({
  title,
  children,
  icon,
}: {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 p-5 text-white">
      <div className="mb-3 flex items-center gap-2">
        {icon ?? <Brain size={18} />}
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="space-y-3 text-sm text-indigo-100">{children}</div>
    </div>
  );
}

export function RecommendationList({ items }: { items: string[] }) {
  return (
    <div className="space-y-2.5">
      {items.map((r) => (
        <div key={r} className="flex items-start gap-2.5 text-sm">
          <CheckCircle size={15} className="mt-0.5 flex-shrink-0 text-indigo-600" />
          <span className="text-foreground">{r}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Lets an instructor pull AI-suggested subtopics/questions into their own list.
 * The instructor stays in control — nothing is added without an explicit accept.
 */
export function AISuggestionRow({
  text,
  onAccept,
  accepted,
}: {
  text: string;
  onAccept: () => void;
  accepted: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-purple-100 bg-purple-50/60 px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm text-foreground">
        <Sparkles size={13} className="flex-shrink-0 text-purple-500" />
        {text}
      </div>
      <button
        onClick={onAccept}
        disabled={accepted}
        className={cn(
          "flex flex-shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
          accepted ? "bg-emerald-100 text-emerald-700" : "bg-purple-600 text-white hover:bg-purple-700"
        )}
      >
        {accepted ? <CheckCircle size={12} /> : <Plus size={12} />}
        {accepted ? "Added" : "Add"}
      </button>
    </div>
  );
}
