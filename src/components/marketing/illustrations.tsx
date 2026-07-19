/**
 * OneClub illustration system — hand-built inline SVG.
 * Friendly, human, never robotic. Palette: sky blue (primary), periwinkle (AI),
 * warm orange (accent), green (success). No external assets.
 *
 * Everything is currentColor-free and uses explicit brand hues so the same scene
 * reads consistently across light surfaces.
 */
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

const BLUE = "#3B82F6";
const BLUE_DARK = "#2563EB";
const PERI = "#6366F1";
const ORANGE = "#F59E0B";
const GREEN = "#22C55E";

/** Soft gradient blob — background depth shape behind hero/section content. */
export function BlobShape({
  className,
  from = BLUE,
  to = PERI,
}: {
  className?: string;
  from?: string;
  to?: string;
}) {
  return (
    <svg viewBox="0 0 600 600" className={cn("pointer-events-none", className)} aria-hidden>
      <defs>
        <linearGradient id={`blob-${from}-${to}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <path
        fill={`url(#blob-${from}-${to})`}
        d="M421 92c52 36 92 92 99 154 7 63-19 132-66 176-47 45-115 65-180 56-65-10-127-49-162-105-35-57-43-131-15-188 27-58 90-99 158-114 67-15 114-15 166 21z"
      />
    </svg>
  );
}

/** A single chat bubble — used to suggest live conversation. */
export function ChatBubble({
  text,
  tone = "blue",
  className,
}: {
  text: string;
  tone?: "blue" | "peri" | "white";
  className?: string;
}) {
  const styles =
    tone === "blue"
      ? "bg-blue-500 text-white"
      : tone === "peri"
      ? "bg-purple-100 text-purple-700"
      : "bg-white text-foreground border border-border";
  return (
    <div
      className={cn(
        "relative w-fit max-w-[220px] rounded-2xl px-4 py-2.5 text-sm font-medium shadow-sm",
        styles,
        className
      )}
    >
      {text}
    </div>
  );
}

/**
 * Hero conversation scene — two simple friendly characters (student + instructor)
 * with floating chat bubbles and a microphone. The "people talking" centrepiece.
 */
export function ConversationScene({ className }: { className?: string }) {
  const { tx } = useI18n();
  return (
    <svg viewBox="0 0 460 380" className={cn("h-auto w-full", className)} role="img" aria-label={tx("Two people having a conversation")}>
      <defs>
        <linearGradient id="cs-card" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f8fafc" />
        </linearGradient>
        <linearGradient id="cs-blue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={BLUE} />
          <stop offset="100%" stopColor={BLUE_DARK} />
        </linearGradient>
        <linearGradient id="cs-orange" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={ORANGE} />
          <stop offset="100%" stopColor="#EA580C" />
        </linearGradient>
      </defs>

      {/* soft backdrop */}
      <rect x="20" y="40" width="420" height="300" rx="28" fill="url(#cs-card)" stroke="#e2e8f0" />

      {/* instructor (left) */}
      <g transform="translate(95 150)">
        <circle cx="0" cy="0" r="44" fill="url(#cs-orange)" />
        <circle cx="0" cy="-6" r="16" fill="#fff" opacity="0.95" />
        <path d="M-22 26 a22 18 0 0 1 44 0 z" fill="#fff" opacity="0.95" />
      </g>

      {/* student (right) */}
      <g transform="translate(365 200)">
        <circle cx="0" cy="0" r="44" fill="url(#cs-blue)" />
        <circle cx="0" cy="-6" r="16" fill="#fff" opacity="0.95" />
        <path d="M-22 26 a22 18 0 0 1 44 0 z" fill="#fff" opacity="0.95" />
      </g>

      {/* bubble from instructor */}
      <g transform="translate(150 95)">
        <rect width="150" height="54" rx="18" fill={BLUE} />
        <path d="M24 54 l0 18 l20 -18 z" fill={BLUE} />
        <circle cx="34" cy="27" r="5" fill="#fff" />
        <circle cx="56" cy="27" r="5" fill="#fff" />
        <circle cx="78" cy="27" r="5" fill="#fff" />
      </g>

      {/* bubble from student (periwinkle / reply) */}
      <g transform="translate(210 215)">
        <rect width="120" height="48" rx="16" fill="#EEF2FF" stroke={PERI} strokeWidth="1.5" />
        <path d="M96 48 l0 16 l18 -16 z" fill="#EEF2FF" stroke={PERI} strokeWidth="1.5" />
        <rect x="20" y="18" width="50" height="6" rx="3" fill={PERI} />
        <rect x="20" y="30" width="78" height="6" rx="3" fill={PERI} opacity="0.55" />
      </g>

      {/* mic accent */}
      <g transform="translate(228 300)">
        <rect x="-9" y="-22" width="18" height="34" rx="9" fill={GREEN} />
        <path d="M-15 4 a15 15 0 0 0 30 0" fill="none" stroke={GREEN} strokeWidth="4" strokeLinecap="round" />
        <line x1="0" y1="19" x2="0" y2="28" stroke={GREEN} strokeWidth="4" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Upward growth/progress mark — used for "confidence/progress" beats. */
export function GrowthMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={cn("", className)} aria-hidden>
      <defs>
        <linearGradient id="growth" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={BLUE} />
          <stop offset="100%" stopColor={GREEN} />
        </linearGradient>
      </defs>
      <rect x="18" y="74" width="16" height="28" rx="5" fill={BLUE} opacity="0.45" />
      <rect x="44" y="56" width="16" height="46" rx="5" fill={BLUE} opacity="0.7" />
      <rect x="70" y="34" width="16" height="68" rx="5" fill="url(#growth)" />
      <path d="M24 60 L52 44 L78 28 L100 16" fill="none" stroke={GREEN} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M100 16 l-14 2 m14 -2 l-2 14" fill="none" stroke={GREEN} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
