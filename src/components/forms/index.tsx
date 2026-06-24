import type { ReactNode } from "react";
import { CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({
  label,
  hint,
  children,
  htmlFor,
  ...inputProps
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children?: ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children ?? <Input id={htmlFor} {...inputProps} />}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** Large selectable card used for goals/levels/payment methods. */
export function OptionCard({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border-2 p-5 text-left transition-all",
        selected
          ? "border-indigo-500 bg-indigo-50 shadow-lg shadow-indigo-100"
          : "border-border bg-card hover:border-indigo-200 hover:shadow-sm",
        className
      )}
    >
      {children}
    </button>
  );
}

export function CheckMark({ on }: { on: boolean }) {
  return on ? <CheckCircle size={18} className="flex-shrink-0 text-indigo-600" /> : null;
}
