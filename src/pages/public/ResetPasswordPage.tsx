import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { Button } from "@/components/ui/button";
import { BrandPanel } from "@/components/marketing";
import { Field } from "@/components/forms";
import { useConfirmPasswordReset } from "@/hooks";
import { ApiError } from "@/api";

/** Shared by /reset-password (forgot flow) and /set-password (invite flow). Both
 * confirm a uid+token from the link and set a new password. */
export function ResetPasswordPage({ mode = "reset" }: { mode?: "reset" | "set" }) {
  const [params] = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const confirm = useConfirmPasswordReset();
  const done = confirm.isSuccess;
  const linkBad = !uid || !token;

  const isSet = mode === "set";
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkBad && password.length >= 8) confirm.mutate({ uid, token, newPassword: password });
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <BrandPanel
        badge={<><ShieldCheck size={13} /> {isSet ? "Welcome to OneClub" : "Secure reset"}</>}
        title={isSet ? "Set your password to get started." : "Choose a new password."}
        footnote={isSet ? "Your account is one step away." : "Pick something strong and memorable."}
      />
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo /></div>

          {done ? (
            <div className="text-center">
              <ShieldCheck size={40} className="mx-auto mb-3 text-emerald-500" />
              <h1 className="font-display text-2xl font-extrabold text-foreground">
                {isSet ? "Password set 🎉" : "Password updated"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                You can now sign in with your new password.
              </p>
              <Link to="/login" className="mt-6 inline-block">
                <Button size="lg">Go to sign in <ArrowRight size={17} /></Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h1 className="font-display text-2xl font-extrabold text-foreground">
                {isSet ? "Set your password" : "New password"}
              </h1>
              <p className="mb-7 mt-1 text-sm text-muted-foreground">
                {isSet
                  ? "Create a password to activate your account."
                  : "Enter a new password for your account."}
              </p>

              {linkBad ? (
                <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
                  This link is missing or invalid. Please request a new one from the{" "}
                  <Link to="/forgot-password" className="font-semibold underline">reset page</Link>.
                </p>
              ) : (
                <>
                  <Field
                    label="New password"
                    htmlFor="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    hint="At least 8 characters"
                  />
                  {confirm.isError && (
                    <p role="alert" className="mt-3 text-sm font-medium text-red-600">
                      {confirm.error instanceof ApiError
                        ? String(confirm.error.detail ?? confirm.error.message)
                        : "Could not set your password. The link may have expired."}
                    </p>
                  )}
                  <Button type="submit" disabled={confirm.isPending || password.length < 8} className="mt-6 w-full" size="lg">
                    {confirm.isPending ? "Saving…" : (
                      <><Lock size={16} /> {isSet ? "Set password" : "Update password"}</>
                    )}
                  </Button>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
