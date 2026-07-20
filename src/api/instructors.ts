import { api } from "./client";
import type { PublicInstructor, PublicInstructorProfile } from "./types";

export const instructorsApi = {
  /** Public directory — approved, visible instructors (no auth required). */
  list(): Promise<PublicInstructor[]> {
    return api.get<PublicInstructor[]>("/instructors/", { auth: false });
  },
  /** Public profile by slug (no auth required). */
  bySlug(slug: string): Promise<PublicInstructorProfile> {
    return api.get<PublicInstructorProfile>(`/instructors/${encodeURIComponent(slug)}/`, { auth: false });
  },
};
