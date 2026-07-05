import type { FloatingReaction } from "@/lib/signals";

// Pure: renders transient reaction bubbles that rise and fade. No logic.
export function FloatingReactions({ floating }: { floating: FloatingReaction[] }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex items-end justify-center" aria-hidden={floating.length === 0}>
      <style>{`@keyframes reactionFloat{0%{opacity:0;transform:translateY(12px) scale(.8)}15%{opacity:1}100%{opacity:0;transform:translateY(-72px) scale(1.1)}}`}</style>
      {floating.map((f, i) => (
        <div
          key={f.key}
          data-testid="floating-reaction"
          className="absolute text-4xl"
          style={{ left: `calc(50% + ${(i % 5) * 28 - 56}px)`, animation: "reactionFloat 4s ease-out forwards" }}
        >
          {f.reaction}
        </div>
      ))}
    </div>
  );
}
