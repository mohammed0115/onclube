"""Account command use cases — registration, profile, password change/reset, invite."""
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from apps.accounts.models import InstructorProfile, StudentProfile, User
from apps.common.enums import UserRole
from apps.common.exceptions import BusinessRuleError
from application import mappers
from application.permissions import ensure_admin
from domain import events as domain_events
from domain.dtos import UserProfileResult
from domain.exceptions import EmailAlreadyRegistered, PermissionDenied
from infrastructure.container import default_event_bus


def _build_token_link(user, path) -> str:
    """A signed, one-time (invalidates on password change) reset/set link."""
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    base = settings.FRONTEND_URL.rstrip("/")
    return f"{base}/{path.lstrip('/')}?uid={uid}&token={token}"


def _resolve_token_user(uidb64, token):
    """Return the user iff the uid decodes and the token is valid, else None."""
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return None
    return user if default_token_generator.check_token(user, token) else None


class RequestPasswordResetUseCase:
    """Email a reset link. Always succeeds (never leaks whether an email exists)."""

    def execute(self, *, email) -> dict:
        email_norm = (email or "").strip().lower()
        user = User.objects.filter(email=email_norm, is_active=True).first()
        if user:
            link = _build_token_link(user, "reset-password")
            send_mail(
                subject="Reset your OneClup password",
                message=f"Use this link to reset your password:\n\n{link}\n\nIf you didn't request this, ignore this email.",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=True,
            )
        return {"sent": True}


class ConfirmPasswordResetUseCase:
    """Set a new password from a valid uid+token (also activates invited users)."""

    def execute(self, *, uid, token, new_password) -> dict:
        user = _resolve_token_user(uid, token)
        if user is None:
            raise BusinessRuleError("This link is invalid or has expired.", code="invalid_reset_token")
        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as exc:
            raise BusinessRuleError(" ".join(exc.messages), code="weak_password")
        user.set_password(new_password)
        if not user.is_active:
            user.is_active = True
        user.save(update_fields=["password", "is_active", "updated_at"])
        return {"reset": True}


class InviteUserUseCase:
    """Admin creates a user (instructor/admin) and emails a set-password link. The
    account starts inactive with an unusable password until the invitee sets one."""

    @transaction.atomic
    def execute(self, *, actor, full_name, email, role) -> dict:
        ensure_admin(actor)
        if role not in (UserRole.INSTRUCTOR, UserRole.ADMIN, UserRole.STUDENT):
            raise BusinessRuleError("Unknown role.", code="invalid_role")
        email_norm = (email or "").strip().lower()
        if User.objects.filter(email=email_norm).exists():
            raise EmailAlreadyRegistered()
        user = User(email=email_norm, full_name=full_name, role=role, is_active=False)
        user.set_unusable_password()
        user.save()
        if role == UserRole.INSTRUCTOR:
            initials = "".join(w[0] for w in full_name.split()[:2]).upper() or "IN"
            InstructorProfile.objects.create(user=user, initials=initials)
        elif role == UserRole.STUDENT:
            StudentProfile.objects.create(user=user)
        link = _build_token_link(user, "set-password")
        send_mail(
            subject="You're invited to OneClup — set your password",
            message=f"You've been invited to OneClup as a {role}. Set your password to get started:\n\n{link}",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )
        return {"userId": str(user.id), "email": user.email, "role": role, "inviteLink": link}


class RegisterStudentUseCase:
    """Public — creates a student User + StudentProfile. No tokens issued here."""

    def __init__(self, *, events=None):
        self.events = events or default_event_bus()

    @transaction.atomic
    def execute(self, *, actor=None, full_name, email, password) -> UserProfileResult:
        email_norm = (email or "").strip().lower()
        if User.objects.filter(email=email_norm).exists():
            raise EmailAlreadyRegistered()
        try:
            user = User.objects.create_user(
                email=email_norm,
                password=password,
                full_name=full_name,
                role=UserRole.STUDENT,
            )
        except IntegrityError:  # unique race backstop
            raise EmailAlreadyRegistered()

        student = StudentProfile.objects.create(user=user)
        self.events.publish(
            domain_events.StudentRegistered(user_id=str(user.id), student_id=str(student.id))
        )
        return mappers.user_profile(user, student=student)


class ChangePasswordUseCase:
    """Any authenticated user changes their own password (verifies the current one
    and runs Django's password validators on the new one)."""

    def execute(self, *, actor, current_password, new_password) -> dict:
        if actor is None:
            raise PermissionDenied()
        if not actor.check_password(current_password or ""):
            raise BusinessRuleError("Current password is incorrect.", code="invalid_current_password")
        try:
            validate_password(new_password, user=actor)
        except DjangoValidationError as exc:
            raise BusinessRuleError(" ".join(exc.messages), code="weak_password")
        actor.set_password(new_password)
        actor.save(update_fields=["password", "updated_at"])
        return {"changed": True}


class UpdateCurrentProfileUseCase:
    """The authenticated actor updates their own display name."""

    def execute(self, *, actor, full_name=None) -> UserProfileResult:
        if actor is None:
            raise PermissionDenied()
        if full_name is not None:
            actor.full_name = full_name
            actor.save(update_fields=["full_name", "updated_at"])
        student = getattr(actor, "student_profile", None)
        instructor = getattr(actor, "instructor_profile", None)
        return mappers.user_profile(actor, student=student, instructor=instructor)
