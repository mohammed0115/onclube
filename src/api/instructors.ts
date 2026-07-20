import { api } from "./client";
import type {
  AdminInstructor,
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

  // ── admin controls ──
  adminList(): Promise<AdminInstructor[]> {
    return api.get<AdminInstructor[]>("/admin/instructors/");
  },
  adminApprove(id: string, approved: boolean): Promise<AdminInstructor> {
    return api.patch<AdminInstructor>(`/admin/instructors/${id}/approve/`, { approved });
  },
  adminFeature(id: string, featured: boolean): Promise<AdminInstructor> {
    return api.patch<AdminInstructor>(`/admin/instructors/${id}/feature/`, { featured });
  },
  adminVisibility(id: string, showOnLanding: boolean): Promise<AdminInstructor> {
    return api.patch<AdminInstructor>(`/admin/instructors/${id}/visibility/`, { showOnLanding });
  },
  adminFounding(id: string, founding: boolean): Promise<AdminInstructor> {
    return api.patch<AdminInstructor>(`/admin/instructors/${id}/founding/`, { founding });
  },
  adminDisplayOrder(id: string, displayOrder: number): Promise<AdminInstructor> {
    return api.patch<AdminInstructor>(`/admin/instructors/${id}/display-order/`, { displayOrder });
  },
};
