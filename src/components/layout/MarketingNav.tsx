import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { Button } from "@/components/ui/button";

export function MarketingNav() {
  return (
    <nav className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between border-b border-border bg-white/80 px-6 py-4 backdrop-blur-xl md:px-8">
      <Logo />
      <div className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
        <a href="#why" className="transition-colors hover:text-foreground">Why OneClub</a>
        <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
        <Link to="/billing/pricing" className="transition-colors hover:text-foreground">Pricing</Link>
        <a href="#instructors" className="transition-colors hover:text-foreground">Instructors</a>
      </div>
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/login">Sign in</Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/register">
            Get started <ArrowRight size={15} />
          </Link>
        </Button>
      </div>
    </nav>
  );
}
