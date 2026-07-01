import type { ReactNode } from "react";
import { CheckCircle } from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { cn } from "@/lib/utils";
import { BlobShape, ConversationScene } from "./illustrations";

export * from "./illustrations";

/** Section eyebrow label — small uppercase tag in primary blue. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("text-sm font-bold uppercase tracking-widest text-primary", className)}>
      {children}
    </span>
  );
}

/** Standard centered section heading block. */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto max-w-2xl text-center", className)}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      {subtitle && <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

/** A landing section shell — consistent vertical rhythm + max width. */
export function Section({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("px-6 py-20 md:px-8 md:py-24", className)}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

/**
 * Shared light brand panel used on the Login / Register split screens.
 * Soft blue gradient, conversation illustration, optional perks list.
 */
export function BrandPanel({
  badge,
  title,
  perks,
  footnote,
}: {
  badge: ReactNode;
  title: ReactNode;
  perks?: string[];
  footnote?: string;
}) {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-10 lg:flex">
      <BlobShape className="absolute -right-24 -top-24 h-96 w-96 opacity-20" />
      <BlobShape className="absolute -bottom-28 -left-24 h-96 w-96 opacity-20" from="#F59E0B" to="#3B82F6" />

      <Logo />

      <div className="relative z-10">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
          {badge}
        </div>
        <h2 className="font-display text-3xl font-extrabold leading-tight text-foreground">{title}</h2>

        <div className="mt-8 max-w-sm">
          <ConversationScene />
        </div>

        {perks && (
          <div className="mt-6 space-y-3">
            {perks.map((p) => (
              <div key={p} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <CheckCircle size={16} className="text-success" /> {p}
              </div>
            ))}
          </div>
        )}
      </div>

      {footnote && <p className="relative z-10 text-xs text-muted-foreground">{footnote}</p>}
    </div>
  );
}
