"""Instructor public-profile use cases (permission boundary over the service)."""
from apps.accounts import services_instructor as svc
from application.permissions import ensure_admin, get_instructor_profile


# ── public (unauthenticated) ──────────────────────────────────────────────────
class ListPublicInstructorsUseCase:
    def execute(self) -> list:
        return svc.list_public_instructors()


class GetPublicInstructorUseCase:
    def execute(self, *, slug) -> dict:
        return svc.get_public_instructor(slug)


# ── teacher self-service ──────────────────────────────────────────────────────
class UpdatePublicProfileUseCase:
    def execute(self, *, actor, data) -> dict:
        return svc.update_public_profile(get_instructor_profile(actor), data)


class UpdatePublicSettingsUseCase:
    def execute(self, *, actor, data) -> dict:
        return svc.update_public_settings(get_instructor_profile(actor), data)


class ReplaceSocialLinksUseCase:
    def execute(self, *, actor, links) -> dict:
        return svc.replace_social_links(get_instructor_profile(actor), links)


class ReplaceEducationUseCase:
    def execute(self, *, actor, items) -> list:
        return svc.replace_education(get_instructor_profile(actor), items)


class ReplaceExperienceUseCase:
    def execute(self, *, actor, items) -> list:
        return svc.replace_experience(get_instructor_profile(actor), items)


class ReplaceCertificationsUseCase:
    def execute(self, *, actor, items) -> list:
        return svc.replace_certifications(get_instructor_profile(actor), items)


# ── admin controls ────────────────────────────────────────────────────────────
class ListAdminInstructorsUseCase:
    def execute(self, *, actor) -> list:
        ensure_admin(actor)
        return svc.list_all_instructors()


class SetInstructorApprovedUseCase:
    def execute(self, *, actor, instructor_id, approved) -> dict:
        ensure_admin(actor)
        return svc.set_approved(instructor_id, approved)


class SetInstructorFeaturedUseCase:
    def execute(self, *, actor, instructor_id, featured) -> dict:
        ensure_admin(actor)
        return svc.set_featured(instructor_id, featured)


class SetInstructorVisibilityUseCase:
    def execute(self, *, actor, instructor_id, show) -> dict:
        ensure_admin(actor)
        return svc.set_visibility(instructor_id, show)


class SetInstructorFoundingUseCase:
    def execute(self, *, actor, instructor_id, founding) -> dict:
        ensure_admin(actor)
        return svc.set_founding(instructor_id, founding)


class SetInstructorDisplayOrderUseCase:
    def execute(self, *, actor, instructor_id, order) -> dict:
        ensure_admin(actor)
        return svc.set_display_order(instructor_id, order)
