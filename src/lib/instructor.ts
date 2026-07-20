// Shared helpers for rendering instructor cards/profiles from API data.

export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((p) => p[0]).join("") || "IN").toUpperCase();
}

// Deterministic gradient accent from a string (id/slug), so avatars vary nicely.
export const ACCENTS = [
  "from-amber-400 to-orange-500",
  "from-cyan-400 to-blue-500",
  "from-purple-400 to-purple-600",
  "from-emerald-400 to-teal-600",
  "from-rose-400 to-pink-600",
  "from-indigo-400 to-indigo-600",
];

export function accentFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

// Social platforms we render (icon label comes from a simple SVG set in the page).
export const SOCIAL_ORDER = ["linkedin", "x", "facebook", "instagram", "youtube", "tiktok", "github", "website"] as const;
