"""DRF permission backstops for the API layer.

Defense-in-depth: admin use cases already call `ensure_admin(actor)`, but wiring
an `IsAdminRole` permission onto every admin view means a forgotten domain check
can never silently expose an admin endpoint to an ordinary authenticated user.
"""
from rest_framework.permissions import BasePermission

from apps.common.enums import UserRole


class IsAdminRole(BasePermission):
    """Allow only authenticated users whose role is ADMIN."""

    message = "Admin access required."

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        return bool(
            user
            and user.is_authenticated
            and getattr(user, "role", None) == UserRole.ADMIN
        )
