import { Link } from "react-router";
import { ArrowRight, Globe } from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

export function MarketingNav() {
  const { tx, lang, toggle } = useI18n();
  return (
    <nav className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between border-b border-border bg-white/80 px-6 py-4 backdrop-blur-xl md:px-8">
      <Logo />
      <div className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
        <a href="#why" className="transition-colors hover:text-foreground">{tx("Why OneClup")}</a>
        <a href="#how" className="transition-colors hover:text-foreground">{tx("How it works")}</a>
        <Link to="/billing/pricing" className="transition-colors hover:text-foreground">{tx("Pricing")}</Link>
        <a href="#instructors" className="transition-colors hover:text-foreground">{tx("Instructors")}</a>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Prominent language switch — always visible in the top bar. */}
        <button
          onClick={toggle}
          className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-2.5 py-2 text-xs font-bold text-blue-700 shadow-sm transition-colors hover:bg-blue-50 sm:px-3"
          aria-label="Toggle language"
          title={lang === "ar" ? "English" : "العربية"}
        >
          <Globe size={15} />
          {lang === "ar" ? "English" : "العربية"}
        </button>
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link to="/login">{tx("Sign in")}</Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/register">
            {tx("Get started")} <ArrowRight size={15} />
          </Link>
        </Button>
      </div>
    </nav>
  );
}
