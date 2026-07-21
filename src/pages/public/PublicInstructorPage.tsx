import { useEffect } from "react";
import { Link, useParams } from "react-router";
import {
  Star,
  Award,
  BadgeCheck,
  MapPin,
  GraduationCap,
  Briefcase,
  ScrollText,
  Languages,
  ArrowRight,
  Linkedin,
  Facebook,
  Github,
  Instagram,
  Youtube,
  Twitter,
  Globe,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Button } from "@/components/ui/button";
import { Loading, ErrorState } from "@/components/states";
import { usePublicInstructor } from "@/hooks";
import { initialsOf, accentFor } from "@/lib/instructor";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

const SOCIAL_ICON: Record<string, LucideIcon> = {
  linkedin: Linkedin,
  facebook: Facebook,
  github: Github,
  instagram: Instagram,
  youtube: Youtube,
  x: Twitter,
  tiktok: Globe,
  website: Globe,
};

export function PublicInstructorPage() {
  const { tx } = useI18n();
  const { slug = "" } = useParams();
  const { data: p, isLoading, isError, error, refetch } = usePublicInstructor(slug);

  useEffect(() => {
    if (p) document.title = `${p.fullName}${p.jobTitle ? " · " + p.jobTitle : ""} — OneClup`;
  }, [p]);

  return (
    <div className="min-h-screen bg-surface-2 font-display">
      <MarketingNav />
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-24">
        <Link to="/#instructors" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={15} /> {tx("All instructors")}
        </Link>

        {isLoading && <Loading label="Loading profile…" />}
        {isError && <ErrorState error={error} onRetry={() => refetch()} />}

        {p && (
          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            {/* Cover */}
            <div
              className={cn("h-36 w-full bg-gradient-to-r", p.coverPhotoUrl ? "" : accentFor(p.slug ?? p.id))}
              style={p.coverPhotoUrl ? { backgroundImage: `url(${p.coverPhotoUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
            />
            <div className="px-6 pb-8 sm:px-8">
              {/* Avatar + header */}
              <div className="-mt-12 flex flex-col items-center text-center sm:-mt-14 sm:flex-row sm:items-end sm:text-left">
                {p.avatarUrl ? (
                  <img src={p.avatarUrl} alt={p.fullName} className="h-24 w-24 rounded-2xl border-4 border-card object-cover shadow-md sm:h-28 sm:w-28" />
                ) : (
                  <div className={cn("flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-card bg-gradient-to-br text-3xl font-bold text-white shadow-md sm:h-28 sm:w-28", accentFor(p.slug ?? p.id))}>
                    {initialsOf(p.fullName)}
                  </div>
                )}
                <div className="mt-3 flex-1 sm:mb-1 sm:ml-5 sm:mt-0">
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <h1 className="font-display text-2xl font-extrabold text-foreground">{p.fullName}</h1>
                    {p.verified && <BadgeCheck size={20} className="fill-blue-100 text-blue-500" />}
                    {p.foundingInstructor && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                        <Award size={12} /> {tx("Founding Instructor")}
                      </span>
                    )}
                  </div>
                  {p.jobTitle && <div className="mt-0.5 text-sm font-semibold text-primary">{p.jobTitle}</div>}
                  {p.headline && <p className="mt-1 text-sm text-muted-foreground">{p.headline}</p>}
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground sm:justify-start">
                    {(p.city || p.country) && (
                      <span className="inline-flex items-center gap-1"><MapPin size={13} /> {[p.city, p.country].filter(Boolean).join(", ")} {p.flag}</span>
                    )}
                    <span className="inline-flex items-center gap-1"><Star size={13} className="fill-amber-400 text-amber-400" /> {p.rating.toFixed(1)}</span>
                    <span>{p.stats.totalSessions} {tx("sessions")}</span>
                    {p.yearsExperience > 0 && <span>{p.yearsExperience}+ {tx("years")}</span>}
                  </div>
                </div>
                <Button asChild className="mt-4 sm:mt-0">
                  <Link to="/register">{tx("Book Session")} <ArrowRight size={16} /></Link>
                </Button>
              </div>

              {/* Social links */}
              {Object.keys(p.socialLinks).length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {Object.entries(p.socialLinks).map(([platform, url]) => {
                    const Icon = SOCIAL_ICON[platform] ?? Globe;
                    return (
                      <a key={platform} href={url} target="_blank" rel="noreferrer"
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-indigo-200 hover:text-indigo-600"
                        aria-label={platform}>
                        <Icon size={16} />
                      </a>
                    );
                  })}
                </div>
              )}

              {/* Bio */}
              {p.bio && <p className="mt-6 text-sm leading-relaxed text-slate-700">{p.bio}</p>}

              {/* Available for */}
              {(p.availableFor.ielts || p.availableFor.business || p.availableFor.conversation) && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {p.availableFor.ielts && <Tag>{tx("IELTS")}</Tag>}
                  {p.availableFor.business && <Tag>{tx("Business English")}</Tag>}
                  {p.availableFor.conversation && <Tag>{tx("Conversation")}</Tag>}
                </div>
              )}

              {/* Languages */}
              {p.languages.length > 0 && (
                <ProfileSection icon={<Languages size={16} />} title={tx("Languages")}>
                  <div className="flex flex-wrap gap-2">
                    {p.languages.map((l) => <Tag key={l}>{l}</Tag>)}
                  </div>
                </ProfileSection>
              )}

              {/* Experience */}
              {p.experience.length > 0 && (
                <ProfileSection icon={<Briefcase size={16} />} title={tx("Experience")}>
                  <div className="space-y-4">
                    {p.experience.map((x, i) => (
                      <div key={i} className="border-l-2 border-indigo-100 pl-4">
                        <div className="text-sm font-semibold text-foreground">{x.position}</div>
                        <div className="text-xs text-muted-foreground">{x.company} · {x.from}{x.to ? ` – ${x.to}` : ""}</div>
                        {x.description && <p className="mt-1 text-sm text-slate-600">{x.description}</p>}
                      </div>
                    ))}
                  </div>
                </ProfileSection>
              )}

              {/* Education */}
              {p.education.length > 0 && (
                <ProfileSection icon={<GraduationCap size={16} />} title={tx("Education")}>
                  <div className="space-y-3">
                    {p.education.map((e, i) => (
                      <div key={i}>
                        <div className="text-sm font-semibold text-foreground">{e.degree}</div>
                        <div className="text-xs text-muted-foreground">
                          {e.institution}{e.country ? `, ${e.country}` : ""}
                          {e.startYear || e.endYear ? ` · ${e.startYear ?? ""}–${e.endYear ?? ""}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                </ProfileSection>
              )}

              {/* Certifications */}
              {p.certifications.length > 0 && (
                <ProfileSection icon={<ScrollText size={16} />} title={tx("Certifications")}>
                  <div className="flex flex-wrap gap-2">
                    {p.certifications.map((c, i) => (
                      <a
                        key={i}
                        href={c.credentialUrl || undefined}
                        target={c.credentialUrl ? "_blank" : undefined}
                        rel="noreferrer"
                        className={cn("rounded-xl border border-border px-3 py-2 text-sm", c.credentialUrl && "hover:border-indigo-200 hover:text-indigo-600")}
                      >
                        <span className="font-semibold text-foreground">{c.title}</span>
                        {(c.issuer || c.issueDate) && (
                          <span className="ml-1 text-xs text-muted-foreground">· {[c.issuer, c.issueDate].filter(Boolean).join(" ")}</span>
                        )}
                      </a>
                    ))}
                  </div>
                </ProfileSection>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">{children}</span>;
}

function ProfileSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-7">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
        <span className="text-indigo-600">{icon}</span> {title}
      </div>
      {children}
    </div>
  );
}
