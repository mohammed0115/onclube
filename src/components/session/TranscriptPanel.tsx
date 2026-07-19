import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { TranscriptConnectionState, TranscriptError, TranscriptSegment } from "@/lib/transcript";

const CONNECTION_COPY: Record<string, { label: string; tone: string; pulse?: boolean }> = {
  idle: { label: "Preparing…", tone: "text-slate-400" },
  connecting: { label: "Connecting…", tone: "text-amber-500", pulse: true },
  connected: { label: "Live", tone: "text-emerald-500" },
  reconnecting: { label: "Reconnecting…", tone: "text-amber-500", pulse: true },
  disconnected: { label: "Disconnected", tone: "text-red-500" },
  failed: { label: "Unavailable", tone: "text-red-500" },
};

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Pure: the live transcript stream. Partial segments render muted/italic; final
// segments render solid. No analysis, no editing — presentation only.
export function TranscriptPanel({
  segments,
  connectionState,
  error,
  onClose,
}: {
  segments: TranscriptSegment[];
  connectionState: TranscriptConnectionState;
  error: TranscriptError | null;
  onClose: () => void;
}) {
  const { tx } = useI18n();
  const bottomRef = useRef<HTMLDivElement>(null);
  const conn = CONNECTION_COPY[connectionState] ?? CONNECTION_COPY.idle;
  const loading = connectionState === "connecting" && segments.length === 0;

  useEffect(() => {
    const el = bottomRef.current;
    if (typeof el?.scrollIntoView === "function") el.scrollIntoView({ block: "end" });
  }, [segments.length, segments]);

  return (
    <section className="flex h-full w-full flex-col bg-white text-slate-900" aria-label={tx("Live transcript")}>
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{tx("Transcript")}</span>
          <span className={cn("text-[11px] font-medium", conn.tone, conn.pulse && "animate-pulse")} role="status" aria-live="polite">
            {tx(conn.label)}
          </span>
        </div>
        <button type="button" aria-label={tx("Close transcript")} onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
          <X size={16} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3" data-testid="transcript-scroll">
        {loading ? (
          <div className="flex h-full items-center justify-center" role="status" aria-live="polite">
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
              <span className="text-xs">{tx("Starting transcript…")}</span>
            </div>
          </div>
        ) : segments.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">{tx("No transcript yet.")}</p>
        ) : (
          segments.map((s) => (
            <div key={s.segmentId} data-testid="transcript-segment" data-final={String(s.isFinal)} className="text-sm">
              <span className="mr-1.5 text-[11px] font-semibold text-slate-500">
                {s.speakerName}
                <span className="ml-1 font-normal capitalize text-slate-400">· {s.speakerRole}</span>
                <span className="ml-1 font-normal text-slate-300">{timeOf(s.startedAt)}</span>
              </span>
              <span
                className={cn(
                  s.isFinal ? "text-slate-900" : "italic text-slate-400",
                  "aria-live"
                )}
                aria-live={s.isFinal ? "off" : "polite"}
              >
                {s.text}
                {!s.isFinal && <span className="text-slate-300"> …</span>}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600" role="alert">
          {tx("Transcript interrupted — reconnecting…")}
        </div>
      )}
    </section>
  );
}
