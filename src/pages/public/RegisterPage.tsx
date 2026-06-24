import { Link, useNavigate } from "react-router";
import { ArrowRight, CheckCircle, Mic } from "lucide-react";
import { Logo } from "@/components/navigation/Logo";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms";

const PERKS = [
  "Free AI placement test to find your level",
  "Discussion questions before every session",
  "An AI session report after every session",
];

export function RegisterPage() {
  const navigate = useNavigate();
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#08081A] p-10 lg:flex">
        <div className="pointer-events-none absolute -right-20 top-10 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
        <Logo light />
        <div className="relative z-10">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/15 px-4 py-2 text-sm text-indigo-300">
            <Mic size={13} /> Speak more, study less
          </div>
          <h2 className="font-display text-3xl font-extrabold leading-tight text-white">
            Join English Club and start practising with real instructors.
          </h2>
          <div className="mt-8 space-y-3">
            {PERKS.map((p) => (
              <div key={p} className="flex items-center gap-3 text-sm text-gray-300">
                <CheckCircle size={16} className="text-emerald-400" /> {p}
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-xs text-gray-600">Prototype — no real account is created.</p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Create your account</h1>
          <p className="mb-7 mt-1 text-sm text-muted-foreground">It takes less than a minute.</p>

          <div className="space-y-4">
            <Field label="Full name" htmlFor="name" placeholder="Mohammed Kamal" />
            <Field label="Email" htmlFor="email" type="email" placeholder="you@email.com" />
            <Field label="Password" htmlFor="password" type="password" placeholder="••••••••" />
          </div>

          <Button onClick={() => navigate("/onboarding/goal")} className="mt-7 w-full" size="lg">
            Create account <ArrowRight size={17} />
          </Button>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Already a member?{" "}
            <Link to="/login" className="font-semibold text-indigo-600 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
