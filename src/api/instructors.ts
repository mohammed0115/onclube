import { api } from "./client";
import type {
  OwnInstructorProfile,
  PublicInstructor,
  PublicInstructorProfile,
  InstructorEducationInput,
  InstructorExperienceInput,
  InstructorCertificationInput,
  InstructorSocialLinkInput,
} from "./types";

export const instructorsApi = {
  /** Public directory — approved, visible instructors (no auth required). */
  list(): Promise<PublicInstructor[]> {
    return api.get<PublicInstructor[]>("/instructors/", { auth: false });
  },
  /** Public profile by slug (no auth required). */
  bySlug(slug: string): Promise<PublicInstructorProfile> {
    return api.get<PublicInstructorProfile>(`/instructors/${encodeURIComponent(slug)}/`, { auth: false });
  },

  // ── teacher self-service (build your CV) ──
  ownProfile(): Promise<OwnInstructorProfile> {
    return api.get<OwnInstructorProfile>("/instructor/public-profile/");
  },
  updateProfile(data: Record<string, unknown>): Promise<OwnInstructorProfile> {
    return api.put<OwnInstructorProfile>("/instructor/public-profile/", data);
  },
  updateSettings(data: Record<string, boolean>): Promise<Record<string, boolean>> {
    return api.put("/instructor/public-settings/", data);
  },
  replaceSocial(links: InstructorSocialLinkInput[]): Promise<Record<string, string>> {
    return api.put("/instructor/social-links/", { links });
  },
  replaceEducation(items: InstructorEducationInput[]): Promise<unknown> {
    return api.put("/instructor/education/", { items });
  },
  replaceExperience(items: InstructorExperienceInput[]): Promise<unknown> {
    return api.put("/instructor/experience/", { items });
  },
  replaceCertifications(items: InstructorCertificationInput[]): Promise<unknown> {
    return api.put("/instructor/certifications/", { items });
  },
};
