import { MessagesSquare } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

export function Logo({ light = false, to = "/" }: { light?: boolean; to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-sm shadow-blue-500/30">
        <MessagesSquare size={16} className="text-white" />
      </div>
      <span
        className={cn("font-display text-lg font-bold tracking-tight", light ? "text-white" : "text-foreground")}
      >
        One<span className="text-primary">Club</span>
      </span>
    </Link>
  );
}
