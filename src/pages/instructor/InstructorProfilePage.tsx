import { useEffect, useState } from "react";
import { User, Check, Loader2, Lock, Sparkles } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms";
import { Textarea } from "@/components/ui/textarea";
import { Loading } from "@/components/states";
import { useInstructorProfile, useUpdateInstructorProfile, useChangePassword } from "@/hooks";
import type { InstructorProfile } from "@/api/types";
import { ApiError } from "@/api";
import { useI18n } from "@/i18n";

/** Instructor's own teaching profile — the public identity students see, plus a
 * password change. Covers scenarios 2 & 3 (profile + edit profile). */
export function InstructorProfilePage() {
  const { data, isLoading } = useInstructorProfile();
  return (
    <DashboardLayout>
      <PageHeader title="My profile" subtitle="This is what students see when they book you." />
      <div className="mx-auto max-w-2xl space-y-6">
        {isLoading || !data ? <Loading label="Loading your profile…" /> : <ProfileForm profile={data} />}
        <PasswordCard />
      </div>
    </DashboardLayout>
  );
}

function ProfileForm({ profile }: { profile: InstructorProfile }) {
  const update = useUpdateInstructorProfile();
  const { tx } = useI18n();
  const [form, setForm] = useState({
    fullName: profile.fullName,
    headline: profile.headline,
    bio: profile.bio,
    country: profile.country,
    specialty: profile.specialty,
    languages: profile.languages.join(", "),
    interests: profile.interests.join(", "),
    yearsExperience: String(profile.yearsExperience),
    avatarUrl: profile.avatarUrl,
    introVideoUrl: profile.introVideoUrl,
  });
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const csv = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

  const onSave = () => {
    setSaved(false);
    update.mutate(
      {
        fullName: form.fullName,
        headline: form.headline,
        bio: form.bio,
        country: form.country,
        specialty: form.specialty,
        languages: csv(form.languages),
        interests: csv(form.interests),
        yearsExperience: Number(form.yearsExperience) || 0,
        avatarUrl: form.avatarUrl,
        introVideoUrl: form.introVideoUrl,
      },
      { onSuccess: () => setSaved(true) }
    );
  };

  const initials = form.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-center gap-4">
        {form.avatarUrl ? (
          <img src={form.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-lg font-bold text-white">
            {initials || <User size={22} />}
          </div>
        )}
        <div>
          <div className="text-sm font-semibold text-foreground">{form.fullName || tx("Your name")}</div>
          <div className="text-xs text-muted-foreground">
            ⭐ {profile.rating.toFixed(1)} · {profile.sessionsHosted} sessions hosted
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tx("Full name")} htmlFor="fullName" value={form.fullName} onChange={set("fullName")} />
        <Field label={tx("Email")} htmlFor="email" value={profile.email} readOnly />
        <Field label={tx("Headline")} htmlFor="headline" value={form.headline} onChange={set("headline")} hint={tx("e.g. IELTS & Business English coach")} />
        <Field label={tx("Specialty")} htmlFor="specialty" value={form.specialty} onChange={set("specialty")} />
        <Field label={tx("Country")} htmlFor="country" value={form.country} onChange={set("country")} />
        <Field label={tx("Years of experience")} htmlFor="years" type="number" min={0} value={form.yearsExperience} onChange={set("yearsExperience")} />
        <Field label={tx("Languages")} htmlFor="languages" value={form.languages} onChange={set("languages")} hint={tx("Comma-separated, e.g. English, Arabic")} />
        <Field label={tx("Interests")} htmlFor="interests" value={form.interests} onChange={set("interests")} hint={tx("Comma-separated")} />
        <div className="sm:col-span-2">
          <Field label={tx("Bio")} htmlFor="bio">
            <Textarea id="bio" rows={4} value={form.bio} onChange={set("bio")} placeholder={tx("Tell students about your teaching style…")} />
          </Field>
        </div>
        <Field label={tx("Avatar image URL")} htmlFor="avatarUrl" value={form.avatarUrl} onChange={set("avatarUrl")} />
        <Field label={tx("Intro video URL (optional)")} htmlFor="introVideoUrl" value={form.introVideoUrl} onChange={set("introVideoUrl")} />
      </div>

      {update.isError && (
        <p className="mt-4 text-sm text-red-600">
          {update.error instanceof ApiError ? String(update.error.detail ?? update.error.message) : tx("Could not save.")}
        </p>
      )}
      <div className="mt-5 flex items-center gap-3">
        <Button onClick={onSave} disabled={update.isPending}>
          {update.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {tx("Save profile")}
        </Button>
        {saved && !update.isPending && <span className="text-sm text-emerald-600">{tx("Saved ✓")}</span>}
      </div>
    </Card>
  );
}

function PasswordCard() {
  const change = useChangePassword();
  const { tx } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (change.isSuccess) {
      setDone(true);
      setCurrent("");
      setNext("");
    }
  }, [change.isSuccess]);

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Lock size={16} className="text-indigo-600" /> {tx("Change password")}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tx("Current password")} htmlFor="current" type="password" value={current} onChange={(e) => { setCurrent(e.target.value); setDone(false); }} />
        <Field label={tx("New password")} htmlFor="next" type="password" value={next} onChange={(e) => { setNext(e.target.value); setDone(false); }} hint={tx("At least 8 characters")} />
      </div>
      {change.isError && (
        <p className="mt-3 text-sm text-red-600">
          {change.error instanceof ApiError ? String(change.error.detail ?? change.error.message) : tx("Could not change password.")}
        </p>
      )}
      <div className="mt-4 flex items-center gap-3">
        <Button variant="soft" onClick={() => change.mutate({ currentPassword: current, newPassword: next })} disabled={change.isPending || !current || next.length < 8}>
          {change.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {tx("Update password")}
        </Button>
        {done && <span className="text-sm text-emerald-600">{tx("Password updated ✓")}</span>}
      </div>
    </Card>
  );
}
