import { useLocation } from "react-router";
import { useI18n } from "@/i18n";

/** English ⟷ Arabic pill. Flips the document direction (RTL) app-wide. */
export function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, toggle } = useI18n();
  return (
    <button
      onClick={toggle}
      className={
        "flex h-9 items-center justify-center rounded-xl bg-muted/60 px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted " +
        className
      }
      aria-label="Toggle language"
      title={lang === "ar" ? "English" : "العربية"}
    >
      {lang === "ar" ? "EN" : "ع"}
    </button>
  );
}

// Areas that render DashboardLayout (which already has a header toggle).
const DASHBOARD_PREFIXES = ["/student", "/instructor", "/admin"];

/**
 * Floating toggle for pages WITHOUT the dashboard chrome (landing, auth,
 * onboarding, billing) — so language can be switched before signing in.
 * Hidden on dashboard routes to avoid a duplicate of the header toggle.
 */
export function FloatingLanguageToggle() {
  const { pathname } = useLocation();
  const onDashboard = DASHBOARD_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (onDashboard) return null;
  return (
    <div className="fixed bottom-4 end-4 z-50">
      <LanguageToggle className="border border-border bg-card/95 shadow-md backdrop-blur" />
    </div>
  );
}
