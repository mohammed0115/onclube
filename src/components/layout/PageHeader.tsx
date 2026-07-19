import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft } from "lucide-react";
import { useI18n } from "@/i18n";

export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string;
  /** route to go back to; renders a back chevron when provided */
  back?: string;
  action?: ReactNode;
}) {
  const navigate = useNavigate();
  const { tx, dir } = useI18n();
  return (
    <div className="mb-7 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {back && (
          <button
            onClick={() => navigate(back)}
            className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Back"
          >
            <ChevronLeft size={18} className={dir === "rtl" ? "rotate-180" : ""} />
          </button>
        )}
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">{tx(title)}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{tx(subtitle)}</p>}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
