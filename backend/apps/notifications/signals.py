"""
Transactional email side-effect for notifications.

Every in-app Notification also emails the user when NOTIFICATION_EMAILS_ENABLED is
on and they have an address. Centralising this on the model's post_save means the
many call sites that create notifications (booking, billing, AI reports) all get
email for free without being touched.

Sending is best-effort (fail_silently) so a mail outage never breaks the request.
It runs synchronously today; a production deployment with volume should move the
actual send onto a background queue (Celery/RQ) — the hook point stays the same.
"""
import logging

from django.conf import settings
from django.core.mail import send_mail
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Notification

logger = logging.getLogger("observability")


@receiver(post_save, sender=Notification, dispatch_uid="notification_email")
def email_on_notification(sender, instance, created, **kwargs):
    if not created or not getattr(settings, "NOTIFICATION_EMAILS_ENABLED", False):
        return
    email = getattr(instance.user, "email", None)
    if not email:
        return
    try:
        send_mail(
            subject=instance.title,
            message=instance.body or instance.title,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=True,
        )
    except Exception:  # never let email break the originating request
        logger.warning("notification email failed", extra={"meta": {"notification_id": str(instance.id)}})
