"""Existing recurring picks were auto-generating bookings before the admin review
gate existed — grandfather them in as APPROVED so nothing stops working on deploy.
New picks created after this migration default to PENDING."""
from django.db import migrations


def approve_existing(apps, schema_editor):
    StudentScheduleSlot = apps.get_model("scheduling", "StudentScheduleSlot")
    StudentScheduleSlot.objects.filter(active=True, deleted_at__isnull=True).update(
        review_status="approved"
    )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("scheduling", "0007_studentscheduleslot_review_note_and_more"),
    ]
    operations = [migrations.RunPython(approve_existing, noop)]
