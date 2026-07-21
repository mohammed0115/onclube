"""
Rolling booking generation. Materialises upcoming bookings from every student's
APPROVED weekly schedule, extending the horizon as time passes so students always
have their next couple of weeks booked. Idempotent (never double-books) and stops
per-student the moment their credits run out. Meant to run on a schedule (e.g.
hourly) via cron / the scheduler container:

    0 * * * *  python manage.py generate_recurring_bookings
"""
from django.core.management.base import BaseCommand

from apps.accounts.models import StudentProfile
from apps.common.enums import ScheduleReviewStatus
from apps.scheduling.models import StudentScheduleSlot
from apps.scheduling.services import generate_bookings_from_schedule


def generate_all(now=None) -> dict:
    """Run generation for every student who has at least one approved active pick.
    Returns a summary dict. Safe to call from a command or a test."""
    student_ids = (
        StudentScheduleSlot.objects.filter(
            active=True,
            deleted_at__isnull=True,
            review_status=ScheduleReviewStatus.APPROVED,
        )
        .values_list("student_id", flat=True)
        .distinct()
    )
    total_created = 0
    students = 0
    for sid in student_ids:
        student = StudentProfile.objects.select_related("user").filter(pk=sid).first()
        if student is None:
            continue
        result = generate_bookings_from_schedule(student, now=now)
        total_created += len(result["created"])
        students += 1
    return {"students": students, "created": total_created}


class Command(BaseCommand):
    help = "Roll the recurring schedule forward: generate upcoming bookings for all approved schedules."

    def handle(self, *args, **opts):
        r = generate_all()
        self.stdout.write(self.style.SUCCESS(
            f"generate_recurring_bookings: {r['created']} booking(s) across {r['students']} student(s)"
        ))
