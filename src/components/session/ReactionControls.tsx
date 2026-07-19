import { useState } from "react";
import { Hand, Smile } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { Reaction, SignalConnectionState } from "@/lib/signals";
import { REACTIONS } from "@/lib/signals";

// Pure: the raise-hand toggle + reaction picker. All state/logic is passed in.
export function ReactionControls({
  connectionState,
  handRaised,
  onToggleHand,
  onSendReaction,
}: {
  connectionState: SignalConnectionState;
  handRaised: boolean;
  onToggleHand: () => void;
  onSendReaction: (reaction: Reaction) => void;
}) {
  const { tx } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);
  const disabled = connectionState !== "connected" && connectionState !== "reconnecting";
  const signaling = connectionState === "connecting";

  return (
    <div className="pointer-events-auto relative flex items-center gap-2 rounded-full bg-black/60 px-2 py-1.5 backdrop-blur">
      <button
        type="button"
        aria-pressed={handRaised}
        aria-label={handRaised ? tx("Lower hand") : tx("Raise hand")}
        onClick={onToggleHand}
        disabled={disabled}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full transition-all disabled:opacity-40",
          handRaised ? "bg-amber-400 text-slate-900" : "bg-white/10 text-white hover:bg-white/20"
        )}
      >
        <Hand size={18} />
      </button>

      <div className="relative">
        <button
          type="button"
          aria-label={tx("React")}
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((v) => !v)}
          disabled={disabled}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-all hover:bg-white/20 disabled:opacity-40"
        >
          <Smile size={18} />
        </button>
        {pickerOpen && (
          <div className="absolute bottom-12 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-slate-900 px-2 py-1.5 shadow-xl" role="menu" aria-label={tx("Reactions")}>
            {REACTIONS.map((r) => (
              <button
                key={r}
                type="button"
                role="menuitem"
                aria-label={`React with ${r}`}
                onClick={() => {
                  onSendReaction(r);
                  setPickerOpen(false);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition-transform hover:scale-125"
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {signaling && (
        <span className="px-1 text-[11px] text-white/70" role="status" aria-live="polite">
          {tx("Connecting signals…")}
        </span>
      )}
      {connectionState === "reconnecting" && (
        <span className="px-1 text-[11px] text-amber-300" role="status" aria-live="polite">
          {tx("Reconnecting signals…")}
        </span>
      )}
    </div>
  );
}
