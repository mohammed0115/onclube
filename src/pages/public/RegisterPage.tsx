import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, Mic } from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { Button } from "@/components/ui/button";
import { BrandPanel } from "@/components/marketing";
import { Field } from "@/components/forms";
import { useAuth } from "@/auth/AuthProvider";
import { ApiError } from "@/api";

const PERKS = [
  "Free AI placement test to find your level",
  "Discussion questions before every session",
  "An AI session report after every session",
];

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register({ fullName, email, password });
      navigate("/onboarding/goal", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_already_registered") {
        setError("An account with this email already exists.");
      } else if (err instanceof ApiError && err.status === 400) {
        setError("Please check your details and try again.");
      } else {
        setError("Could not create your account. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Brand panel */}
      <BrandPanel
        badge={<><Mic size={13} /> Speak more, study less</>}
        title="Join OneClub and start practising with real instructors."
        perks={PERKS}
        footnote="Create your account to get started."
      />

      {/* Form */}
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Create your account</h1>
          <p className="mb-7 mt-1 text-sm text-muted-foreground">It takes less than a minute.</p>

          <div className="space-y-4">
            <Field
              label="Full name"
              htmlFor="name"
              placeholder="Mohammed Kamal"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />
            <Field
              label="Email"
              htmlFor="email"
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <Field
              label="Password"
              htmlFor="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <p role="alert" className="mt-4 text-sm font-medium text-red-600">
              {error}
            </p>
          )}

          <Button type="submit" disabled={submitting} className="mt-7 w-full" size="lg">
            {submitting ? "Creating…" : (
              <>
                Create account <ArrowRight size={17} />
              </>
            )}
          </Button>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Already a member?{" "}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
