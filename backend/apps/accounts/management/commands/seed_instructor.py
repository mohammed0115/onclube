"""
Create (or update) an instructor user — idempotent.

Usage:
    python manage.py seed_instructor
    python manage.py seed_instructor --email hascodaw121@gmail.com --password 'S3cret!' --name "Hasco Instructor"
    python manage.py seed_instructor --reset-password        # reset an existing instructor's password

Defaults can come from env (INSTRUCTOR_EMAIL / INSTRUCTOR_PASSWORD / INSTRUCTOR_NAME).
Creates the User (role=INSTRUCTOR, active) and an InstructorProfile so the account
can teach immediately. The instructor logs in via POST /api/v1/auth/token/.
"""
import os

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import User, InstructorProfile
from apps.common.enums import UserRole, UserStatus


def _initials(name: str) -> str:
    parts = [w for w in (name or "").split() if w]
    return ("".join(w[0] for w in parts[:2]).upper() or "IN")[:2]


class Command(BaseCommand):
    help = "Create or update an instructor user + profile (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--email", default=os.environ.get("INSTRUCTOR_EMAIL", "hascodaw121@gmail.com"))
        parser.add_argument("--password", default=os.environ.get("INSTRUCTOR_PASSWORD", "Instructor@12345"))
        parser.add_argument("--name", default=os.environ.get("INSTRUCTOR_NAME", "Hasco Instructor"))
        parser.add_argument(
            "--reset-password",
            action="store_true",
            help="Reset the password even if the instructor already exists.",
        )

    @transaction.atomic
    def handle(self, *args, **opts):
        email = opts["email"].strip().lower()
        password = opts["password"]
        name = opts["name"]

        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "full_name": name,
                "role": UserRole.INSTRUCTOR,
                "status": UserStatus.ACTIVE,
                "is_staff": False,
                "is_superuser": False,
                "is_active": True,
            },
        )

        changed = []
        if not created:
            if user.role != UserRole.INSTRUCTOR:
                user.role = UserRole.INSTRUCTOR
                changed.append("role")
            if user.status != UserStatus.ACTIVE:
                user.status = UserStatus.ACTIVE
                changed.append("status")
            if not user.is_active:
                user.is_active = True
                changed.append("is_active")

        if created or opts["reset_password"]:
            user.set_password(password)
            changed.append("password")

        user.save()

        profile, p_created = InstructorProfile.objects.get_or_create(
            user=user, defaults={"initials": _initials(name)}
        )

        if created:
            self.stdout.write(self.style.SUCCESS(f"Created instructor {email} (password set)."))
        else:
            note = f" (updated: {', '.join(changed)})" if changed else " (no changes)"
            self.stdout.write(self.style.SUCCESS(f"Instructor {email} already existed{note}."))
        self.stdout.write(
            f"  profile: {'created' if p_created else 'exists'} · role={user.role} · active={user.is_active}"
        )
