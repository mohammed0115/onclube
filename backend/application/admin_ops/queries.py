"""Admin query use cases (read-only). Admin-only by construction."""
from apps.common.enums import PaymentProofStatus
from application import mappers
from application.permissions import ensure_admin
from domain.dtos import AdminDashboardResult
from infrastructure.container import (
    default_payment_repository,
    default_subscription_repository,
    default_user_repository,
)
from apps.common.enums import UserRole


class ListAdminSessionsUseCase:
    """All live sessions across the platform for the operations monitor."""

    def execute(self, *, actor):
        from apps.sessions.models import Session
        ensure_admin(actor)
        sessions = (
            Session.objects.select_related(
                "booking__student__user", "booking__instructor__user"
            )
            .order_by("-booking__scheduled_at")[:150]
        )
        rows = []
        for s in sessions:
            b = s.booking
            rows.append({
                "id": str(s.id),
                "topicTitle": b.topic_title,
                "instructorName": b.instructor_name,
                "studentName": b.student.user.full_name,
                "scheduledAt": b.scheduled_at.isoformat(),
                "durationMinutes": b.duration_minutes,
                "status": s.status,
            })
        return rows


class ListUsersUseCase:
    """All users for the admin members table."""

    def execute(self, *, actor, role=None):
        from apps.accounts.models import User
        ensure_admin(actor)
        qs = User.objects.all().order_by("role", "email")
        if role:
            qs = qs.filter(role=role)
        return [
            {
                "id": str(u.pk),
                "fullName": u.full_name,
                "email": u.email,
                "role": u.role,
                "status": u.status,
            }
            for u in qs
        ]


class ListAuditLogUseCase:
    """Append-only admin audit log (most recent first)."""

    def execute(self, *, actor):
        from apps.admin_ops.models import AdminAction
        ensure_admin(actor)
        return [
            {
                "id": str(a.id),
                "admin": a.admin.full_name if a.admin_id else "—",
                "action": a.action_type,
                "targetTable": a.target_table,
                "targetId": str(a.target_id),
                "reason": a.reason or "",
                "when": a.created_at.isoformat(),
            }
            for a in AdminAction.objects.select_related("admin").order_by("-created_at")[:100]
        ]


class ListAdminPaymentApprovalsUseCase:
    """The admin approval queue (pending proofs)."""

    def __init__(self, *, payments=None):
        self.payments = payments or default_payment_repository()

    def execute(self, *, actor) -> list:
        ensure_admin(actor)
        pending = self.payments.list_by_status(PaymentProofStatus.PENDING)
        return [mappers.payment_approval_item(p) for p in pending]


class GetAdminDashboardUseCase:
    def __init__(self, *, payments=None, subscriptions=None, users=None):
        self.payments = payments or default_payment_repository()
        self.subscriptions = subscriptions or default_subscription_repository()
        self.users = users or default_user_repository()

    def execute(self, *, actor) -> AdminDashboardResult:
        ensure_admin(actor)
        pending = self.payments.list_by_status(PaymentProofStatus.PENDING)
        approved = self.payments.list_by_status(PaymentProofStatus.APPROVED)
        revenue = sum((p.amount for p in approved), 0)
        currency = approved[0].currency if approved else "SDG"

        recent_activity = [
            {
                "actor": p.student.user.full_name,
                "action": f"submitted payment {p.transaction_number}",
                "when": p.submitted_at,
            }
            for p in pending[:5]
        ]

        # ── Operations "Today's overview" + alerts ──────────────────────────
        from django.utils import timezone
        from apps.common.enums import AIReportStatus, BookingStatus
        from apps.ai_reports.models import AIReport
        from apps.scheduling.models import Booking

        today = timezone.now().date()
        total_students = self.users.count_by_role(UserRole.STUDENT)
        sessions_today = Booking.objects.filter(scheduled_at__date=today).exclude(
            status=BookingStatus.CANCELLED
        ).count()
        reports_waiting = AIReport.objects.filter(status=AIReportStatus.PENDING).count()
        reports_failed = AIReport.objects.filter(status=AIReportStatus.FAILED).count()

        alerts = []
        if pending:
            alerts.append({"severity": "warning", "message": f"{len(pending)} payment(s) awaiting review", "to": "/admin/payments"})
        if reports_failed:
            alerts.append({"severity": "error", "message": f"{reports_failed} AI report(s) failed", "to": None})
        if reports_waiting:
            alerts.append({"severity": "info", "message": f"{reports_waiting} AI report(s) pending", "to": None})

        return AdminDashboardResult(
            pending_payments=len(pending),
            active_members=self.subscriptions.count_active(),
            instructors=self.users.count_by_role(UserRole.INSTRUCTOR),
            revenue=revenue,
            currency=currency,
            pending_proofs=[mappers.payment_approval_item(p) for p in pending[:10]],
            recent_activity=recent_activity,
            total_students=total_students,
            sessions_today=sessions_today,
            reports_waiting=reports_waiting,
            system_status="healthy",
            alerts=alerts,
        )
