import { Loader2, AlertCircle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/api";

/** Inline loading spinner with an accessible label. */
export function Loading({ label = "Loading…", className = "" }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground ${className}`}
    >
      <Loader2 className="animate-spin text-indigo-500" size={26} />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/** Empty-state placeholder. */
export function EmptyState({
  title,
  description,
  icon = <Inbox size={26} className="text-muted-foreground" />,
  action,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-14 text-center">
      <div className="mb-1">{icon}</div>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {description && <div className="max-w-sm text-sm text-muted-foreground">{description}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function humanizeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (typeof error.detail === "string") return error.detail;
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

/** Error state with a Retry button. */
export function ErrorState({
  error,
  onRetry,
  title = "Couldn’t load this",
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-red-100 bg-red-50/50 py-14 text-center"
    >
      <AlertCircle size={26} className="text-red-500" />
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="max-w-sm text-sm text-muted-foreground">{humanizeError(error)}</div>
      {onRetry && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * Convenience wrapper that renders the right state for a React-Query-style
 * result. Keeps page markup focused on the success branch.
 */
export function QueryBoundary<T>({
  query,
  children,
  loadingLabel,
  empty,
}: {
  query: { isLoading: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => void };
  children: (data: T) => React.ReactNode;
  loadingLabel?: string;
  empty?: (data: T) => React.ReactNode;
}) {
  if (query.isLoading) return <Loading label={loadingLabel} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.data === undefined) return <ErrorState error={null} onRetry={() => query.refetch()} />;
  const emptyNode = empty?.(query.data);
  if (emptyNode) return <>{emptyNode}</>;
  return <>{children(query.data)}</>;
}
