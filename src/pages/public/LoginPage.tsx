import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, Mic } from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { Button } from "@/components/ui/button";
import { BrandPanel } from "@/components/marketing";
import { Field } from "@/components/forms";
import { useAppState } from "@/app/AppState";
import { useAuth, roleHome } from "@/auth/AuthProvider";
import { ApiError } from "@/api";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { Role } from "@/types";

export function LoginPage() {
  const { tx } = useI18n();
  const navigate = useNavigate();
  const { role, setRole } = useAppState();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email, password);
      navigate(roleHome(user.role), { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Incorrect email or password."
          : "Could not sign in. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <BrandPanel
        badge={<><Mic size={13} /> {tx("Welcome back")}</>}
        title={tx("Your next conversation is one click away.")}
        footnote={tx("Sign in to continue.")}
      />

      <div className="flex items-center justify-center bg-background px-6 py-12">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">{tx("Sign in")}</h1>
          <p className="mb-7 mt-1 text-sm text-muted-foreground">{tx("Welcome back — let’s get you talking.")}</p>

          <div className="mb-6 grid grid-cols-3 gap-2">
            {(["student", "instructor", "admin"] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={cn(
                  "rounded-xl border-2 px-2 py-2 text-xs font-semibold capitalize transition-all",
                  role === r ? "border-primary bg-blue-50 text-blue-700" : "border-border text-muted-foreground hover:border-blue-200"
                )}
              >
                {tx(r)}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <Field
              label={tx("Email")}
              htmlFor="email"
              type="email"
              placeholder={tx("you@email.com")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <Field
              label={tx("Password")}
              htmlFor="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <div className="text-right">
              <Link to="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
                {tx("Forgot password?")}
              </Link>
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-4 text-sm font-medium text-red-600">
              {tx(error)}
            </p>
          )}

          <Button type="submit" disabled={submitting} className="mt-7 w-full" size="lg">
            {submitting ? tx("Signing in…") : (
              <>
                {tx("Sign in")} <ArrowRight size={17} />
              </>
            )}
          </Button>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {tx("New here?")}{" "}
            <Link to="/register" className="font-semibold text-primary hover:underline">
              {tx("Create an account")}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
