import { MessagesSquare } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

export function Logo({ light = false, to = "/" }: { light?: boolean; to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600">
        <MessagesSquare size={16} className="text-white" />
      </div>
      <span
        className={cn("font-display text-lg font-bold tracking-tight", light ? "text-white" : "text-foreground")}
      >
        English<span className="text-indigo-500">Club</span>
      </span>
    </Link>
  );
}
