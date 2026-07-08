// Client diagnostics hooks (Sprint 11) — operational only, no business logic.
import { useEffect, useReducer, useState } from "react";
import {
  clearDiagnostics,
  getEvents,
  getLastRequestId,
  recordEvent,
  subscribeDiagnostics,
  type DiagnosticEvent,
} from "@/lib/diagnostics";

export interface DiagnosticsController {
  events: DiagnosticEvent[];
  lastRequestId: string | undefined;
  record: (type: string, meta?: Record<string, unknown>) => void;
  clear: () => void;
}

/** Reactive view of the diagnostics buffer. */
export function useDiagnostics(): DiagnosticsController {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribeDiagnostics(force), []);
  return { events: getEvents(), lastRequestId: getLastRequestId(), record: recordEvent, clear: clearDiagnostics };
}

/** Tracks browser connectivity and records transitions as diagnostics. */
export function useConnectionDiagnostics(): { online: boolean } {
  const [online, setOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine !== false : true));
  useEffect(() => {
    const up = () => {
      setOnline(true);
      recordEvent("connection.online");
    };
    const down = () => {
      setOnline(false);
      recordEvent("connection.offline");
    };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return { online };
}
