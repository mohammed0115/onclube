import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, KeyRound, MailCheck } from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { Button } from "@/components/ui/button";
import { BrandPanel } from "@/components/marketing";
import { Field } from "@/components/forms";
import { useRequestPasswordReset } from "@/hooks";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const request = useRequestPasswordReset();
  const sent = request.isSuccess;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) request.mutate(email);
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <BrandPanel
        badge={<><KeyRound size={13} /> Account help</>}
        title="Forgot your password? It happens."
        footnote="We'll email you a secure reset link."
      />
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo /></div>

          {sent ? (
            <div className="text-center">
              <MailCheck size={40} className="mx-auto mb-3 text-emerald-500" />
              <h1 className="font-display text-2xl font-extrabold text-foreground">Check your email</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                If an account exists for <span className="font-medium text-foreground">{email}</span>, we've sent a link to
                reset your password. It expires shortly for your security.
              </p>
              <Link to="/login" className="mt-6 inline-block text-sm font-semibold text-primary hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h1 className="font-display text-2xl font-extrabold text-foreground">Reset your password</h1>
              <p className="mb-7 mt-1 text-sm text-muted-foreground">Enter your email and we'll send you a reset link.</p>
              <Field
                label="Email"
                htmlFor="email"
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <Button type="submit" disabled={request.isPending || !email} className="mt-6 w-full" size="lg">
                {request.isPending ? "Sending…" : <>Send reset link <ArrowRight size={17} /></>}
              </Button>
              <p className="mt-5 text-center text-sm text-muted-foreground">
                Remembered it?{" "}
                <Link to="/login" className="font-semibold text-primary hover:underline">Sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
