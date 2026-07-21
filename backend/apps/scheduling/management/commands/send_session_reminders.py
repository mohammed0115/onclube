"""
Send timed session reminders (Product Bible, stage 11): 24h / 1h / 10min before a
session. Idempotent — each band fires at most once per booking. Meant to run on a
short schedule (e.g. every 5 minutes) via cron / Celery beat:

    */5 * * * *  python manage.py send_session_reminders
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.common.enums import BookingStatus, NotificationType
from apps.notifications.models import Notification
from apps.scheduling.models import Booking

# (kind, upper bound, lower bound): fire when lower < time_until <= upper, so a
# last-minute booking only gets the reminders that still make sense.
BANDS = [
    ("24h", timedelta(hours=24), timedelta(hours=1)),
    ("1h", timedelta(hours=1), timedelta(minutes=10)),
    ("10min", timedelta(minutes=10), timedelta(0)),
]

_LABEL = {"24h": "in 24 hours", "1h": "in 1 hour", "10min": "in 10 minutes"}


def _already_sent(booking, kind) -> bool:
    return Notification.objects.filter(
        type=NotificationType.SESSION_REMINDER,
        user=booking.student.user,
        data__booking_id=str(booking.pk),
        data__kind=kind,
    ).exists()


def send_due_reminders(now=None) -> int:
    """Create any due reminders. Returns the number sent. Pure-ish (only clock +
    DB); safe to call from a command or a test."""
    now = now or timezone.now()
    horizon = now + timedelta(hours=24)
    bookings = (
        Booking.objects.filter(
            status=BookingStatus.UPCOMING,
            scheduled_at__gt=now,
            scheduled_at__lte=horizon,
        )
        .select_related("student__user")
    )
    sent = 0
    for booking in bookings:
        time_until = booking.scheduled_at - now
        for kind, upper, lower in BANDS:
            if lower < time_until <= upper and not _already_sent(booking, kind):
                # Use a neutral label, not topic_title: it's empty for availability-
                # first bookings before prep, and it snapshots the lesson title, which
                # must not leak in a 24h reminder (before the ~1h reveal window).
                Notification.objects.create(
                    user=booking.student.user,
                    type=NotificationType.SESSION_REMINDER,
                    title="⏰ Session reminder",
                    body=f"Your session with {booking.instructor_name} starts "
                    f"{_LABEL[kind]} ({booking.scheduled_at:%b %d, %H:%M}).",
                    data={"booking_id": str(booking.pk), "kind": kind},
                )
                sent += 1
                break  # one band per booking per run
    return sent


class Command(BaseCommand):
    help = "Send due 24h / 1h / 10min session reminders (idempotent)."

    def handle(self, *args, **opts):
        sent = send_due_reminders()
        self.stdout.write(self.style.SUCCESS(f"send_session_reminders: {sent} reminder(s) sent"))
