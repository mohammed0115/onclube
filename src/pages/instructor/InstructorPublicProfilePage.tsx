import { useState } from "react";
import { Link } from "react-router";
import {
  Check, Loader2, Plus, Trash2, ExternalLink, User, Briefcase, GraduationCap,
  ScrollText, Link2, Settings2, Clock,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loading } from "@/components/states";
import {
  useOwnPublicProfile, useUpdatePublicProfile, useUpdatePublicSettings,
  useReplaceSocialLinks, useReplaceEducation, useReplaceExperience, useReplaceCertifications,
} from "@/hooks";
import type { OwnInstructorProfile } from "@/api/types";
import { useI18n } from "@/i18n";

const SOCIALS = ["linkedin", "facebook", "x", "instagram", "youtube", "tiktok", "github", "website"];
const SOCIAL_LABEL: Record<string, string> = {
  linkedin: "LinkedIn", facebook: "Facebook", x: "X (Twitter)", instagram: "Instagram",
  youtube: "YouTube", tiktok: "TikTok", github: "GitHub", website: "Website",
};

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
      {label}
      {children}
    </label>
  );
}
const inputCls = "rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-300";

function SaveBar({ onSave, pending, saved }: { onSave: () => void; pending: boolean; saved: boolean }) {
  const { tx } = useI18n();
  return (
    <div className="mt-4 flex items-center gap-3">
      <Button size="sm" onClick={onSave} disabled={pending}>
        {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {tx("Save")}
      </Button>
      {saved && <span className="text-xs font-medium text-emerald-600">{tx("Saved ✓")}</span>}
    </div>
  );
}

export function InstructorPublicProfilePage() {
  const { tx } = useI18n();
  const { data, isLoading } = useOwnPublicProfile();
  return (
    <DashboardLayout>
      <PageHeader
        title="Build your profile"
        subtitle="Create your public CV — students see this on your instructor page."
        action={
          data?.publicUrl && data.profileApproved ? (
            <Button asChild variant="soft" size="sm">
              <Link to={data.publicUrl} target="_blank">{tx("View public profile")} <ExternalLink size={14} /></Link>
            </Button>
          ) : undefined
        }
      />
      {isLoading || !data ? (
        <Loading label="Loading your profile…" />
      ) : (
        <div className="mx-auto max-w-3xl space-y-6">
          {!data.profileApproved && (
            <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Clock size={16} /> {tx("Your public profile is pending admin approval. You can keep editing it meanwhile.")}
            </div>
          )}
          <PersonalCard profile={data} />
          <SettingsCard profile={data} />
          <ExperienceCard profile={data} />
          <EducationCard profile={data} />
          <CertificationsCard profile={data} />
          <SocialCard profile={data} />
        </div>
      )}
    </DashboardLayout>
  );
}

// ── Personal & professional ─────────────────────────────────────────────────────
function PersonalCard({ profile }: { profile: OwnInstructorProfile }) {
  const { tx } = useI18n();
  const update = useUpdatePublicProfile();
  const [saved, setSaved] = useState(false);
  const [f, setF] = useState({
    jobTitle: profile.jobTitle ?? "", headline: profile.headline ?? "", bio: profile.bio ?? "",
    country: profile.country ?? "", city: profile.city ?? "", nationality: profile.nationality ?? "",
    specialization: profile.specialization ?? "", yearsExperience: String(profile.yearsExperience ?? 0),
    languages: (profile.languages ?? []).join(", "), avatarUrl: profile.avatarUrl ?? "", coverPhotoUrl: profile.coverPhotoUrl ?? "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setSaved(false); setF((s) => ({ ...s, [k]: e.target.value })); };
  const save = () => update.mutate(
    { ...f, yearsExperience: Number(f.yearsExperience) || 0, languages: f.languages.split(",").map((s) => s.trim()).filter(Boolean) },
    { onSuccess: () => setSaved(true) }
  );
  return (
    <Card className="p-6">
      <SectionTitle icon={<User size={16} />} title={tx("Personal & professional")} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Labeled label={tx("Job title")}><input className={inputCls} value={f.jobTitle} onChange={set("jobTitle")} placeholder="IELTS Instructor" /></Labeled>
        <Labeled label={tx("Specialization")}><input className={inputCls} value={f.specialization} onChange={set("specialization")} /></Labeled>
        <div className="sm:col-span-2"><Labeled label={tx("Headline")}><input className={inputCls} value={f.headline} onChange={set("headline")} placeholder="Speak with confidence" /></Labeled></div>
        <div className="sm:col-span-2"><Labeled label={tx("Biography")}><Textarea rows={4} value={f.bio} onChange={set("bio")} /></Labeled></div>
        <Labeled label={tx("Country")}><input className={inputCls} value={f.country} onChange={set("country")} /></Labeled>
        <Labeled label={tx("City")}><input className={inputCls} value={f.city} onChange={set("city")} /></Labeled>
        <Labeled label={tx("Nationality")}><input className={inputCls} value={f.nationality} onChange={set("nationality")} /></Labeled>
        <Labeled label={tx("Years of experience")}><input className={inputCls} type="number" min={0} value={f.yearsExperience} onChange={set("yearsExperience")} /></Labeled>
        <div className="sm:col-span-2"><Labeled label={tx("Languages (comma separated)")}><input className={inputCls} value={f.languages} onChange={set("languages")} placeholder="Arabic, English" /></Labeled></div>
        <Labeled label={tx("Photo URL")}><input className={inputCls} value={f.avatarUrl} onChange={set("avatarUrl")} placeholder="https://…" /></Labeled>
        <Labeled label={tx("Cover photo URL")}><input className={inputCls} value={f.coverPhotoUrl} onChange={set("coverPhotoUrl")} placeholder="https://…" /></Labeled>
      </div>
      <SaveBar onSave={save} pending={update.isPending} saved={saved} />
    </Card>
  );
}

// ── Public settings ─────────────────────────────────────────────────────────────
function SettingsCard({ profile }: { profile: OwnInstructorProfile }) {
  const { tx } = useI18n();
  const update = useUpdatePublicSettings();
  const [saved, setSaved] = useState(false);
  const [s, setS] = useState(profile.settings);
  const toggle = (k: keyof typeof s) => (v: boolean) => { setSaved(false); setS((p) => ({ ...p, [k]: v })); };
  const rows: [keyof typeof s, string][] = [
    ["showOnLanding", tx("Show me on the landing page")],
    ["acceptStudents", tx("Accepting new students")],
    ["availableForIelts", tx("Available for IELTS")],
    ["availableForBusiness", tx("Available for Business English")],
    ["availableForConversation", tx("Available for Conversation practice")],
  ];
  return (
    <Card className="p-6">
      <SectionTitle icon={<Settings2 size={16} />} title={tx("Public settings")} />
      <div className="space-y-2.5">
        {rows.map(([k, label]) => (
          <div key={k} className="flex items-center justify-between rounded-xl border border-border px-4 py-2.5">
            <span className="text-sm text-foreground">{label}</span>
            <Switch checked={s[k]} onCheckedChange={toggle(k)} />
          </div>
        ))}
      </div>
      <SaveBar onSave={() => update.mutate(s, { onSuccess: () => setSaved(true) })} pending={update.isPending} saved={saved} />
    </Card>
  );
}

// ── Repeatable list helper ──────────────────────────────────────────────────────
function useRepeatable<T>(initial: T[], blank: T) {
  const [items, setItems] = useState<T[]>(initial);
  const [saved, setSaved] = useState(false);
  const add = () => { setSaved(false); setItems((x) => [...x, { ...blank }]); };
  const remove = (i: number) => { setSaved(false); setItems((x) => x.filter((_, j) => j !== i)); };
  const patch = (i: number, key: keyof T, value: unknown) => {
    setSaved(false);
    setItems((x) => x.map((it, j) => (j === i ? { ...it, [key]: value } : it)));
  };
  return { items, add, remove, patch, saved, setSaved };
}

function SectionTitle({ icon, title, onAdd }: { icon: React.ReactNode; title: string; onAdd?: () => void }) {
  const { tx } = useI18n();
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm font-bold text-foreground"><span className="text-indigo-600">{icon}</span> {title}</div>
      {onAdd && (
        <button onClick={onAdd} className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">
          <Plus size={13} /> {tx("Add")}
        </button>
      )}
    </div>
  );
}

function RowShell({ onRemove, children }: { onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl border border-border p-4 pr-10">
      {children}
      <button onClick={onRemove} className="absolute right-2 top-2 rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600" aria-label="Remove">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function ExperienceCard({ profile }: { profile: OwnInstructorProfile }) {
  const { tx } = useI18n();
  const r = useRepeatable(profile.experience, { company: "", position: "", description: "", from: "", to: "" });
  const save = useReplaceExperience();
  return (
    <Card className="p-6">
      <SectionTitle icon={<Briefcase size={16} />} title={tx("Experience")} onAdd={r.add} />
      <div className="space-y-3">
        {r.items.map((x, i) => (
          <RowShell key={i} onRemove={() => r.remove(i)}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input className={inputCls} placeholder={tx("Position")} value={x.position} onChange={(e) => r.patch(i, "position", e.target.value)} />
              <input className={inputCls} placeholder={tx("Company")} value={x.company} onChange={(e) => r.patch(i, "company", e.target.value)} />
              <input className={inputCls} placeholder={tx("From (e.g. Mar 2018)")} value={x.from} onChange={(e) => r.patch(i, "from", e.target.value)} />
              <input className={inputCls} placeholder={tx("To (or Present)")} value={x.to} onChange={(e) => r.patch(i, "to", e.target.value)} />
              <div className="sm:col-span-2"><Textarea rows={2} placeholder={tx("Description")} value={x.description} onChange={(e) => r.patch(i, "description", e.target.value)} /></div>
            </div>
          </RowShell>
        ))}
        {r.items.length === 0 && <p className="text-sm text-muted-foreground">{tx("No experience added yet.")}</p>}
      </div>
      <SaveBar onSave={() => save.mutate(r.items, { onSuccess: () => r.setSaved(true) })} pending={save.isPending} saved={r.saved} />
    </Card>
  );
}

function EducationCard({ profile }: { profile: OwnInstructorProfile }) {
  const { tx } = useI18n();
  const r = useRepeatable(
    profile.education.map((e) => ({ ...e, startYear: e.startYear ?? undefined, endYear: e.endYear ?? undefined })),
    { degree: "", institution: "", country: "", startYear: undefined as number | undefined, endYear: undefined as number | undefined }
  );
  const save = useReplaceEducation();
  return (
    <Card className="p-6">
      <SectionTitle icon={<GraduationCap size={16} />} title={tx("Education")} onAdd={r.add} />
      <div className="space-y-3">
        {r.items.map((e, i) => (
          <RowShell key={i} onRemove={() => r.remove(i)}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input className={inputCls} placeholder={tx("Degree")} value={e.degree} onChange={(ev) => r.patch(i, "degree", ev.target.value)} />
              <input className={inputCls} placeholder={tx("Institution")} value={e.institution} onChange={(ev) => r.patch(i, "institution", ev.target.value)} />
              <input className={inputCls} placeholder={tx("Country")} value={e.country} onChange={(ev) => r.patch(i, "country", ev.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} type="number" placeholder={tx("Start year")} value={e.startYear ?? ""} onChange={(ev) => r.patch(i, "startYear", ev.target.value ? Number(ev.target.value) : undefined)} />
                <input className={inputCls} type="number" placeholder={tx("End year")} value={e.endYear ?? ""} onChange={(ev) => r.patch(i, "endYear", ev.target.value ? Number(ev.target.value) : undefined)} />
              </div>
            </div>
          </RowShell>
        ))}
        {r.items.length === 0 && <p className="text-sm text-muted-foreground">{tx("No education added yet.")}</p>}
      </div>
      <SaveBar onSave={() => save.mutate(r.items, { onSuccess: () => r.setSaved(true) })} pending={save.isPending} saved={r.saved} />
    </Card>
  );
}

function CertificationsCard({ profile }: { profile: OwnInstructorProfile }) {
  const { tx } = useI18n();
  const r = useRepeatable(profile.certifications, { title: "", issuer: "", issueDate: "", credentialUrl: "" });
  const save = useReplaceCertifications();
  return (
    <Card className="p-6">
      <SectionTitle icon={<ScrollText size={16} />} title={tx("Certifications")} onAdd={r.add} />
      <div className="space-y-3">
        {r.items.map((c, i) => (
          <RowShell key={i} onRemove={() => r.remove(i)}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input className={inputCls} placeholder={tx("Title (e.g. CELTA)")} value={c.title} onChange={(e) => r.patch(i, "title", e.target.value)} />
              <input className={inputCls} placeholder={tx("Issuer")} value={c.issuer} onChange={(e) => r.patch(i, "issuer", e.target.value)} />
              <input className={inputCls} placeholder={tx("Issue date")} value={c.issueDate} onChange={(e) => r.patch(i, "issueDate", e.target.value)} />
              <input className={inputCls} placeholder={tx("Credential URL")} value={c.credentialUrl} onChange={(e) => r.patch(i, "credentialUrl", e.target.value)} />
            </div>
          </RowShell>
        ))}
        {r.items.length === 0 && <p className="text-sm text-muted-foreground">{tx("No certifications added yet.")}</p>}
      </div>
      <SaveBar onSave={() => save.mutate(r.items, { onSuccess: () => r.setSaved(true) })} pending={save.isPending} saved={r.saved} />
    </Card>
  );
}

function SocialCard({ profile }: { profile: OwnInstructorProfile }) {
  const { tx } = useI18n();
  const save = useReplaceSocialLinks();
  const [saved, setSaved] = useState(false);
  const [links, setLinks] = useState<Record<string, string>>(() => ({ ...profile.socialLinks }));
  const set = (p: string, v: string) => { setSaved(false); setLinks((s) => ({ ...s, [p]: v })); };
  const onSave = () => {
    const payload = SOCIALS.map((p) => ({ platform: p, url: (links[p] ?? "").trim() })).filter((x) => x.url);
    save.mutate(payload, { onSuccess: () => setSaved(true) });
  };
  return (
    <Card className="p-6">
      <SectionTitle icon={<Link2 size={16} />} title={tx("Social links")} />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {SOCIALS.map((p) => (
          <Labeled key={p} label={SOCIAL_LABEL[p]}>
            <input className={inputCls} value={links[p] ?? ""} onChange={(e) => set(p, e.target.value)} placeholder="https://…" />
          </Labeled>
        ))}
      </div>
      <SaveBar onSave={onSave} pending={save.isPending} saved={saved} />
    </Card>
  );
}
