import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { X } from "lucide-react";
import { Logo } from "@/components/navigation/Logo";

export function OnboardingLayout({
  children,
  step,
  total,
}: {
  children: ReactNode;
  step: number;
  total: number;
}) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-white/90 px-6 py-4 backdrop-blur-xl md:px-8">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
              Step {step} of {total}
            </span>
            <div className="flex gap-1.5">
              {Array.from({ length: total }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i < step ? "w-6 bg-indigo-600" : "w-4 bg-muted"}`}
                />
              ))}
            </div>
          </div>
          <button
            onClick={() => navigate("/")}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Exit"
          >
            <X size={20} />
          </button>
        </div>
      </header>
      <div className="px-4 pb-32 pt-24">{children}</div>
    </div>
  );
}
