"""
Create (or update) an admin user — idempotent.

Usage:
    python manage.py seed_admin
    python manage.py seed_admin --email ops@oneclub.app --password 'S3cret!' --name "Ops Admin"
    python manage.py seed_admin --reset-password      # reset an existing admin's password

Defaults come from env (ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME) so production can
inject secrets without touching code. The admin can log in via the JWT endpoint
(POST /api/v1/auth/token/ with the email + password) and reach the admin pages.
"""
import os

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import User
from apps.common.enums import UserRole, UserStatus


class Command(BaseCommand):
    help = "Create or update an admin user (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--email", default=os.environ.get("ADMIN_EMAIL", "admin@oneclub.local"))
        parser.add_argument("--password", default=os.environ.get("ADMIN_PASSWORD", "Admin@12345"))
        parser.add_argument("--name", default=os.environ.get("ADMIN_NAME", "OneClub Admin"))
        parser.add_argument(
            "--reset-password",
            action="store_true",
            help="Reset the password even if the admin already exists.",
        )

    @transaction.atomic
    def handle(self, *args, **opts):
        email = opts["email"].strip().lower()
        password = opts["password"]

        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "full_name": opts["name"],
                "role": UserRole.ADMIN,
                "status": UserStatus.ACTIVE,
                "is_staff": True,
                "is_superuser": True,
                "is_active": True,
            },
        )

        changed = []
        if not created:
            # Ensure an existing account is a fully-privileged, active admin.
            if user.role != UserRole.ADMIN:
                user.role = UserRole.ADMIN
                changed.append("role")
            if not user.is_staff:
                user.is_staff = True
                changed.append("is_staff")
            if not user.is_superuser:
                user.is_superuser = True
                changed.append("is_superuser")
            if not user.is_active:
                user.is_active = True
                changed.append("is_active")

        if created or opts["reset_password"]:
            user.set_password(password)
            changed.append("password")

        if changed:
            user.save()

        verb = "created" if created else ("updated" if changed else "unchanged")
        self.stdout.write(
            self.style.SUCCESS(
                f"Admin {verb}: {email} (role={user.role}, staff={user.is_staff}, "
                f"superuser={user.is_superuser})"
            )
        )
        if created or opts["reset_password"]:
            self.stdout.write(f"  password: {password}")
        else:
            self.stdout.write("  password: unchanged (use --reset-password to set it)")
