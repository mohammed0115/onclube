import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { Button } from "@/components/ui/button";
import { BrandPanel } from "@/components/marketing";
import { Field } from "@/components/forms";
import { useConfirmPasswordReset } from "@/hooks";
import { ApiError } from "@/api";
import { useI18n } from "@/i18n";

/** Shared by /reset-password (forgot flow) and /set-password (invite flow). Both
 * confirm a uid+token from the link and set a new password. */
export function ResetPasswordPage({ mode = "reset" }: { mode?: "reset" | "set" }) {
  const { tx } = useI18n();
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
        badge={<><ShieldCheck size={13} /> {isSet ? tx("Welcome to OneClup") : tx("Secure reset")}</>}
        title={isSet ? tx("Set your password to get started.") : tx("Choose a new password.")}
        footnote={isSet ? tx("Your account is one step away.") : tx("Pick something strong and memorable.")}
      />
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo /></div>

          {done ? (
            <div className="text-center">
              <ShieldCheck size={40} className="mx-auto mb-3 text-emerald-500" />
              <h1 className="font-display text-2xl font-extrabold text-foreground">
                {isSet ? tx("Password set 🎉") : tx("Password updated")}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {tx("You can now sign in with your new password.")}
              </p>
              <Link to="/login" className="mt-6 inline-block">
                <Button size="lg">{tx("Go to sign in")} <ArrowRight size={17} /></Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h1 className="font-display text-2xl font-extrabold text-foreground">
                {isSet ? tx("Set your password") : tx("New password")}
              </h1>
              <p className="mb-7 mt-1 text-sm text-muted-foreground">
                {isSet
                  ? tx("Create a password to activate your account.")
                  : tx("Enter a new password for your account.")}
              </p>

              {linkBad ? (
                <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
                  {tx("This link is missing or invalid. Please request a new one from the")}{" "}
                  <Link to="/forgot-password" className="font-semibold underline">{tx("reset page")}</Link>.
                </p>
              ) : (
                <>
                  <Field
                    label={tx("New password")}
                    htmlFor="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    hint={tx("At least 8 characters")}
                  />
                  {confirm.isError && (
                    <p role="alert" className="mt-3 text-sm font-medium text-red-600">
                      {confirm.error instanceof ApiError
                        ? String(confirm.error.detail ?? confirm.error.message)
                        : tx("Could not set your password. The link may have expired.")}
                    </p>
                  )}
                  <Button type="submit" disabled={confirm.isPending || password.length < 8} className="mt-6 w-full" size="lg">
                    {confirm.isPending ? tx("Saving…") : (
                      <><Lock size={16} /> {isSet ? tx("Set password") : tx("Update password")}</>
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
