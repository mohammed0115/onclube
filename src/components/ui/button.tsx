import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl font-semibold transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary — calm sky blue, soft depth, clear hover
        primary:
          "bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-600/25 hover:from-blue-600 hover:to-blue-700 hover:shadow-md hover:shadow-blue-600/30",
        // Accent — deliberate warm orange for the single highest-intent CTA
        accent:
          "bg-orange-500 text-white shadow-sm shadow-orange-500/25 hover:bg-orange-600 hover:shadow-md hover:shadow-orange-500/30",
        ghost:
          "border border-border bg-card text-foreground hover:bg-muted hover:border-slate-300",
        soft: "bg-secondary text-secondary-foreground hover:bg-blue-100",
        // Glass — reserved for use over the dark live-video stage only
        glass:
          "bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/15",
        danger: "bg-red-500 text-white hover:bg-red-600",
        link: "text-primary hover:underline underline-offset-4",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-6 text-sm",
        lg: "h-14 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  }
);
Button.displayName = "Button";
export { buttonVariants };
