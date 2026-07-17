"""Admin command use cases — user management, fully audited (append-only log)."""
from apps.accounts.models import InstructorProfile, StudentProfile, User
from apps.admin_ops.models import AdminAction
from apps.common.enums import AdminActionType, UserRole, UserStatus
from apps.common.exceptions import BusinessRuleError
from application.permissions import ensure_admin


def _audit(admin, action_type, user, before, after):
    AdminAction.objects.create(
        admin=admin,
        action_type=action_type,
        target_table=User._meta.db_table,
        target_id=user.pk,
        reason=f"{before} → {after}",
        metadata={"before": str(before), "after": str(after), "email": user.email},
    )


class SetUserStatusUseCase:
    """Activate or suspend a user."""

    def execute(self, *, actor, user_id, status):
        ensure_admin(actor)
        if status not in (UserStatus.ACTIVE, UserStatus.SUSPENDED):
            raise BusinessRuleError("Invalid status.", code="invalid_status")
        user = User.objects.filter(pk=user_id).first()
        if user is None:
            raise BusinessRuleError("User not found.", code="user_not_found")
        before = user.status
        user.status = status
        user.is_active = status == UserStatus.ACTIVE
        user.save(update_fields=["status", "is_active", "updated_at"])
        _audit(actor, AdminActionType.USER_STATUS_CHANGED, user, before, status)
        return {"userId": str(user.pk), "status": user.status}


class ChangeUserRoleUseCase:
    """Change a user's role (provisions the matching profile)."""

    def execute(self, *, actor, user_id, role):
        ensure_admin(actor)
        if role not in (UserRole.STUDENT, UserRole.INSTRUCTOR, UserRole.ADMIN):
            raise BusinessRuleError("Invalid role.", code="invalid_role")
        user = User.objects.filter(pk=user_id).first()
        if user is None:
            raise BusinessRuleError("User not found.", code="user_not_found")
        if user.pk == actor.pk:
            raise BusinessRuleError("You cannot change your own role.", code="cannot_change_self")
        before = user.role
        user.role = role
        user.save(update_fields=["role", "updated_at"])
        if role == UserRole.STUDENT:
            StudentProfile.objects.get_or_create(user=user)
        elif role == UserRole.INSTRUCTOR:
            initials = "".join(w[0] for w in (user.full_name or "IN").split()[:2]).upper() or "IN"
            InstructorProfile.objects.get_or_create(user=user, defaults={"initials": initials})
        _audit(actor, AdminActionType.USER_ROLE_CHANGED, user, before, role)
        return {"userId": str(user.pk), "role": user.role}
