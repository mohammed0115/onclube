// Global error boundary (Sprint 11) — presentation only, no business logic.
//
// Catches render-time errors anywhere below it, shows a friendly fallback, and
// records a METADATA-ONLY diagnostic event (error name + a component hint — never
// the message, which could contain data). A reset lets the user retry.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { recordEvent } from "@/lib/diagnostics";

interface Props {
  children: ReactNode;
  fallback?: (reset: () => void) => ReactNode;
}
interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Record the TYPE and a component hint only — never the error message/payload.
    const component = String(info?.componentStack ?? "").trim().split("\n")[0]?.trim();
    recordEvent("ui.error", { name: error.name, component });
  }

  private reset = () => this.setState({ hasError: false });

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback(this.reset);
      return (
        <div role="alert" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-8 text-center">
          <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            An unexpected error occurred. You can try again — your session is safe.
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
