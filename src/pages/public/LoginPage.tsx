import { Link, useNavigate } from "react-router";
import { ArrowRight, Mic } from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms";
import { useAppState } from "@/app/AppState";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

const ROLE_HOME: Record<Role, string> = {
  student: "/student",
  instructor: "/instructor",
  admin: "/admin",
};

export function LoginPage() {
  const navigate = useNavigate();
  const { role, setRole } = useAppState();

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#08081A] p-10 lg:flex">
        <div className="pointer-events-none absolute -left-20 bottom-10 h-96 w-96 rounded-full bg-purple-600/20 blur-3xl" />
        <Logo light />
        <div className="relative z-10">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/15 px-4 py-2 text-sm text-indigo-300">
            <Mic size={13} /> Welcome back
          </div>
          <h2 className="font-display text-3xl font-extrabold leading-tight text-white">
            Your next conversation is one click away.
          </h2>
        </div>
        <p className="relative z-10 text-xs text-gray-600">Prototype — sign-in is simulated.</p>
      </div>

      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Sign in</h1>
          <p className="mb-7 mt-1 text-sm text-muted-foreground">Choose how you want to sign in for the demo.</p>

          <div className="mb-6 grid grid-cols-3 gap-2">
            {(["student", "instructor", "admin"] as Role[]).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={cn(
                  "rounded-xl border-2 px-2 py-2 text-xs font-semibold capitalize transition-all",
                  role === r ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-border text-muted-foreground hover:border-indigo-200"
                )}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <Field label="Email" htmlFor="email" type="email" placeholder="you@email.com" />
            <Field label="Password" htmlFor="password" type="password" placeholder="••••••••" />
          </div>

          <Button onClick={() => navigate(ROLE_HOME[role])} className="mt-7 w-full" size="lg">
            Sign in as {role} <ArrowRight size={17} />
          </Button>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            New here?{" "}
            <Link to="/register" className="font-semibold text-indigo-600 hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
