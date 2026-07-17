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
