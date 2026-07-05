import { useState } from "react";
import { Eraser, MousePointer2, Pencil, Redo2, Trash2, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WhiteboardConnectionState, WhiteboardError, WhiteboardTool } from "@/lib/whiteboard";

const CONNECTION_COPY: Record<string, { label: string; tone: string; pulse?: boolean }> = {
  idle: { label: "Preparing…", tone: "text-slate-400" },
  connecting: { label: "Connecting…", tone: "text-amber-500", pulse: true },
  connected: { label: "Live", tone: "text-emerald-500" },
  reconnecting: { label: "Reconnecting…", tone: "text-amber-500", pulse: true },
  disconnected: { label: "Disconnected", tone: "text-red-500" },
  failed: { label: "Sync failed", tone: "text-red-500" },
};

const ERROR_COPY: Record<string, string> = {
  provider_unavailable: "The whiteboard is temporarily unavailable.",
  sync_failed: "Couldn’t sync the board. Retrying…",
  operation_rejected: "That action was rejected.",
  undo_failed: "Nothing to undo.",
  redo_failed: "Nothing to redo.",
  clear_failed: "Couldn’t clear the board.",
  connection_lost: "Connection lost. Reconnecting…",
  unknown: "Something went wrong.",
};

const PALETTE = ["#111827", "#ef4444", "#2563eb", "#16a34a", "#f59e0b", "#ffffff"];
const WIDTHS = [2, 4, 8, 14];

const TOOLS: { key: WhiteboardTool; label: string; icon: typeof Pencil }[] = [
  { key: "pen", label: "Pen", icon: Pencil },
  { key: "eraser", label: "Eraser", icon: Eraser },
  { key: "pointer", label: "Pointer", icon: MousePointer2 },
];

export interface WhiteboardPanelProps {
  connectionState: WhiteboardConnectionState;
  tool: WhiteboardTool;
  color: string;
  strokeWidth: number;
  syncing: boolean;
  error: WhiteboardError | null;
  onSetTool: (tool: WhiteboardTool) => void;
  onSetColor: (color: string) => void;
  onSetStrokeWidth: (width: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onClose: () => void;
  attachCanvas: (el: HTMLCanvasElement | null) => void;
}

export function WhiteboardPanel({
  connectionState,
  tool,
  color,
  strokeWidth,
  syncing,
  error,
  onSetTool,
  onSetColor,
  onSetStrokeWidth,
  onUndo,
  onRedo,
  onClear,
  onClose,
  attachCanvas,
}: WhiteboardPanelProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const conn = CONNECTION_COPY[connectionState] ?? CONNECTION_COPY.idle;

  return (
    <section className="flex h-full w-full flex-col bg-white text-slate-900" aria-label="Whiteboard">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Whiteboard</span>
          <span className={cn("text-[11px] font-medium", conn.tone, conn.pulse && "animate-pulse")} role="status" aria-live="polite">
            {conn.label}
          </span>
        </div>
        <button type="button" aria-label="Close whiteboard" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
          <X size={16} />
        </button>
      </header>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2" role="toolbar" aria-label="Drawing tools">
        <div className="flex items-center gap-1">
          {TOOLS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              aria-label={label}
              aria-pressed={tool === key}
              onClick={() => onSetTool(key)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg",
                tool === key ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>

        <span className="mx-1 h-5 w-px bg-slate-200" />

        <button type="button" aria-label="Undo" onClick={onUndo} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100">
          <Undo2 size={16} />
        </button>
        <button type="button" aria-label="Redo" onClick={onRedo} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100">
          <Redo2 size={16} />
        </button>
        <button type="button" aria-label="Clear board" onClick={() => setConfirmClear(true)} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50">
          <Trash2 size={16} />
        </button>

        <span className="mx-1 h-5 w-px bg-slate-200" />

        {/* Colour */}
        <div className="flex items-center gap-1" aria-label="Colour">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={color.toLowerCase() === c.toLowerCase()}
              onClick={() => onSetColor(c)}
              style={{ background: c }}
              className={cn(
                "h-6 w-6 rounded-full border",
                color.toLowerCase() === c.toLowerCase() ? "ring-2 ring-primary ring-offset-1" : "border-slate-300"
              )}
            />
          ))}
        </div>

        <span className="mx-1 h-5 w-px bg-slate-200" />

        {/* Stroke width */}
        <div className="flex items-center gap-1" aria-label="Stroke width">
          {WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              aria-label={`Width ${w}`}
              aria-pressed={strokeWidth === w}
              onClick={() => onSetStrokeWidth(w)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100",
                strokeWidth === w && "bg-slate-100"
              )}
            >
              <span className="rounded-full bg-slate-800" style={{ width: w, height: w }} />
            </button>
          ))}
        </div>
      </div>

      {/* Canvas surface (provider owns all pixels; we only hand it the element) */}
      <div className="relative min-h-0 flex-1 bg-slate-50">
        <canvas
          ref={attachCanvas}
          width={1280}
          height={720}
          data-testid="whiteboard-canvas"
          className={cn("h-full w-full touch-none", tool === "pointer" ? "cursor-default" : "cursor-crosshair")}
        />
        {syncing && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70" role="status" aria-live="polite">
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
              <span className="text-xs">Synchronizing board…</span>
            </div>
          </div>
        )}
        {connectionState === "reconnecting" && !syncing && (
          <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs text-white shadow" role="status">
            Reconnecting…
          </div>
        )}
      </div>

      {error && (
        <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600" role="alert">
          {ERROR_COPY[error.code] ?? ERROR_COPY.unknown}
        </div>
      )}

      {/* Clear confirmation */}
      {confirmClear && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-6" role="dialog" aria-modal="true" aria-label="Clear board?">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl">
            <div className="mb-1 text-sm font-semibold text-slate-900">Clear the whiteboard?</div>
            <p className="mb-4 text-xs text-slate-500">This removes everything on the board for everyone.</p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmClear(false);
                  onClear();
                }}
                className="rounded-lg bg-red-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-600"
              >
                Clear board
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
