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


# ── Plans (Phase 9) — catalogue management, fully audited ────────────────────
from decimal import Decimal, InvalidOperation

from apps.billing.models import Plan


def _audit_plan(admin, action_type, plan, reason, extra=None):
    AdminAction.objects.create(
        admin=admin,
        action_type=action_type,
        target_table=Plan._meta.db_table,
        target_id=plan.pk,
        reason=reason,
        metadata={"code": plan.code, "name": plan.name, **(extra or {})},
    )


_PLAN_FIELDS = (
    "name", "emoji", "price", "currency", "cadence", "billing_period_days",
    "description", "sessions_per_month", "features", "recommended", "active",
)


def _coerce_price(value):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError):
        raise BusinessRuleError("Invalid price.", code="invalid_price")


class ListPlansAdminUseCase:
    """All plans (active AND inactive) for the admin catalogue."""

    def execute(self, *, actor):
        ensure_admin(actor)
        return list(Plan.objects.order_by("-active", "price"))


class CreatePlanUseCase:
    def execute(self, *, actor, data):
        ensure_admin(actor)
        code = (data.get("code") or "").strip()
        if not code:
            raise BusinessRuleError("Plan code is required.", code="plan_code_required")
        if Plan.objects.filter(code=code).exists():
            raise BusinessRuleError("A plan with this code already exists.", code="plan_code_taken")
        plan = Plan.objects.create(
            code=code,
            name=(data.get("name") or "").strip() or code,
            emoji=data.get("emoji") or None,
            price=_coerce_price(data.get("price", 0)),
            currency=(data.get("currency") or "SDG").strip(),
            cadence=data.get("cadence") or "/ month",
            billing_period_days=int(data.get("billing_period_days") or 30),
            description=data.get("description") or None,
            sessions_per_month=int(data.get("sessions_per_month") or 0),
            features=data.get("features") or [],
            recommended=bool(data.get("recommended", False)),
            active=bool(data.get("active", True)),
        )
        _audit_plan(actor, AdminActionType.PLAN_CREATED, plan, f"created plan {plan.code}")
        return plan


class UpdatePlanUseCase:
    """Edit a plan in place. Price changes never touch historical subscriptions
    (a subscription stores its own state); plans are disabled, never deleted."""

    def execute(self, *, actor, plan_id, data):
        ensure_admin(actor)
        plan = Plan.objects.filter(pk=plan_id).first()
        if plan is None:
            raise BusinessRuleError("Plan not found.", code="plan_not_found")
        changed = []
        for field in _PLAN_FIELDS:
            if field not in data or data[field] is None:
                continue
            value = data[field]
            if field == "price":
                value = _coerce_price(value)
            if getattr(plan, field) != value:
                changed.append(field)
                setattr(plan, field, value)
        if changed:
            plan.save(update_fields=[*changed, "updated_at"])
            _audit_plan(actor, AdminActionType.PLAN_UPDATED, plan, f"updated {', '.join(changed)}",
                        extra={"changed": changed})
        return plan


class GetGroupCapacityUseCase:
    """Admin: read the current group-session capacity (students per slot)."""

    def execute(self, *, actor) -> dict:
        from apps.scheduling.models import PlatformSettings

        ensure_admin(actor)
        return {"groupCapacity": PlatformSettings.current().group_capacity}


class SetGroupCapacityUseCase:
    """Admin: set how many students may share one instructor+time slot."""

    def execute(self, *, actor, capacity) -> dict:
        from django.db.models import Count
        from apps.scheduling.models import Booking, PlatformSettings
        from apps.common.enums import BookingStatus

        ensure_admin(actor)
        capacity = int(capacity)
        if capacity < 1:
            from apps.common.exceptions import BusinessRuleError
            raise BusinessRuleError("Capacity must be at least 1.", code="invalid_capacity")
        s = PlatformSettings.current()
        s.group_capacity = capacity
        s.save(update_fields=["group_capacity", "updated_at"])

        # Lowering capacity never retroactively splits a group that's already booked
        # (those sessions run as-is); surface how many existing upcoming groups now
        # exceed the new limit so the admin knows what they're changing.
        groups_over = (
            Booking.objects.filter(status=BookingStatus.UPCOMING, deleted_at__isnull=True)
            .values("instructor_id", "scheduled_at")
            .annotate(n=Count("id"))
            .filter(n__gt=capacity)
            .count()
        )
        return {"groupCapacity": s.group_capacity, "groupsOverCapacity": groups_over}
