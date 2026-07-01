"""Account query use cases."""
from application import mappers
from application.permissions import _is_admin  # noqa: F401  (kept for symmetry)
from domain.dtos import UserProfileResult
from domain.exceptions import PermissionDenied


class GetCurrentUserProfileUseCase:
    """Return the authenticated actor's own profile (`/me`)."""

    def execute(self, *, actor) -> UserProfileResult:
        if actor is None:
            raise PermissionDenied()
        student = getattr(actor, "student_profile", None)
        instructor = getattr(actor, "instructor_profile", None)
        return mappers.user_profile(actor, student=student, instructor=instructor)
